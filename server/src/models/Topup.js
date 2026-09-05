const mongoose = require("mongoose");

const topupSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  txRef: { type: String, required: true, unique: true },

  // CUSTOM_TOPUP: any ETB amount at the flat ETB 2 = 1 DU PT rate.
  // PACKAGE_PURCHASE: a fixed Package bought at its discounted rate.
  // Both flow through the exact same Chapa initialize/verify/webhook code -
  // this field only controls how duptAmount was priced, not the payment path.
  purchaseType: { type: String, enum: ["CUSTOM_TOPUP", "PACKAGE_PURCHASE"], required: true },
  packageId: { type: mongoose.Schema.Types.ObjectId, ref: "Package", default: null },

  amount: { type: Number, required: true }, // ETB amount actually charged via Chapa
  // DU PT to credit once payment is verified. Computed and frozen server-side
  // at initialization time (from the live custom rate or the Package doc) -
  // never taken from the frontend, and never recomputed later even if
  // pricing changes before this specific payment completes.
  duptAmount: { type: Number, required: true },

  paymentMethod: {
    type: String,
    enum: ["chapa", "bank_transfer"],
    default: "chapa",
    index: true,
  },
  status: {
    type: String,
    enum: [
      "pending",
      "processing",
      "pending_review",
      "crediting",
      "success",
      "failed",
      "rejected",
    ],
    default: "pending",
    index: true,
  },
  chapaRefId: { type: String, default: null },
  failureReason: { type: String, default: null },
  paymentAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PlatformPaymentAccount",
    default: null,
  },
  bankProvider: { type: String, default: null },
  receipt: {
    storageName: { type: String, default: null },
    originalName: { type: String, default: null },
    mimeType: { type: String, default: null },
    size: { type: Number, default: null },
    // Render's free filesystem is ephemeral. Store new receipt files with the
    // top-up record so they remain available after restarts and redeploys.
    data: { type: Buffer, default: null, select: false },
  },
  extractedReference: { type: String, default: null, index: true },
  extractedAmount: { type: Number, default: null },
  extractedSenderName: { type: String, default: null },
  verifiedReceiverName: { type: String, default: null },
  verifiedReceiverAccount: { type: String, default: null },
  automaticReview: { type: mongoose.Schema.Types.Mixed, default: null },
  reviewReason: { type: String, default: "" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  submittedAt: { type: Date, default: null },
  creditedReference: { type: String, default: undefined },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
});

// Assigned immediately before a direct transfer is credited. This makes the
// same bank transaction impossible to approve twice, even if two admins act
// at the same time.
topupSchema.index(
  { creditedReference: 1 },
  {
    unique: true,
    partialFilterExpression: { creditedReference: { $type: "string" } },
  }
);

module.exports = mongoose.model("Topup", topupSchema);
