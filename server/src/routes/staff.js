const express = require("express");
const User = require("../models/User");
const Verification = require("../models/Verification");
const { requireAuth } = require("../middleware/auth");
const { requireOwner } = require("../middleware/roleCheck");
const bcrypt = require("bcryptjs");

const router = express.Router();

router.use(requireAuth, requireOwner);

// POST /api/staff - create a cashier/waiter account
router.post("/", async (req, res) => {
  try {
    if (req.user.accountMode !== "team") {
      return res.status(403).json({
        error:
          "Staff accounts are a Pro feature. Upgrade to Pro in Settings to add staff.",
        code: "ACCOUNT_MODE_SOLO",
      });
    }

    const { ownerName, phone, password } = req.body;
    const ownerNameStr = String(ownerName || "").trim();
    const cleanPhone = String(phone || "").trim();
    const rawPassword = String(password || "");

    if (!ownerNameStr || !cleanPhone || !rawPassword) {
      return res.status(400).json({ error: "Name, phone and password are required" });
    }

    const strippedPhone = cleanPhone.replace(/[\s\-\(\)]/g, "");
    const existing = await User.findOne({
      $or: [{ phone: cleanPhone }, { phone: strippedPhone }]
    });
    if (existing) {
      return res.status(409).json({ error: "An account with that phone number already exists" });
    }

    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const staff = await User.create({
      businessName: req.user.businessName,
      ownerName: ownerNameStr,
      // Store a normalized value so the preflight duplicate check and the
      // database unique index evaluate the same phone number.
      phone: strippedPhone,
      // Staff have no email — they sign in with phone + password. Leave
      // the field unset (not null): the sparse unique index on email only
      // excludes documents missing the field entirely, so explicitly
      // storing null would collide on the second staff account created
      // without an email. See models/User.js.
      password: passwordHash,
      role: "staff",
      // Staff never verify email — they have none. Open their account
      // immediately so they aren't shown the verification banner/OTP flow.
      isVerified: true,
      businessId: req.user._id,
      // Staff don't hold their own DU PT balance (they draw against the
      // business's), so there's nothing for the migration script to convert.
      walletMigratedAt: new Date(),
    });

    res.status(201).json({
      id: staff._id,
      ownerName: staff.ownerName,
      email: staff.email,
      phone: staff.phone,
      isActive: staff.isActive,
    });
  } catch (err) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
      if (field === "phone") {
        return res.status(409).json({ error: "An account with that phone number already exists" });
      }
      if (field === "email") {
        return res.status(409).json({
          error: "The database email index is misconfigured. Run the staff index repair script once.",
          code: "EMAIL_INDEX_REPAIR_REQUIRED",
        });
      }
    }
    console.error("[staff] Could not create staff account:", err);
    res.status(500).json({ error: "Could not create staff account", detail: err.message });
  }
});

// GET /api/staff - list staff
router.get("/", async (req, res) => {
  const staff = await User.find({ businessId: req.user._id, role: "staff" }).select(
    "ownerName email phone isActive createdAt"
  );
  res.json({ staff });
});

// PATCH /api/staff/:id/toggle - enable/disable
router.patch("/:id/toggle", async (req, res) => {
  const staff = await User.findOne({ _id: req.params.id, businessId: req.user._id, role: "staff" });
  if (!staff) return res.status(404).json({ error: "Staff account not found" });

  staff.isActive = !staff.isActive;
  await staff.save();
  res.json({ id: staff._id, isActive: staff.isActive });
});

// NEW: GET /api/staff/income-stats - daily/weekly/monthly income from verified transactions
router.get("/income-stats", async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const aggregateIncome = async (startDate) => {
      const result = await Verification.aggregate([
        {
          $match: {
            businessId: req.user._id,
            status: "VALID",
            transactionTime: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" }
          }
        }
      ]);
      return result[0] ? result[0].total : 0;
    };

    const daily = await aggregateIncome(startOfDay);
    const weekly = await aggregateIncome(startOfWeek);
    const monthly = await aggregateIncome(startOfMonth);

    res.json({ daily, weekly, monthly });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
