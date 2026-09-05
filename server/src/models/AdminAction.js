const mongoose = require("mongoose");

const adminActionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  action: {
    type: String,
    enum: [
      "balance_credit",
      "balance_debit",
      "suspend",
      "reactivate",
      "verification_override",
      "package_create",
      "package_update",
      "package_delete",
      "platform_settings_update",
      "refund",
      "bank_transfer_approve",
      "bank_transfer_reject",
      "platform_payment_account_create",
      "platform_payment_account_update",
      "platform_payment_account_delete",
    ],
    required: true,
  },
  amount: { type: Number, default: null }, // for balance_credit / balance_debit
  reason: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AdminAction", adminActionSchema);
