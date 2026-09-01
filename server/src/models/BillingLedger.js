const mongoose = require("mongoose");

// Immutable audit trail for every DU PT balance change. Nothing should ever
// mutate a document in this collection after creation - only inserts.
// walletBalance/duptBalance on User is a cached "current total" for fast
// reads; this ledger is the source of truth for "how did we get here."
const billingLedgerSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  // Who triggered this entry - the business owner for a self-service top-up,
  // the staff member who performed a billable verification, or the super
  // admin who made a manual adjustment. Null for pure system/webhook events.
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  type: {
    type: String,
    enum: [
      "TOPUP",
      "PACKAGE_PURCHASE",
      "VERIFICATION_CHARGE",
      "REFUND",
      "ADMIN_CREDIT",
      "ADMIN_DEBIT",
    ],
    required: true,
    index: true,
  },

  // DU PT delta for this entry. Positive for credits (TOPUP, PACKAGE_PURCHASE,
  // REFUND, ADMIN_CREDIT), negative for debits (VERIFICATION_CHARGE, ADMIN_DEBIT).
  duptAmount: { type: Number, required: true },

  // The ETB amount actually paid/adjusted, if applicable. Null for entries
  // with no direct money movement (e.g. a verification charge has an
  // internal DU PT cost but no separate ETB transaction of its own).
  etbAmount: { type: Number, default: null },

  balanceBefore: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },

  provider: { type: String, default: null }, // e.g. "chapa"
  paymentMethod: { type: String, default: null }, // e.g. "chapa_checkout"

  // Internal reference (our tx_ref) and the provider's own reference,
  // kept side by side so a support agent can cross-check both systems.
  internalTxRef: { type: String, default: null, index: true },
  providerReference: { type: String, default: null },

  // Links back to the source document for this entry, when there is one.
  packageId: { type: mongoose.Schema.Types.ObjectId, ref: "Package", default: null },
  verificationId: { type: mongoose.Schema.Types.ObjectId, ref: "Verification", default: null },
  topupId: { type: mongoose.Schema.Types.ObjectId, ref: "Topup", default: null },

  status: {
    type: String,
    enum: ["success", "failed", "reversed"],
    default: "success",
  },

  reason: { type: String, default: "" }, // free-text, mainly for ADMIN_CREDIT/ADMIN_DEBIT/REFUND

  createdAt: { type: Date, default: Date.now, index: true },
});

// Fast "recent activity for this business" and "find by internal ref" lookups.
billingLedgerSchema.index({ businessId: 1, createdAt: -1 });

module.exports = mongoose.model("BillingLedger", billingLedgerSchema);
