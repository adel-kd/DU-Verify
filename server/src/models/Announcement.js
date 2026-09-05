// models/Announcement.js
//
// Manual alerts/messages sent by the super admin to clients
// (business owners and their staff).
//
// Targeting:
//   - businessId set    -> visible only to that business (owner + staff)
//   - businessId null   -> broadcast to ALL client accounts
//
// Dismissal is per-user via `readBy` so each staff member can
// dismiss the message independently.

const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    // "info" | "warning" | "critical"
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
    },

    // null = broadcast to every client account.
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

announcementSchema.index({ businessId: 1, active: 1 });

module.exports = mongoose.model(
  "Announcement",
  announcementSchema
);
