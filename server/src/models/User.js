const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  businessName: { type: String, required: true },
  // What kind of business this is - drives the tiered signup DU PT bonus
  // (see constants/businessTypes.js) and lets Super Admin/analytics
  // understand the customer base by vertical. Not required at the schema
  // level (so pre-upgrade accounts don't fail validation on save), but the
  // registration route requires it for all new signups.
  businessType: { type: String, default: "other" },
  ownerName: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }, // bcrypt hash, never plaintext
  // DEPRECATED: legacy ETB-denominated balance. No longer written to by
  // billing/verify routes as of the DU PT upgrade - kept only so old data
  // isn't silently dropped, and to detect accounts that still need the
  // one-time migration script (scripts/migrateWalletToDupt.js) run on them.
  walletBalance: { type: Number, default: 10 },
  walletMigratedAt: { type: Date, default: null }, // set once scripts/migrateWalletToDupt.js has processed this user
  // DU PT = verification purchasing power. This is the field billing and
  // verification charging actually read/write. ETB 2 = 1 DU PT (custom
  // top-up rate); packages grant DU PT directly at a discounted effective
  // rate. 5 DU PT free trial (equivalent to the old 10 ETB trial credit).
  duptBalance: { type: Number, default: 5 },
  role: { type: String, enum: ["owner", "staff", "admin"], default: "owner" },
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  isActive: { type: Boolean, default: true },
  // Balance (in DU PT) under this triggers an in-app low-balance banner for the owner.
  lowBalanceThreshold: { type: Number, default: 10 },
  // The business's own receiving-account suffix, needed to verify CBE and
  // Abyssinia transactions directly against the bank's own lookup endpoint.
  // Set once in Settings rather than typed per verification.
  cbeAccountSuffix: { type: String, default: "" }, // last 8 digits of the CBE account
  abyssiniaAccountSuffix: { type: String, default: "" }, // last 5 digits of the Abyssinia account
  // Settings > Theme. "system" defers to the device's OS-level preference.
  themePreference: { type: String, enum: ["light", "dark", "system"], default: "system" },
  // Settings > Notifications.
  notificationPreferences: {
    lowBalanceAlerts: { type: Boolean, default: true },
    emailReceipts: { type: Boolean, default: true },
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
