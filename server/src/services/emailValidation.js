// services/emailValidation.js
//
// Pre-filtering for standard email signups:
//
//   1. Strict RFC-style regex validation
//   2. Disposable / temporary email domain blocklist
//   3. DNS MX record lookup — the domain must be configured
//      to receive mail before we accept the registration
//
// All three run server-side; the regex also runs client-side
// for instant feedback.

const dns = require("dns").promises;

const disposableDomains = require("disposable-email-domains");

/**
 * Strict, practical RFC-5322-style check.
 * Deliberately conservative: no comments, no quoted local parts.
 */
const EMAIL_REGEX =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function isValidEmailFormat(email) {
  const value = String(email || "").trim();

  if (!value || value.length > 254) return false;

  return EMAIL_REGEX.test(value);
}

function isDisposableEmail(email) {
  const domain = String(email || "")
    .toLowerCase()
    .split("@")[1];

  if (!domain) return true;

  // Blocklist includes bare domains like "mailinator.com".
  // Also block subdomains of known disposables.
  const parts = domain.split(".");

  for (let i = 0; i < parts.length - 1; i++) {
    if (disposableDomains.includes(parts.slice(i).join("."))) {
      return true;
    }
  }

  return false;
}

/**
 * Verify the domain can receive mail.
 *
 * Accepts when MX records exist; falls back to A/AAAA records
 * (some small providers accept mail without explicit MX).
 */
async function hasMxRecord(email) {
  const domain = String(email || "")
    .toLowerCase()
    .split("@")[1];

  if (!domain) return false;

  try {
    const mx = await dns.resolveMx(domain);

    if (Array.isArray(mx) && mx.length > 0) return true;
  } catch {
    // No MX — fall through to A/AAAA check.
  }

  try {
    const a = await dns.resolve4(domain);

    if (Array.isArray(a) && a.length > 0) return true;
  } catch {
    // ignore
  }

  try {
    const aaaa = await dns.resolve6(domain);

    if (Array.isArray(aaaa) && aaaa.length > 0) return true;
  } catch {
    // ignore
  }

  return false;
}

/**
 * Full server-side gate used by the register route.
 *
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function validateRegistrationEmail(email) {
  if (!isValidEmailFormat(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  if (isDisposableEmail(email)) {
    return {
      ok: false,
      error:
        "Temporary or disposable email addresses are not allowed. Please use a real email address.",
    };
  }

  const mxOk = await hasMxRecord(email);

  if (!mxOk) {
    return {
      ok: false,
      error:
        "This email domain cannot receive mail. Please double-check the address.",
    };
  }

  return { ok: true };
}

module.exports = {
  EMAIL_REGEX,
  isValidEmailFormat,
  isDisposableEmail,
  hasMxRecord,
  validateRegistrationEmail,
};
