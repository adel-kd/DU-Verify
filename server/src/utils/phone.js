function phoneVariants(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];

  const compact = raw.replace(/[\s\-().]/g, "");
  const digits = compact.replace(/^\+/, "");

  let subscriber = null;
  if (/^09\d{8}$/.test(digits)) {
    subscriber = digits.slice(1);
  } else if (/^2519\d{8}$/.test(digits)) {
    subscriber = digits.slice(3);
  } else if (/^9\d{8}$/.test(digits)) {
    subscriber = digits;
  }

  if (!subscriber) {
    return [...new Set([raw, compact])];
  }

  return [...new Set([
    `+251${subscriber}`,
    `251${subscriber}`,
    `0${subscriber}`,
    subscriber,
    raw,
    compact,
  ])];
}

function normalizeEthiopianPhone(value) {
  return phoneVariants(value).find((phone) => /^\+2519\d{8}$/.test(phone)) || null;
}

function phoneConditions(value) {
  return phoneVariants(value).map((phone) => ({ phone }));
}

module.exports = {
  normalizeEthiopianPhone,
  phoneConditions,
  phoneVariants,
};
