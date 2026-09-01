const mongoose = require("mongoose");

// Predefined discounted DU PT bundles (Starter/Business/Enterprise). Super
// Admin owns these - price and DU PT amount are never taken from the
// frontend at purchase time, only looked up by packageId server-side.
const packageSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // stable slug, e.g. "starter"
  name: { type: String, required: true }, // display name, e.g. "Starter"
  duptAmount: { type: Number, required: true, min: 1 }, // DU PT granted on purchase
  priceETB: { type: Number, required: true, min: 1 }, // total ETB price for the bundle
  active: { type: Boolean, default: true }, // inactive packages are hidden but preserved for history
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

packageSchema.virtual("pricePerVerification").get(function () {
  return this.duptAmount > 0 ? this.priceETB / this.duptAmount : 0;
});
packageSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Package", packageSchema);
