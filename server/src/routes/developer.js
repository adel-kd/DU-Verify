const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const Developer = require('../models/Developer');
const Key = require('../models/DeveloperKey');
const Request = require('../models/DeveloperRequest');
const Settings = require('../models/DeveloperSettings');
const Platform = require('../models/PlatformSettings');
const Ledger = require('../models/BillingLedger');
const Audit = require('../models/AdminAction');
const { verifyReceipt } = require('../services/veritas');
const router = express.Router();
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const providers = ['CBE', 'Telebirr', 'Dashen', 'Abyssinia', 'CBEBirr', 'MPesa', 'Awash'];
const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.get('/config', wrap(async (req, res) => {
  const settings = await Settings.current();
  const platform = await Platform.getOrCreate();
  res.json({ settings, providers: providers.filter(p => platform.providerEnabled[p] !== false) });
}));

async function apiAuth(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!/^du_live_[a-f0-9]{64}$/.test(token)) throw fail(401, 'Supply your API key as Authorization: Bearer du_live_...');
  const key = await Key.findOne({ hash: digest(token), revokedAt: null, expiresAt: { $gt: new Date() } });
  if (!key) throw fail(401, 'Invalid, expired, or revoked API key');
  const [user, developer, settings] = await Promise.all([User.findById(key.userId), Developer.findOne({ userId: key.userId }), Settings.current()]);
  if (!user?.isActive || !user.isVerified || user.role !== 'owner' || !developer?.enabled) throw fail(403, 'Developer account is disabled or unverified');
  if (!settings.enabled) throw fail(503, 'Developer API is temporarily paused');
  req.developerUser = user;
  req.apiKey = key;
  req.apiSettings = settings;
  next();
}

router.get('/v1/balance', wrap(apiAuth), (req, res) => res.json({ balance: req.developerUser.duptBalance, currency: 'DU_PT', costPerCall: req.apiSettings.cost }));
router.post('/v1/verify', wrap(apiAuth), wrap(async (req, res) => {
  const user = req.developerUser;
  const idempotencyKey = req.get('Idempotency-Key');
  if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) throw fail(400, 'Idempotency-Key must contain 8-100 letters, digits, underscores or hyphens');
  const { provider, reference, accountSuffix = '', phoneNumber = '' } = req.body || {};
  if (!providers.includes(provider) || typeof reference !== 'string' || !reference.trim() || reference.length > 300) throw fail(400, 'Provide a supported provider and a reference (maximum 300 characters)');
  if (typeof accountSuffix !== 'string' || !/^\d{0,20}$/.test(accountSuffix) || typeof phoneNumber !== 'string' || !/^\+?\d{0,15}$/.test(phoneNumber)) throw fail(400, 'Invalid accountSuffix or phoneNumber');
  const payload = { provider, reference: reference.trim(), accountSuffix, phoneNumber };
  if (/^https?:/i.test(payload.reference)) {
    const hosts = { CBE: ['mbreciept.cbe.com.et', 'mb.cbe.com.et', 'apps.cbe.com.et'], Dashen: ['receipt.dashensuperapp.com'], Abyssinia: ['cs.bankofabyssinia.com'], Awash: ['awashpay.awashbank.com'] };
    let url;
    try { url = new URL(payload.reference); } catch { throw fail(400, 'Invalid receipt URL'); }
    if (url.protocol !== 'https:' || url.username || url.password || !hosts[provider]?.includes(url.hostname) || (url.port && !['443', '100', '8225'].includes(url.port))) throw fail(400, 'Use an official HTTPS receipt URL for the selected provider');
  } else if (!/^[A-Za-z0-9_-]{4,150}$/.test(payload.reference)) throw fail(400, 'Invalid transaction reference');
  if (provider === 'CBEBirr' && !phoneNumber) throw fail(400, 'phoneNumber is required for CBE Birr');
  if (provider === 'Abyssinia' && !/^\d{5}$/.test(accountSuffix)) throw fail(400, 'Abyssinia requires the last 5 receiving account digits as accountSuffix');
  if (provider === 'CBE' && /^FT/i.test(payload.reference) && !/^\d{8}$/.test(accountSuffix)) throw fail(400, 'Legacy CBE references require the last 8 receiving account digits as accountSuffix');
  const fingerprint = digest(JSON.stringify(payload));
  const existing = await Request.findOne({ userId: user._id, idempotencyKey });
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw fail(409, 'This Idempotency-Key belongs to a different request');
    if (existing.state === 'pending') throw fail(409, 'Request is still processing. Retry with the same Idempotency-Key');
    res.setHeader('Idempotency-Replayed', 'true');
    return res.status(existing.httpStatus).json(existing.response);
  }
  const platform = await Platform.getOrCreate();
  if (platform.providerEnabled[provider] === false) throw fail(503, 'Provider temporarily disabled');
  if (user.duptBalance < req.apiSettings.cost) throw fail(402, 'Insufficient DU PT. Top up in your developer portal');
  // This persistent rolling limit survives restarts; a per-account transaction
  // below serializes admission so concurrent keys cannot bypass the limit.
  let record;
  await mongoose.connection.transaction(async session => {
    await Developer.updateOne({ userId: user._id }, { $inc: { admissionCounter: 1 } }, { session });
    const count = await Request.countDocuments({ userId: user._id, createdAt: { $gt: new Date(Date.now() - 60000) } }).session(session);
    if (count >= req.apiSettings.requestsPerMinute) throw fail(429, 'Rate limit reached. Wait 60 seconds before retrying');
    [record] = await Request.create([{ userId: user._id, keyId: req.apiKey._id, idempotencyKey, fingerprint, provider, cost: req.apiSettings.cost }], { session });
  });
  let result;
  try {
    result = await verifyReceipt({ bankName: provider, reference: payload.reference, accountSuffix, phoneNumber });
  } catch {
    result = { classification: { status: 'PROVIDER_UNAVAILABLE' } };
  }
  const status = result.classification?.status || 'PROVIDER_UNAVAILABLE';
  const billable = status === 'VALID' || status === 'NOT_VERIFIED';
  let response;
  let httpStatus = billable ? 200 : 503;
  await mongoose.connection.transaction(async session => {
    const pending = await Request.findOne({ _id: record._id, state: 'pending' }).session(session);
    if (!pending) throw fail(409, 'Request was resolved by support; retry with the same Idempotency-Key');
    let charged = 0;
    if (billable) {
      const before = await User.findOneAndUpdate({ _id: user._id, duptBalance: { $gte: record.cost }, isActive: true }, { $inc: { duptBalance: -record.cost } }, { session });
      if (!before) {
        httpStatus = 402;
      } else {
        charged = record.cost;
        await Ledger.create([{ businessId: user._id, userId: user._id, type: 'VERIFICATION_CHARGE', duptAmount: -charged, balanceBefore: before.duptBalance, balanceAfter: before.duptBalance - charged, internalTxRef: `api:${record._id}`, reason: `Developer API ${provider}` }], { session });
      }
    }
    response = { requestId: record._id.toString(), status: httpStatus === 402 ? 'INSUFFICIENT_BALANCE' : status, charged, currency: 'DU_PT', provider, reference: payload.reference, message: httpStatus === 402 ? 'Insufficient balance; top up and submit a new request.' : billable ? 'Provider lookup complete. Match receiver and amount before accepting payment; this lookup does not prevent payment reuse.' : 'Please try again. No charge was applied.', ...(billable && charged ? { receipt: result.body } : {}) };
    await Request.updateOne({ _id: record._id, state: 'pending' }, { $set: { state: 'complete', response, httpStatus, charged } }, { session });
  });
  return res.status(httpStatus).json(response);
}));

router.use(requireAuth);
router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.use((req, res, next) => {
  if (req.user.role !== 'admin' && (req.user.role !== 'owner' || !req.user.isVerified || !req.user.profileComplete)) return res.status(403).json({ error: 'Sign up, verify your email and complete your owner profile first' });
  next();
});
router.post('/enroll', wrap(async (req, res) => {
  if (req.user.role !== 'owner') throw fail(403, 'Use an owner account to enroll');
  const settings = await Settings.current();
  if (!settings.signupEnabled) throw fail(403, 'Developer signup is paused');
  const name = String(req.body.applicationName || '').trim();
  if (!name || name.length > 100) throw fail(400, 'Application name is required (maximum 100 characters)');
  const profile = await Developer.findOneAndUpdate({ userId: req.user._id }, { $setOnInsert: { applicationName: name, userId: req.user._id } }, { upsert: true, new: true });
  res.json({ profile });
}));
router.get('/me', wrap(async (req, res) => {
  const [profile, keys, requests] = await Promise.all([Developer.findOne({ userId: req.user._id }), Key.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50), Request.find({ userId: req.user._id }).select('-response -fingerprint -idempotencyKey').sort({ createdAt: -1 }).limit(50)]);
  res.json({ profile, keys, requests, balance: req.user.duptBalance });
}));
router.post('/keys', wrap(async (req, res) => {
  const settings = await Settings.current();
  const name = String(req.body.name || '').trim();
  if (!name || name.length > 80) throw fail(400, 'Key name is required (maximum 80 characters)');
  const secret = `du_live_${crypto.randomBytes(32).toString('hex')}`;
  let key;
  await mongoose.connection.transaction(async session => {
    const profile = await Developer.findOneAndUpdate({ userId: req.user._id, enabled: true }, { $inc: { admissionCounter: 1 } }, { session });
    if (!profile || !settings.enabled) throw fail(403, 'Enroll in an active developer account first');
    if (await Key.countDocuments({ userId: req.user._id, revokedAt: null, expiresAt: { $gt: new Date() } }).session(session) >= settings.maxKeys) throw fail(400, 'Active key limit reached. Revoke an existing key first');
    [key] = await Key.create([{ userId: req.user._id, name, hash: digest(secret), prefix: secret.slice(0, 16), expiresAt: new Date(Date.now() + 90 * 86400000) }], { session });
  });
  res.status(201).json({ secret, id: key._id, expiresAt: key.expiresAt });
}));
router.delete('/keys/:id', wrap(async (req, res) => {
  const key = await Key.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: { revokedAt: new Date() } });
  if (!key) throw fail(404, 'Key not found');
  res.json({ ok: true });
}));

router.use('/admin', (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Platform admin required' }));
router.get('/admin/accounts', wrap(async (req, res) => {
  const query = String(req.query.search || '').trim().slice(0, 100);
  const profiles = await Developer.find(query ? { applicationName: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}).sort({ createdAt: -1 }).limit(100).populate('userId', 'businessName email duptBalance isActive');
  res.json({ profiles, settings: await Settings.current() });
}));
router.patch('/admin/settings', wrap(async (req, res) => {
  const update = {};
  for (const field of ['enabled', 'signupEnabled']) if (typeof req.body[field] === 'boolean') update[field] = req.body[field];
  for (const [field, max] of [['cost', 1000], ['requestsPerMinute', 120], ['maxKeys', 10]]) {
    if (req.body[field] !== undefined) {
      if (!Number.isInteger(req.body[field]) || req.body[field] < 1 || req.body[field] > max) throw fail(400, `Invalid ${field}`);
      update[field] = req.body[field];
    }
  }
  await mongoose.connection.transaction(async session => {
    await Settings.updateOne({ _id: 'developer' }, { $set: update }, { upsert: true, session });
    await Audit.create([{ adminId: req.user._id, action: 'platform_settings_update', reason: `Developer API: ${JSON.stringify(update)}` }], { session });
  });
  res.json({ settings: await Settings.current() });
}));
router.patch('/admin/accounts/:id', wrap(async (req, res) => {
  const { enabled, reason } = req.body;
  if (typeof enabled !== 'boolean' || typeof reason !== 'string' || !reason.trim() || reason.length > 500) throw fail(400, 'Enabled and a reason are required');
  await mongoose.connection.transaction(async session => {
    const profile = await Developer.findOneAndUpdate({ userId: req.params.id }, { $set: { enabled } }, { session });
    if (!profile) throw fail(404, 'Developer not found');
    await Audit.create([{ adminId: req.user._id, businessId: profile.userId, action: enabled ? 'reactivate' : 'suspend', reason: `Developer API: ${reason}` }], { session });
  });
  res.json({ ok: true });
}));
router.post('/admin/accounts/:id/revoke', wrap(async (req, res) => {
  await mongoose.connection.transaction(async session => {
    await Key.updateMany({ userId: req.params.id, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
    await Audit.create([{ adminId: req.user._id, businessId: req.params.id, action: 'platform_settings_update', reason: 'Revoked all developer API keys' }], { session });
  });
  res.json({ ok: true });
}));
router.post('/admin/accounts/:id/balance', wrap(async (req, res) => {
  const { amount, reason } = req.body;
  if (!Number.isSafeInteger(amount) || !amount || Math.abs(amount) > 1000000 || typeof reason !== 'string' || !reason.trim() || reason.length > 500) throw fail(400, 'Provide an integer amount and a reason (maximum 500 characters)');
  await mongoose.connection.transaction(async session => {
    if (!await Developer.exists({ userId: req.params.id }).session(session)) throw fail(404, 'Developer not found');
    const before = await User.findOneAndUpdate({ _id: req.params.id, role: 'owner', duptBalance: { $gte: Math.max(0, -amount) } }, { $inc: { duptBalance: amount } }, { session });
    if (!before) throw fail(400, 'Account not found or insufficient balance');
    await Ledger.create([{ businessId: before._id, userId: req.user._id, type: amount > 0 ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT', duptAmount: amount, balanceBefore: before.duptBalance, balanceAfter: before.duptBalance + amount, reason }], { session });
    await Audit.create([{ adminId: req.user._id, businessId: before._id, action: amount > 0 ? 'balance_credit' : 'balance_debit', amount, reason }], { session });
  });
  res.json({ ok: true });
}));
router.get('/admin/accounts/:id/usage', wrap(async (req, res) => {
  const requests = await Request.find({ userId: req.params.id }).select('-response -fingerprint -idempotencyKey').sort({ createdAt: -1 }).limit(100);
  res.json({ requests });
}));
router.post('/admin/requests/:id/resolve', wrap(async (req, res) => {
  await mongoose.connection.transaction(async session => {
    const record = await Request.findOne({ _id: req.params.id, state: 'pending', createdAt: { $lt: new Date(Date.now() - 15 * 60000) } }).session(session);
    if (!record) throw fail(409, 'Only pending requests older than 15 minutes can be resolved');
    await Request.updateOne({ _id: record._id }, { $set: { state: 'complete', charged: 0, httpStatus: 503, response: { requestId: record._id.toString(), status: 'SITE_ERROR', charged: 0, message: 'Request interrupted. Please try again with a new Idempotency-Key.' } } }, { session });
    await Audit.create([{ adminId: req.user._id, businessId: record.userId, action: 'platform_settings_update', reason: `Resolved interrupted API request ${record._id} without charge` }], { session });
  });
  res.json({ ok: true });
}));
router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || (error.code === 11000 ? 409 : error.name === 'CastError' ? 400 : 500);
  if (status === 429) res.setHeader('Retry-After', '60');
  res.status(status).json({ error: status === 500 ? 'Please try again with the same Idempotency-Key. Contact support if this persists.' : error.code === 11000 ? 'Request already exists. Retry with the same Idempotency-Key.' : error.message });
});
module.exports = router;
