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

  status: { type: String, enum: ["pending", "success", "failed"], default: "pending" },
  chapaRefId: { type: String, default: null },
  failureReason: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
});

module.exports = mongoose.model("Topup", topupSchema);
