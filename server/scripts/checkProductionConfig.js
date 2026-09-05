require("dotenv").config();

const failures = [];
const warnings = [];

function value(name) {
  return String(process.env[name] || "").trim();
}

function requireValue(name) {
  const current = value(name);

  if (!current || /^(replace_|your_|set_this|<)/i.test(current)) {
    failures.push(`${name} is missing or still contains a placeholder`);
  }

  return current;
}

function validUrl(name, current, { https = false } = {}) {
  try {
    const parsed = new URL(current);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("unsupported protocol");
    }

    if (https && parsed.protocol !== "https:") {
      failures.push(`${name} must use HTTPS in production`);
    }

    return parsed;
  } catch {
    failures.push(`${name} must be a valid HTTP(S) URL`);
    return null;
  }
}

const nodeEnv = requireValue("NODE_ENV");
const mongoUri = requireValue("MONGO_URI");
const jwtSecret = requireValue("JWT_SECRET");
const baseUrl = requireValue("BASE_URL");
const frontendUrl = requireValue("FRONTEND_URL");
const googleClientId = requireValue("GOOGLE_CLIENT_ID");
requireValue("GOOGLE_CLIENT_SECRET");
const primaryGoogleCallback = requireValue("GOOGLE_CALLBACK_URL");

if (nodeEnv !== "production") {
  failures.push("NODE_ENV must be production");
}

if (!/^mongodb(\+srv)?:\/\//i.test(mongoUri)) {
  failures.push("MONGO_URI must be a MongoDB connection string");
}

if (jwtSecret.length < 32) {
  failures.push("JWT_SECRET must contain at least 32 characters");
}

const parsedBaseUrl = validUrl("BASE_URL", baseUrl, { https: true });
validUrl("FRONTEND_URL", frontendUrl, { https: !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(frontendUrl) });
const parsedGoogleCallback = validUrl("GOOGLE_CALLBACK_URL", primaryGoogleCallback, { https: true });

if (parsedGoogleCallback?.pathname !== "/api/auth/google/callback") {
  failures.push("GOOGLE_CALLBACK_URL must end with /api/auth/google/callback");
}

if (parsedBaseUrl && parsedGoogleCallback && parsedBaseUrl.origin !== parsedGoogleCallback.origin) {
  failures.push("GOOGLE_CALLBACK_URL must use the same public origin as BASE_URL");
}

if (!googleClientId.endsWith(".apps.googleusercontent.com")) {
  failures.push("GOOGLE_CLIENT_ID is not a Google OAuth web client ID");
}

const extraCallbacks = value("GOOGLE_CALLBACK_URLS")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

for (const callback of extraCallbacks) {
  const parsed = validUrl("GOOGLE_CALLBACK_URLS entry", callback);
  if (parsed?.pathname !== "/api/auth/google/callback") {
    failures.push(`Google callback has the wrong path: ${callback}`);
  }
}

const hasBrevo = Boolean(value("BREVO_API_KEY"));
const smtpFields = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
const configuredSmtpFields = smtpFields.filter((name) => value(name));
const hasSmtp = configuredSmtpFields.length === smtpFields.length;

if (!hasBrevo && !hasSmtp) {
  failures.push("Configure BREVO_API_KEY or all SMTP settings for transactional email");
} else if (configuredSmtpFields.length > 0 && !hasSmtp) {
  failures.push("SMTP configuration is incomplete");
}

if (!value("EMAIL_FROM").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)) {
  failures.push("EMAIL_FROM must contain a valid email address");
}

if (!value("CHAPA_SECRET_KEY")) {
  warnings.push("CHAPA_SECRET_KEY is not configured; wallet top-ups will not work");
}

if (!value("GEMINI_API_KEY")) {
  warnings.push("GEMINI_API_KEY is not configured; OCR will not work");
}

if (!extraCallbacks.includes("http://localhost:5000/api/auth/google/callback")) {
  warnings.push("Local Google OAuth callback is not listed in GOOGLE_CALLBACK_URLS");
}

for (const warning of warnings) {
  console.warn(`WARN: ${warning}`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`);
  }
  process.exit(1);
}

console.log("PASS: production configuration is complete");
console.log(`PASS: Google callbacks configured: ${1 + extraCallbacks.length}`);
console.log(`PASS: email transports configured: ${[hasBrevo && "HTTPS API", hasSmtp && "SMTP"].filter(Boolean).join(" + ")}`);
