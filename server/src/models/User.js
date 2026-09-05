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
  // Staff accounts are created by the business admin with just a name
  // and phone — email is optional for them. Owners/admins always have
  // an email (required at registration).
  // IMPORTANT: no `default: null` here. Mongo's sparse unique index only
  // excludes documents where the field is truly ABSENT - a document with
  // email explicitly set to null still gets indexed (with key null), so a
  // schema default of null would make every phone-only account (staff, or
  // an admin created without an email) collide on the second one created,
  // failing with a duplicate key error. Leaving the field genuinely unset
  // when no email is given is what makes the sparse index behave as
  // intended, allowing any number of phone-only accounts.
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  password: { type: String, required: true }, // bcrypt hash, never plaintext
  // Google OAuth identity. Set when the account signs in with
  // "Continue with Google"; used to link Google logins to the
  // same local account when the emails match.
  googleId: { type: String, default: null },
  avatarUrl: { type: String, default: null },
  // Double opt-in email verification via OTP code. Google accounts are
  // trusted immediately (Google verified the address for us). Staff are
  // created by the business admin and skip verification entirely.
  isVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String, default: null }, // legacy link token (unused)
  emailVerificationExpires: { type: Date, default: null },
  // OTP codes (email verification + password reset). Only the hash is stored.
  otpHash: { type: String, default: null },
  otpPurpose: { type: String, enum: ["verify", "reset", null], default: null },
  otpExpires: { type: Date, default: null },
  otpLastSentAt: { type: Date, default: null },
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
  // Google sign-ups skip the normal registration form, so they may be
  // missing phone / businessType until they complete their profile.
  profileComplete: { type: Boolean, default: true },
  role: { type: String, enum: ["owner", "staff", "admin"], default: "owner" },
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  // Chosen at registration ("Just me" vs "Me and a team"). Only meaningful
  // for owner accounts:
  //   solo -> the owner verifies receipts themselves; staff accounts
  //           cannot be added.
  //   team -> the owner adds staff to verify on their behalf instead of
  //           doing it themselves; unlocking this from "solo" is the
  //           "Upgrade to Pro" action (see PATCH /auth/me/account-mode).
  accountMode: { type: String, enum: ["solo", "team"], default: "solo" },
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
