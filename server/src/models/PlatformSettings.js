const mongoose = require("mongoose");

// Singleton document (always the same _id) holding platform-wide settings
// that only Super Admin controls - as opposed to PaymentAccount, which is
// per-business. Read by billing.js (custom top-up rate, whether custom
// top-up/packages are enabled at all) and verify.js (whether a provider is
// enabled platform-wide, independent of any single business's own
// PaymentAccount.enabled flag).
const SINGLETON_ID = "platform_settings";

const platformSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: SINGLETON_ID },

  // ETB per 1 DU PT for custom top-ups. Packages are priced independently
  // via the Package model and are NOT affected by this rate.
  customDuptRateEtb: { type: Number, default: 2, min: 0.01 },

  // Platform-wide kill switch per provider. A provider disabled here is
  // unavailable for every business regardless of that business's own
  // PaymentAccount configuration - useful if a provider's API is down or
  // being deprecated. Defaults to enabled for all known providers.
  providerEnabled: {
    CBE: { type: Boolean, default: true },
    Telebirr: { type: Boolean, default: true },
    Dashen: { type: Boolean, default: true },
    Abyssinia: { type: Boolean, default: true },
    CBEBirr: { type: Boolean, default: true },
    MPesa: { type: Boolean, default: true },
    Awash: { type: Boolean, default: true },
  },

  featureFlags: {
    customTopupEnabled: { type: Boolean, default: true },
    packagePurchaseEnabled: { type: Boolean, default: true },
  },

  // Chapa and direct bank transfer are independent purchase paths. At least
  // one should normally remain enabled, but admins may temporarily disable
  // both while billing maintenance is in progress.
  paymentMethods: {
    chapaEnabled: { type: Boolean, default: true },
    bankTransferEnabled: { type: Boolean, default: false },
  },

  // Public copy managed by the platform admin. Empty legal bodies keep the
  // built-in client copy in place until an admin intentionally replaces it.
  siteContent: {
    termsBody: { type: String, default: "" },
    privacyBody: { type: String, default: "" },
    legalUpdatedAt: { type: Date, default: null },
    contactEmail: { type: String, default: "", trim: true },
    contactPhone: { type: String, default: "", trim: true },
    contactAddress: { type: String, default: "", trim: true },
  },

  updatedAt: { type: Date, default: Date.now },
});

platformSettingsSchema.statics.SINGLETON_ID = SINGLETON_ID;

// Always returns the single settings doc, creating it with defaults on
// first access rather than requiring a manual seed step.
platformSettingsSchema.statics.getOrCreate = async function () {
  let doc = await this.findById(SINGLETON_ID);
  if (!doc) {
    doc = await this.create({ _id: SINGLETON_ID });
  }
  return doc;
};

module.exports = mongoose.model("PlatformSettings", platformSettingsSchema);
