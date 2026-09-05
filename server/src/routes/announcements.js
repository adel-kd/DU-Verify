// routes/announcements.js
//
// Client-facing announcement endpoints.
//
// Visible to client accounts (business owners AND their staff):
//   GET  /          -> active announcements for this user
//   POST /:id/dismiss -> mark one announcement as read/dismissed
//
// Admins see announcements through /api/admin/announcements instead.

const express = require("express");
const Announcement = require("../models/Announcement");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

/* ============================================================
   GET /api/announcements
   Active announcements targeted at this user's business or
   broadcast to everyone. Admins get an empty list here.
============================================================ */

router.get("/", async (req, res) => {
  try {
    if (req.user.role === "admin") {
      return res.json({ items: [] });
    }

    const businessId = req.user.role === "owner"
      ? req.user._id
      : req.user.businessId;

    const items = await Announcement.find({
      active: true,

      $or: [
        { businessId: null }, // broadcast
        { businessId },
      ],

      readBy: { $ne: req.user._id },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.json({ items });
  } catch (err) {
    console.error("[announcements] list failed:", err.message);

    return res.status(500).json({
      error: "Failed to load announcements",
    });
  }
});

/* ============================================================
   POST /api/announcements/:id/dismiss
============================================================ */

router.post("/:id/dismiss", async (req, res) => {
  try {
    await Announcement.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { readBy: req.user._id } }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("[announcements] dismiss failed:", err.message);

    return res.status(500).json({
      error: "Failed to dismiss announcement",
    });
  }
});

module.exports = router;
