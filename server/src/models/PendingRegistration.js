const mongoose = require("mongoose");

/*
 * Temporary holding area for email sign-ups that have NOT confirmed
 * their address yet. The real User (business) document is only
 * created when the emailed 6-digit code is verified — anyone who
 * abandons the OTP step never touches the users collection at all.
 *
 * Records self-destruct 24 hours after their last activity via the
 * TTL index below, so abandoned sign-ups are garbage-collected
 * automatically by MongoDB.
 */
const pendingRegistrationSchema = new mongoose.Schema({
  businessName: { type: String, required: true },
  ownerName: { type: String, required: true },
  phone: { type: String, required: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  businessType: { type: String, required: true },
  // Chosen at registration: "solo" (I'll verify receipts myself) or
  // "team" (I have staff who will). Carried straight onto the User
  // document once the OTP is confirmed - see User.js accountMode.
  accountMode: { type: String, enum: ["solo", "team"], default: "solo" },
  // bcrypt hash of the chosen password — never plaintext.
  password: { type: String, required: true },
  // DU PT welcome credit, granted only when the account is committed
  // (kept here so the bonus matches the type chosen at sign-up).
  signupBonus: { type: Number, default: 0 },
  // 6-digit email verification code. Only the hash is stored.
  otpHash: { type: String, default: null },
  otpPurpose: { type: String, enum: ["verify", null], default: null },
  otpExpires: { type: Date, default: null },
  otpLastSentAt: { type: Date, default: null },
  // TTL marker — refreshed every time a new code is sent.
  expiresAt: { type: Date, required: true },
});

pendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model(
  "PendingRegistration",
  pendingRegistrationSchema
);
