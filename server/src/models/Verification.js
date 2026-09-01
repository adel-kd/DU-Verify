const mongoose = require("mongoose");

const verificationSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  checkedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  bankName: {
    type: String,
    enum: [
      "CBE",
      "Telebirr",
      "Awash",
      "Dashen",
      "Abyssinia",
      "Coopbank",
      "CBEBirr",
      "MPesa",
      "Other",
    ],
    required: true,
  },

  transactionRef: {
    type: String,
    required: true,
    index: true,
  },

  /*
   * Transaction amount confirmed/extracted during verification.
   *
   * This is intentionally OPTIONAL.
   *
   * expectedAmount is also optional in the verification request.
   * If neither the provider nor OCR gives an amount, this can
   * safely remain null.
   */
  amount: {
    type: Number,
    default: null,
  },

  senderName: {
    type: String,
  },

  /*
   * Receiver + real transaction time as confirmed by Veritas
   * (the bank's own record), not the OCR text.
   *
   * These can help detect a genuine screenshot that was actually
   * paid to/by someone else, or on a different day, than the one
   * presented at the counter.
   */
  receiverName: {
    type: String,
  },

  transactionTime: {
    type: Date,
  },

  screenshotUrl: {
    type: String,
    required: true,
  },

  status: {
    type: String,
    enum: [
      "VALID",
      "ALREADY_USED",
      "INVALID_FORMAT",
      "OCR_FAILED",
      "AMOUNT_MISMATCH",
      "PROVIDER_ERROR",
      // Added for the two-step verification upgrade (billing/admin spec
      // section 11): the underlying transaction is real, but it wasn't
      // paid to this business's configured receiving account.
      "RECEIVER_MISMATCH",
      // The business hasn't configured (or has disabled) a payment
      // account for this provider at all - distinct from a real mismatch.
      "NOT_VERIFIED",
    ],
    required: true,
  },

  verificationCost: {
    type: Number,
    default: 1,
  },

  checkedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model(
  "Verification",
  verificationSchema
);
