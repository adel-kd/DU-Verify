const express = require("express");
const User = require("../models/User");
const Verification = require("../models/Verification");
const { requireAuth } = require("../middleware/auth");
const { requireOwner } = require("../middleware/roleCheck");

const router = express.Router();

router.use(requireAuth, requireOwner);

// POST /api/staff - create a cashier/waiter account
router.post("/", async (req, res) => {
  try {
    const { ownerName, phone, email, password } = req.body;
    if (!ownerName || !phone || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existing = await User.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(409).json({ error: "An account with that email or phone already exists" });
    }

    const bcrypt = require("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 10);
    const staff = await User.create({
      businessName: req.user.businessName,
      ownerName,
      phone,
      email,
      password: passwordHash,
      role: "staff",
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