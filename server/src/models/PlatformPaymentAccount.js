const mongoose = require("mongoose");

const PROVIDERS = [
  "CBE",
  "Telebirr",
  "Dashen",
  "Abyssinia",
  "CBEBirr",
  "MPesa",
  "Awash",
  "Coopbank",
  "Other",
];

const platformPaymentAccountSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: PROVIDERS, required: true, index: true },
    accountNumber: { type: String, required: true, trim: true },
    accountHolderName: { type: String, required: true, trim: true },
    label: { type: String, default: "", trim: true },
    instructions: { type: String, default: "", trim: true },
    enabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

platformPaymentAccountSchema.index(
  { provider: 1, accountNumber: 1 },
  { unique: true }
);

platformPaymentAccountSchema.statics.PROVIDERS = PROVIDERS;

module.exports = mongoose.model(
  "PlatformPaymentAccount",
  platformPaymentAccountSchema
);
