const mongoose = require("mongoose");

const adminActionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  action: {
    type: String,
    enum: ["balance_credit", "balance_debit", "suspend", "reactivate", "verification_override"],
    required: true,
  },
  amount: { type: Number, default: null }, // for balance_credit / balance_debit
  reason: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AdminAction", adminActionSchema);
