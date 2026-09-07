// Uses a fresh, isolated database on the configured test MongoDB deployment.
// Never points models at the application's database or calls bank providers.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const dbName = `du_developer_test_${crypto.randomBytes(8).toString('hex')}`;
if (!process.env.DEVELOPER_TEST_MONGO_URI) throw new Error('Set DEVELOPER_TEST_MONGO_URI to a MongoDB replica set');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
let providerStatus = 'VALID';
let providerCalls = 0;
const providerPath = require.resolve('../src/services/veritas');
require.cache[providerPath] = { id: providerPath, filename: providerPath, loaded: true, exports: {
  verifyReceipt: async () => { providerCalls++; await new Promise(r => setTimeout(r, 30)); return { classification: { status: providerStatus }, body: { success: providerStatus === 'VALID', amount: 100 } }; },
} };
const User = require('../src/models/User');
const Developer = require('../src/models/Developer');
const Key = require('../src/models/DeveloperKey');
const Request = require('../src/models/DeveloperRequest');
const Settings = require('../src/models/DeveloperSettings');
const Platform = require('../src/models/PlatformSettings');
const Ledger = require('../src/models/BillingLedger');
const Audit = require('../src/models/AdminAction');
const app = express();
app.use(express.json());
app.use('/api/developer', require('../src/routes/developer'));
let server;
async function main() {
  await mongoose.connect(process.env.DEVELOPER_TEST_MONGO_URI, { dbName, serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
  console.log('Connected to isolated test database');
  await Promise.all([User, Developer, Key, Request, Settings, Platform, Ledger, Audit].map(m => m.init()));
  await Platform.getOrCreate();
  const owner = await User.create({ businessName: 'Test', ownerName: 'Test', phone: 'test-owner', password: 'not-a-login', isVerified: true, role: 'owner', duptBalance: 5 });
  const other = await User.create({ businessName: 'Other', ownerName: 'Other', phone: 'test-other', password: 'not-a-login', isVerified: true, role: 'owner' });
  const admin = await User.create({ businessName: 'Admin', ownerName: 'Admin', phone: 'test-admin', password: 'not-a-login', isVerified: true, role: 'admin' });
  const token = u => jwt.sign({ sub: u._id.toString() }, process.env.JWT_SECRET);
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/developer`;
  async function call(path, auth, body, method = 'POST', idem) {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(idem ? { 'Idempotency-Key': idem } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, data: await r.json() };
  }
  assert.equal((await call('/keys', token(owner), { name: 'Test' })).status, 403);
  assert.equal((await call('/enroll', token(owner), { applicationName: 'Integration test' })).status, 200);
  const created = await call('/keys', token(owner), { name: 'Test key' });
  assert.equal(created.status, 201);
  const secret = created.data.secret;
  assert.match(secret, /^du_live_[a-f0-9]{64}$/);
  const stored = await Key.findById(created.data.id).select('+hash');
  assert.notEqual(stored.hash, secret);
  assert.equal(JSON.stringify((await call('/me', token(owner), undefined, 'GET')).data).includes(secret), false);
  assert.equal((await call('/admin/accounts', token(owner), undefined, 'GET')).status, 403);
  assert.equal((await call(`/keys/${created.data.id}`, token(other), undefined, 'DELETE')).status, 404);
  const payload = { provider: 'Telebirr', reference: 'TEST12345' };
  assert.equal((await call('/v1/verify', secret, payload)).status, 400);
  const first = await call('/v1/verify', secret, payload, 'POST', 'test_order_1');
  assert.equal(first.status, 200); assert.equal(first.data.charged, 1);
  assert.equal((await call('/v1/verify', secret, payload, 'POST', 'test_order_1')).data.requestId, first.data.requestId);
  assert.equal(providerCalls, 1);
  assert.equal((await call('/v1/verify', secret, { ...payload, reference: 'DIFFERENT' }, 'POST', 'test_order_1')).status, 409);
  assert.equal((await User.findById(owner._id)).duptBalance, 4);
  providerStatus = 'PROVIDER_UNAVAILABLE';
  assert.equal((await call('/v1/verify', secret, payload, 'POST', 'test_outage_1')).data.charged, 0);
  assert.equal((await User.findById(owner._id)).duptBalance, 4);
  providerStatus = 'VALID';
  const concurrent = await Promise.all([call('/v1/verify', secret, payload, 'POST', 'test_concurrent_1'), call('/v1/verify', secret, payload, 'POST', 'test_concurrent_1')]);
  assert(concurrent.some(r => r.status === 200));
  assert.equal(await Request.countDocuments({ userId: owner._id, idempotencyKey: 'test_concurrent_1' }), 1);
  assert.equal((await User.findById(owner._id)).duptBalance, 3);
  assert.equal((await call(`/admin/accounts/${owner._id}/balance`, token(admin), { amount: 10, reason: 'Test credit' })).status, 200);
  assert.equal((await User.findById(owner._id)).duptBalance, 13);
  assert.equal((await call(`/admin/accounts/${owner._id}/balance`, token(admin), { amount: -99, reason: 'Test debit' })).status, 400);
  await User.updateOne({ _id: owner._id }, { $set: { duptBalance: 1 } });
  await Promise.all([call('/v1/verify', secret, payload, 'POST', 'last_credit_1'), call('/v1/verify', secret, payload, 'POST', 'last_credit_2')]);
  assert.equal((await User.findById(owner._id)).duptBalance, 0);
  assert.equal((await call('/v1/verify', secret, payload, 'POST', 'empty_balance_1')).status, 402);
  assert.equal((await call(`/admin/accounts/${owner._id}`, token(admin), { enabled: false, reason: 'Test suspension' }, 'PATCH')).status, 200);
  assert.equal((await call('/v1/balance', secret, undefined, 'GET')).status, 403);
  await call(`/admin/accounts/${owner._id}`, token(admin), { enabled: true, reason: 'Test reactivation' }, 'PATCH');
  await call(`/keys/${created.data.id}`, token(owner), undefined, 'DELETE');
  assert.equal((await call('/v1/balance', secret, undefined, 'GET')).status, 401);
  console.log('PASS: enrollment, hashed keys, tenant isolation, admin authorization, billing, replay, concurrency, insufficient funds, outage, suspension, revocation');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(r => server.close(r));
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
