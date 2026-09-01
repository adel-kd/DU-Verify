const express = require("express");
const User = require("../models/User");
const Verification = require("../models/Verification");
const Topup = require("../models/Topup");
const AdminAction = require("../models/AdminAction");
const Package = require("../models/Package");
const BillingLedger = require("../models/BillingLedger");
const PaymentAccount = require("../models/PaymentAccount");
const PlatformSettings = require("../models/PlatformSettings");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/roleCheck");

const router = express.Router();

router.use(requireAuth, requireAdmin);

// GET /api/admin/overview - platform-wide totals
router.get("/overview", async (req, res) => {
  const [businessCount, verificationCounts, topupAgg] = await Promise.all([
    User.countDocuments({ role: "owner" }),
    Verification.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Topup.aggregate([
      { $match: { status: "success" } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
  ]);

  const byStatus = Object.fromEntries(verificationCounts.map((s) => [s._id, s.count]));
  const totalChecks = verificationCounts.reduce((sum, s) => sum + s.count, 0);
  const validChecks = byStatus.VALID || 0;

  res.json({
    businessCount,
    totalChecks,
    validChecks,
    failedChecks: totalChecks - validChecks,
    checksByStatus: byStatus,
    totalTopupAmount: topupAgg[0]?.total || 0,
    totalTopupCount: topupAgg[0]?.count || 0,
  });
});

// GET /api/admin/businesses - every business with quick stats, for the admin table
router.get("/businesses", async (req, res) => {
  const { search } = req.query;
  const filter = { role: "owner" };
  if (search) {
    filter.$or = [
      { businessName: new RegExp(search, "i") },
      { ownerName: new RegExp(search, "i") },
      { email: new RegExp(search, "i") },
      { phone: new RegExp(search, "i") },
    ];
  }

  const businesses = await User.find(filter)
    .select("businessName ownerName email phone duptBalance isActive lowBalanceThreshold createdAt")
    .sort({ createdAt: -1 })
    .lean();

  const businessIds = businesses.map((b) => b._id);
  const [checkCounts, topupTotals] = await Promise.all([
    Verification.aggregate([
      { $match: { businessId: { $in: businessIds } } },
      { $group: { _id: { businessId: "$businessId", status: "$status" }, count: { $sum: 1 } } },
    ]),
    Topup.aggregate([
      { $match: { businessId: { $in: businessIds }, status: "success" } },
      { $group: { _id: "$businessId", total: { $sum: "$amount" } } },
    ]),
  ]);

  const checksByBusiness = {};
  for (const row of checkCounts) {
    const id = String(row._id.businessId);
    checksByBusiness[id] = checksByBusiness[id] || { total: 0, valid: 0 };
    checksByBusiness[id].total += row.count;
    if (row._id.status === "VALID") checksByBusiness[id].valid += row.count;
  }
  const topupByBusiness = Object.fromEntries(topupTotals.map((t) => [String(t._id), t.total]));

  res.json({
    businesses: businesses.map((b) => ({
      ...b,
      totalChecks: checksByBusiness[b._id]?.total || 0,
      validChecks: checksByBusiness[b._id]?.valid || 0,
      totalToppedUp: topupByBusiness[b._id] || 0,
      lowBalance: b.duptBalance < b.lowBalanceThreshold,
    })),
  });
});

// GET /api/admin/businesses/:id - single business detail, recent activity
router.get("/businesses/:id", async (req, res) => {
  const business = await User.findOne({ _id: req.params.id, role: "owner" }).select("-password");
  if (!business) return res.status(404).json({ error: "Business not found" });

  const [recentChecks, recentTopups, staffCount, adminActions] = await Promise.all([
    Verification.find({ businessId: business._id }).sort({ checkedAt: -1 }).limit(25),
    Topup.find({ businessId: business._id }).sort({ createdAt: -1 }).limit(25),
    User.countDocuments({ businessId: business._id, role: "staff" }),
    AdminAction.find({ businessId: business._id }).sort({ createdAt: -1 }).limit(25).populate("adminId", "ownerName"),
  ]);

  res.json({ business, recentChecks, recentTopups, staffCount, adminActions });
});

// POST /api/admin/businesses/:id/adjust-balance - manual DU PT credit or
// debit (free credits, goodwill after a failed automated top-up, correcting
// an error, etc.). amount is in DU PT, not ETB.
router.post("/businesses/:id/adjust-balance", async (req, res) => {
  const { amount, reason } = req.body;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount === 0) {
    return res.status(400).json({ error: "amount must be a non-zero number (negative to debit), in DU PT" });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: "reason is required for admin credit/debit actions" });
  }

  const business = await User.findOne({ _id: req.params.id, role: "owner" });
  if (!business) return res.status(404).json({ error: "Business not found" });

  const balanceBefore = business.duptBalance;
  const balanceAfter = balanceBefore + numericAmount;

  // Prevent negative DU PT balances (security requirement, section 17).
  if (balanceAfter < 0) {
    return res.status(400).json({
      error: `This debit would take the balance below zero (current: ${balanceBefore} DU PT).`,
    });
  }

  business.duptBalance = balanceAfter;
  await business.save();

  await BillingLedger.create({
    businessId: business._id,
    userId: req.user._id, // the super admin who made this adjustment
    type: numericAmount > 0 ? "ADMIN_CREDIT" : "ADMIN_DEBIT",
    duptAmount: numericAmount,
    balanceBefore,
    balanceAfter,
    status: "success",
    reason,
  });

  // Kept alongside the ledger entry for continuity with the existing
  // admin-activity view on the business detail page.
  await AdminAction.create({
    adminId: req.user._id,
    businessId: business._id,
    action: numericAmount > 0 ? "balance_credit" : "balance_debit",
    amount: numericAmount,
    reason,
  });

  res.json({ duptBalance: business.duptBalance });
});

// PATCH /api/admin/businesses/:id/status - suspend or reactivate a business
router.patch("/businesses/:id/status", async (req, res) => {
  const { isActive, reason } = req.body;
  if (typeof isActive !== "boolean") {
    return res.status(400).json({ error: "isActive must be true or false" });
  }

  const business = await User.findOne({ _id: req.params.id, role: "owner" });
  if (!business) return res.status(404).json({ error: "Business not found" });

  business.isActive = isActive;
  await business.save();

  // Suspending an owner should also lock out their staff logins.
  await User.updateMany({ businessId: business._id, role: "staff" }, { isActive });

  await AdminAction.create({
    adminId: req.user._id,
    businessId: business._id,
    action: isActive ? "reactivate" : "suspend",
    reason: reason || "",
  });

  res.json({ isActive: business.isActive });
});

// PATCH /api/admin/businesses/:id/verification/:verificationId - manually
// override a single verification's status (e.g. fix a wrongly-flagged check
// after investigating it by hand).
router.patch("/businesses/:id/verification/:verificationId", async (req, res) => {
  const { status, reason } = req.body;
  const allowed = [
    "VALID",
    "ALREADY_USED",
    "AMOUNT_MISMATCH",
    "PROVIDER_ERROR",
    "OCR_FAILED",
    "INVALID_FORMAT",
    // Added with the two-step verification upgrade - previously missing
    // here, which meant a super admin couldn't manually override a
    // verification into or out of these two statuses.
    "RECEIVER_MISMATCH",
    "NOT_VERIFIED",
  ];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
  }

  const log = await Verification.findOne({ _id: req.params.verificationId, businessId: req.params.id });
  if (!log) return res.status(404).json({ error: "Verification not found" });

  log.status = status;
  await log.save();

  await AdminAction.create({
    adminId: req.user._id,
    businessId: req.params.id,
    action: "verification_override",
    reason: reason || `Set status to ${status}`,
  });

  res.json({ log });
});

// GET /api/admin/topups - platform-wide top-up feed, filterable by status
router.get("/topups", async (req, res) => {
  const { status, page = 1, limit = 30 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Topup.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("businessId", "businessName ownerName email"),
    Topup.countDocuments(filter),
  ]);

  res.json({ items, total, page: Number(page), limit: Number(limit) });
});

// ---------------------------------------------------------------------
// PACKAGES - super admin owns pricing/availability for the discounted
// DU PT bundles. Businesses only ever see `active` ones (routes/billing.js
// GET /packages); this is the management surface.
// ---------------------------------------------------------------------

// GET /api/admin/packages - all packages, including inactive ones
router.get("/packages", async (req, res) => {
  const packages = await Package.find().sort({ sortOrder: 1 });
  res.json({ packages });
});

// POST /api/admin/packages - create a new package
router.post("/packages", async (req, res) => {
  const { key, name, duptAmount, priceETB, sortOrder } = req.body;
  if (!key || !name || !duptAmount || !priceETB) {
    return res.status(400).json({ error: "key, name, duptAmount, and priceETB are required" });
  }
  try {
    const pkg = await Package.create({
      key,
      name,
      duptAmount: Number(duptAmount),
      priceETB: Number(priceETB),
      sortOrder: Number(sortOrder) || 0,
    });
    await AdminAction.create({
      adminId: req.user._id,
      action: "package_create",
      reason: `Created package "${name}" (${duptAmount} DU PT / ETB ${priceETB})`,
    });
    res.status(201).json({ package: pkg });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: `A package with key "${key}" already exists` });
    res.status(500).json({ error: "Could not create package", detail: err.message });
  }
});

// PATCH /api/admin/packages/:id - edit pricing, DU PT amount, or active state
router.patch("/packages/:id", async (req, res) => {
  const pkg = await Package.findById(req.params.id);
  if (!pkg) return res.status(404).json({ error: "Package not found" });

  const { name, duptAmount, priceETB, active, sortOrder } = req.body;
  const changes = [];
  if (name !== undefined && name !== pkg.name) {
    changes.push(`name: ${pkg.name} -> ${name}`);
    pkg.name = name;
  }
  if (duptAmount !== undefined && Number(duptAmount) !== pkg.duptAmount) {
    changes.push(`duptAmount: ${pkg.duptAmount} -> ${duptAmount}`);
    pkg.duptAmount = Number(duptAmount);
  }
  if (priceETB !== undefined && Number(priceETB) !== pkg.priceETB) {
    changes.push(`priceETB: ${pkg.priceETB} -> ${priceETB}`);
    pkg.priceETB = Number(priceETB);
  }
  if (active !== undefined && Boolean(active) !== pkg.active) {
    changes.push(`active: ${pkg.active} -> ${active}`);
    pkg.active = Boolean(active);
  }
  if (sortOrder !== undefined) pkg.sortOrder = Number(sortOrder);
  pkg.updatedAt = new Date();

  await pkg.save();

  if (changes.length) {
    await AdminAction.create({
      adminId: req.user._id,
      action: "package_update",
      reason: `Updated package "${pkg.name}": ${changes.join(", ")}`,
    });
  }

  res.json({ package: pkg });
});

// DELETE /api/admin/packages/:id
router.delete("/packages/:id", async (req, res) => {
  const pkg = await Package.findByIdAndDelete(req.params.id);
  if (!pkg) return res.status(404).json({ error: "Package not found" });

  await AdminAction.create({
    adminId: req.user._id,
    action: "package_delete",
    reason: `Deleted package "${pkg.name}"`,
  });

  res.json({ deleted: true });
});

// ---------------------------------------------------------------------
// BILLING LEDGER (platform-wide view) & per-business payment accounts,
// for the super admin's audit/oversight surface.
// ---------------------------------------------------------------------

// GET /api/admin/ledger - platform-wide billing ledger, filterable by business
router.get("/ledger", async (req, res) => {
  const { businessId, type, page = 1, limit = 40 } = req.query;
  const filter = {};
  if (businessId) filter.businessId = businessId;
  if (type) filter.type = type;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    BillingLedger.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("businessId", "businessName ownerName")
      .populate("userId", "ownerName role"),
    BillingLedger.countDocuments(filter),
  ]);

  res.json({ items, total, page: Number(page), limit: Number(limit) });
});

// GET /api/admin/businesses/:id/payment-accounts - read-only view for oversight
router.get("/businesses/:id/payment-accounts", async (req, res) => {
  const accounts = await PaymentAccount.find({ businessId: req.params.id }).sort({ provider: 1 });
  res.json({ accounts });
});

// ---------------------------------------------------------------------
// PLATFORM SETTINGS - custom DU PT rate, platform-wide provider
// kill-switches, and feature flags (section 15: "Enable/disable
// features", "Enable/disable payment providers", "Change custom DU PT
// pricing"). Singleton document, read by billing.js and verify.js.
// ---------------------------------------------------------------------

// GET /api/admin/platform-settings
router.get("/platform-settings", async (req, res) => {
  const settings = await PlatformSettings.getOrCreate();
  res.json({ settings });
});

// PATCH /api/admin/platform-settings
router.patch("/platform-settings", async (req, res) => {
  const settings = await PlatformSettings.getOrCreate();
  const { customDuptRateEtb, providerEnabled, featureFlags } = req.body;
  const changes = [];

  if (customDuptRateEtb !== undefined) {
    const rate = Number(customDuptRateEtb);
    if (!rate || rate <= 0) {
      return res.status(400).json({ error: "customDuptRateEtb must be a positive number" });
    }
    changes.push(`customDuptRateEtb: ${settings.customDuptRateEtb} -> ${rate}`);
    settings.customDuptRateEtb = rate;
  }

  if (providerEnabled && typeof providerEnabled === "object") {
    for (const [provider, enabled] of Object.entries(providerEnabled)) {
      if (!(provider in settings.providerEnabled)) continue; // ignore unknown keys
      const boolEnabled = Boolean(enabled);
      if (settings.providerEnabled[provider] !== boolEnabled) {
        changes.push(`providerEnabled.${provider}: ${settings.providerEnabled[provider]} -> ${boolEnabled}`);
        settings.providerEnabled[provider] = boolEnabled;
      }
    }
  }

  if (featureFlags && typeof featureFlags === "object") {
    for (const [flag, value] of Object.entries(featureFlags)) {
      if (!(flag in settings.featureFlags)) continue;
      const boolValue = Boolean(value);
      if (settings.featureFlags[flag] !== boolValue) {
        changes.push(`featureFlags.${flag}: ${settings.featureFlags[flag]} -> ${boolValue}`);
        settings.featureFlags[flag] = boolValue;
      }
    }
  }

  settings.updatedAt = new Date();
  await settings.save();

  if (changes.length) {
    await AdminAction.create({
      adminId: req.user._id,
      action: "platform_settings_update",
      reason: changes.join(", "),
    });
  }

  res.json({ settings });
});

// ---------------------------------------------------------------------
// REFUND - distinct from adjust-balance so it's tagged correctly in the
// ledger (type REFUND, not ADMIN_CREDIT) and always ties back to a
// specific verification or top-up being refunded.
// ---------------------------------------------------------------------

// POST /api/admin/businesses/:id/refund
router.post("/businesses/:id/refund", async (req, res) => {
  const { duptAmount, reason, verificationId, topupId } = req.body;
  const amount = Number(duptAmount);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "duptAmount must be a positive number (refunds always credit)" });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: "reason is required for refunds" });
  }

  const business = await User.findOne({ _id: req.params.id, role: "owner" });
  if (!business) return res.status(404).json({ error: "Business not found" });

  const balanceBefore = business.duptBalance;
  const balanceAfter = balanceBefore + amount;

  business.duptBalance = balanceAfter;
  await business.save();

  await BillingLedger.create({
    businessId: business._id,
    userId: req.user._id,
    type: "REFUND",
    duptAmount: amount,
    balanceBefore,
    balanceAfter,
    status: "success",
    reason,
    verificationId: verificationId || null,
    topupId: topupId || null,
  });

  await AdminAction.create({
    adminId: req.user._id,
    businessId: business._id,
    action: "refund",
    amount,
    reason,
  });

  res.json({ duptBalance: business.duptBalance });
});

module.exports = router;
