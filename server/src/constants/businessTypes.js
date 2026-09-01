// Business type catalog for the registration dropdown, and the tiered
// signup DU PT bonus awarded per type.
//
// LOGIC: the bonus is a rough proxy for expected verification volume/value,
// not a random giveaway. High-foot-traffic, many-small-transactions
// businesses (cafes, restaurants, hotels) burn through DU PT fast just
// from daily operations, so they get a bonus generous enough to actually
// onboard them (get a real trial of the product across busy shifts).
// Small single-owner shops with occasional transactions get a modest
// bonus - enough to try the product for real, not so much it's free
// forever. This is intentionally coarse (a handful of tiers, not a
// per-business formula) so it stays predictable and easy to defend if a
// business asks "why did I get X DU PT."
//
// Never trust a client-supplied bonus amount - only `key` comes from the
// registration form; the DU PT amount is always looked up here, server-side.
const BUSINESS_TYPES = [
  // Tier 1 - high foot traffic, many small transactions per day.
  { key: "cafe_restaurant", label: "Café / Restaurant", signupBonus: 500 },
  { key: "hotel_lodging", label: "Hotel / Lodging", signupBonus: 500 },

  // Tier 2 - high volume, fewer but larger baskets.
  { key: "supermarket_grocery", label: "Supermarket / Grocery Store", signupBonus: 400 },
  { key: "bar_lounge", label: "Bar / Lounge", signupBonus: 300 },

  // Tier 3 - moderate, steady volume.
  { key: "pharmacy", label: "Pharmacy", signupBonus: 200 },
  { key: "salon_beauty", label: "Salon / Beauty", signupBonus: 150 },

  // Tier 4 - lower volume retail.
  { key: "electronics_retail", label: "Electronics / Retail Shop", signupBonus: 100 },
  { key: "boutique_clothing", label: "Boutique / Clothing Shop", signupBonus: 100 },

  // Tier 5 - small shops / individual vendors.
  { key: "kiosk_small_shop", label: "Kiosk / Small Shop", signupBonus: 70 },
  { key: "street_vendor", label: "Street Vendor / Small Stand", signupBonus: 60 },

  // Fallback for anything that doesn't fit the above - conservative default.
  { key: "other", label: "Other", signupBonus: 60 },
];

const BUSINESS_TYPE_KEYS = BUSINESS_TYPES.map((t) => t.key);

function signupBonusFor(businessTypeKey) {
  const match = BUSINESS_TYPES.find((t) => t.key === businessTypeKey);
  return match ? match.signupBonus : 60; // same conservative fallback as "other"
}

module.exports = { BUSINESS_TYPES, BUSINESS_TYPE_KEYS, signupBonusFor };
