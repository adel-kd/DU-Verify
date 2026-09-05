// services/email.js
//
// Transactional email for the double opt-in flow.
//
// Uses nodemailer with SMTP credentials from env:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
//   EMAIL_FROM (optional, defaults to SMTP_USER)
//   FRONTEND_URL (used to build the activation link)
//
// If SMTP is not configured, emails are logged instead of sent so
// local development does not crash.

const nodemailer = require("nodemailer");

/*
 * HTTPS email delivery (Brevo) — used instead of SMTP.
 *
 * Many networks (mobile hotspots, some ISPs) block all outbound SMTP
 * ports, but always allow HTTPS (443). When BREVO_API_KEY is set we
 * send via Brevo's HTTP API, which works everywhere.
 * Free tier: 300 emails/day — plenty for OTP traffic.
 */
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/*
 * Brevo's API requires `sender.email` to be a bare address (e.g.
 * "no-reply@duverifay.com"), not an RFC "Name <email>" string. EMAIL_FROM
 * is commonly set in that combined form (it's what nodemailer/SMTP's
 * `from` header expects), so calls that pass EMAIL_FROM straight through
 * to Brevo get rejected outright. This pulls out just the address.
 */
function brevoSenderEmail() {
  const raw = process.env.EMAIL_FROM || process.env.SMTP_USER || "";
  const angleMatch = raw.match(/<([^>]+)>/);
  const candidate = angleMatch ? angleMatch[1] : raw;
  const addressMatch = candidate.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (addressMatch ? addressMatch[0] : candidate).trim();
}

let transporter = null;

if (
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS
) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,

    port: Number(process.env.SMTP_PORT) || 587,

    secure: Number(process.env.SMTP_PORT) === 465,

    // Some environments resolve the SMTP host to an IPv6 address that has no
    // route (ENETUNREACH). Force IPv4 so the connection actually succeeds.
    family: 4,

    // Fail fast when the network blocks outbound SMTP instead of hanging
    // the HTTP request for a minute+.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,

    auth: {
      user: process.env.SMTP_USER,

      pass: process.env.SMTP_PASS,
    },
  });
} else {
  console.warn(
    "[email] SMTP not configured — verification emails will be logged, not sent"
  );
}

function emailTransports() {
  const transports = [];
  if (BREVO_API_KEY) transports.push("brevo");
  if (transporter) transports.push("smtp");

  if (preferredTransport && transports.includes(preferredTransport)) {
    return [
      preferredTransport,
      ...transports.filter((transport) => transport !== preferredTransport),
    ];
  }

  return transports;
}

// Start with HTTPS, then remember whichever route most recently worked. If
// that route later fails, the other configured route is still tried.
let preferredTransport = null;

async function sendWithFallback(kind, { to, subject, html, text }) {
  const transports = emailTransports();
  let lastError = new Error("Email delivery is not configured");

  for (const transport of transports) {
    try {
      if (transport === "brevo") {
        const response = await fetch(BREVO_ENDPOINT, {
          method: "POST",
          headers: {
            "api-key": BREVO_API_KEY,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            sender: { name: "DU Verifay", email: brevoSenderEmail() },
            to: [{ email: to }],
            subject,
            htmlContent: html,
          }),
        });
        if (!response.ok) {
          throw new Error(`Brevo API ${response.status}: ${await response.text()}`);
        }
        const result = await response.json().catch(() => ({}));
        console.log(`[email] Brevo message id: ${result.messageId || "not returned"}`);
      } else {
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.SMTP_USER,
          to,
          subject,
          html,
          text,
        });
      }

      console.log(`[email] ${kind} sent via ${transport} to ${to}`);
      preferredTransport = transport;
      return;
    } catch (error) {
      lastError = error;
      console.error(`[email] ${kind} failed via ${transport}: ${error.message}`);
    }
  }

  throw lastError;
}

function verificationEmailHtml(activationUrl) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0a0a0a;">
    <h1 style="font-size:20px;margin:0 0 8px;">DU Verifay</h1>
    <p style="font-size:14px;line-height:1.6;">
      Welcome! Please confirm your email address to activate your account.
    </p>
    <p style="margin:24px 0;">
      <a href="${activationUrl}"
         style="background:#12A783;color:#ffffff;text-decoration:none;
                padding:12px 24px;font-size:14px;font-weight:bold;display:inline-block;">
        Verify my email
      </a>
    </p>
    <p style="font-size:12px;color:#666;line-height:1.6;">
      This link expires in 24 hours. If you did not create an account,
      you can safely ignore this email.
    </p>
  </div>`;
}

/**
 * Send the double opt-in activation email.
 *
 * @param {string} to - recipient email
 * @param {string} rawToken - plaintext token to embed in the link
 */
async function sendVerificationEmail(to, rawToken) {
  const base =
    process.env.FRONTEND_URL || "http://localhost:5173";

  const activationUrl =
    `${base}/verify-email?token=${encodeURIComponent(rawToken)}`;

  await sendWithFallback("verification email", {
    to,
    subject: "Verify your DU Verifay account",
    html: verificationEmailHtml(activationUrl),
    text: `Verify your DU Verifay account: ${activationUrl}`,
  });
}

/**
 * Send a 6-digit OTP code (email verification or password reset).
 */
async function sendOtpEmail(to, code, purpose = "verify") {
  const subject =
    purpose === "reset"
      ? "Your DU Verifay password reset code"
      : "Your DU Verifay verification code";

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0a0a0a;">
    <h1 style="font-size:20px;margin:0 0 8px;">DU Verifay</h1>
    <p style="font-size:14px;line-height:1.6;">
      ${purpose === "reset"
        ? "Use the code below to reset your password."
        : "Use the code below to verify your email address."}
    </p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:20px 0;">${code}</p>
    <p style="font-size:12px;color:#666;line-height:1.6;">
      This code expires in 10 minutes. If you did not request it,
      you can safely ignore this email.
    </p>
  </div>`;

  const text =
    purpose === "reset"
      ? `Use the code below to reset your password.\n\n${code}\n\nThis code expires in 10 minutes.`
      : `Use the code below to verify your email address.\n\n${code}\n\nThis code expires in 10 minutes.`;

  await sendWithFallback(`OTP (${purpose})`, { to, subject, html, text });
}

/**
 * Send purchase / top-up receipt email to Client Admin (Business Owner).
 *
 * @param {string} to - Client Admin email address
 * @param {object} details - Receipt details
 */
async function sendPurchaseReceiptEmail(to, details) {
  if (!to) {
    console.warn("[email] Cannot send purchase receipt: recipient email is missing");
    return;
  }

  const ownerName = details.ownerName || "Business Owner";
  const businessName = details.businessName || "Business";
  const txRef = details.txRef || "N/A";
  const purchaseType = details.purchaseType || "DU PT Top Up";
  const etbAmount = details.etbAmount !== undefined ? details.etbAmount : 0;
  const duptCredited = details.duptCredited !== undefined ? details.duptCredited : 0;
  const newBalance = details.newBalance !== undefined ? details.newBalance : 0;
  const dateStr = details.date ? new Date(details.date).toLocaleString() : new Date().toLocaleString();

  const subject = `DU Verifay Receipt: ${duptCredited} DU PT Credited (${txRef})`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0a0a;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;">
    <div style="border-bottom:2px solid #12A783;padding-bottom:16px;margin-bottom:20px;">
      <h1 style="font-size:22px;margin:0;color:#0a0a0a;">DU Verifay</h1>
      <p style="font-size:12px;color:#666;margin:4px 0 0;">Official Payment Receipt</p>
    </div>

    <p style="font-size:14px;line-height:1.6;margin:0 0 12px;">Hello <strong>${ownerName}</strong> (${businessName}),</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 20px;">Thank you for your payment. Your DU PT balance has been credited successfully.</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px;">
      <tbody>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:10px 0;color:#666;">Transaction Ref:</td><td style="padding:10px 0;font-weight:bold;text-align:right;font-family:monospace;">${txRef}</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:10px 0;color:#666;">Description:</td><td style="padding:10px 0;font-weight:bold;text-align:right;">${purchaseType}</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:10px 0;color:#666;">Amount Paid:</td><td style="padding:10px 0;font-weight:bold;text-align:right;color:#0a0a0a;">${etbAmount} ETB</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:10px 0;color:#666;">DU PT Credited:</td><td style="padding:10px 0;font-weight:bold;text-align:right;color:#12A783;">+${duptCredited} DU PT</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:10px 0;color:#666;">New DU PT Balance:</td><td style="padding:10px 0;font-weight:bold;text-align:right;">${newBalance} DU PT</td></tr>
        <tr><td style="padding:10px 0;color:#666;">Date & Time:</td><td style="padding:10px 0;text-align:right;color:#888;">${dateStr}</td></tr>
      </tbody>
    </table>

    <div style="background:#f9f9f9;border-radius:8px;padding:12px 16px;font-size:12px;color:#666;line-height:1.5;">
      If you have any questions regarding this receipt, please log in to your DU Verifay Client Admin Dashboard or contact support.
    </div>
  </div>`;

  const text = `DU Verifay Official Payment Receipt\n\nHello ${ownerName} (${businessName}),\n\nTransaction Ref: ${txRef}\nDescription: ${purchaseType}\nAmount Paid: ${etbAmount} ETB\nDU PT Credited: +${duptCredited} DU PT\nNew DU PT Balance: ${newBalance} DU PT\nDate: ${dateStr}\n\nThank you for using DU Verifay!`;

  await sendWithFallback("purchase receipt", { to, subject, html, text });
}

module.exports = {
  sendVerificationEmail,
  sendOtpEmail,
  sendPurchaseReceiptEmail,
};
