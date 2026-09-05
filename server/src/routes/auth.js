const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const passport = require("passport");
const User = require("../models/User");
const PendingRegistration = require("../models/PendingRegistration");
const BillingLedger = require("../models/BillingLedger");
const {
  BUSINESS_TYPES,
  BUSINESS_TYPE_KEYS,
  signupBonusFor,
} = require("../constants/businessTypes");
const { requireAuth } = require("../middleware/auth");
const { requireOwner } = require("../middleware/roleCheck");
const { validateRegistrationEmail } = require("../services/emailValidation");
const { sendVerificationEmail, sendOtpEmail } = require("../services/email");

const router = express.Router();

/* ============================================================
   EMAIL VERIFICATION TOKENS
============================================================ */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function createVerificationToken() {
  const raw = crypto.randomBytes(32).toString("hex");

  // Only the hash is stored — a DB leak cannot be replayed.
  const hashed = crypto
    .createHash("sha256")
    .update(raw)
    .digest("hex");

  return { raw, hashed };
}

/* ============================================================
   OTP HELPERS
============================================================ */

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute

// How long an unconfirmed registration is kept before MongoDB's TTL
// index deletes it. Generous on purpose — the user may come back
// the next day and finish verifying.
const PENDING_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a 6-digit OTP, store only its hash on the user,
 * and return the plaintext code for emailing.
 */
function issueOtp(user, purpose) {
  const code = String(
    crypto.randomInt(0, 1_000_000)
  ).padStart(6, "0");

  user.otpHash = crypto
    .createHash("sha256")
    .update(code)
    .digest("hex");

  user.otpPurpose = purpose;

  user.otpExpires = new Date(
    Date.now() + OTP_TTL_MS
  );

  user.otpLastSentAt = new Date();

  return code;
}

/**
 * Check an OTP against the stored hash.
 */
function otpMatches(user, code, purpose) {
  if (
    !user.otpHash ||
    user.otpPurpose !== purpose ||
    !user.otpExpires ||
    user.otpExpires < new Date()
  ) {
    return false;
  }

  const hashed = crypto
    .createHash("sha256")
    .update(String(code))
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(hashed),
    Buffer.from(user.otpHash)
  );
}

/* ============================================================
   JWT
============================================================ */

function signToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
}


/* ============================================================
   PUBLIC USER
============================================================ */

/**
 * Return the user object that is safe to send to the frontend.
 *
 * IMPORTANT:
 *
 * The DU PT wallet belongs to the BUSINESS.
 *
 * Owner:
 *   user = business owner
 *   user.duptBalance is the business balance.
 *
 * Staff:
 *   user = staff account
 *   user.businessId = business owner/business document
 *   business.duptBalance is the balance staff must see.
 *
 * This prevents staff from seeing a stale/incorrect personal
 * duptBalance after login.
 */
async function publicUser(user) {
  /*
   * Resolve the business only when necessary.
   *
   * Owner:
   *   The user itself is the business.
   *
   * Staff:
   *   businessId points to the owner/business account.
   *
   * Admin:
   *   Admin has no businessId and therefore has no business.
   */
  let business = user;

  if (user.role === "staff") {
    business = await User.findById(user.businessId);
  }

  /*
   * Business wallet.
   *
   * Owner:
   *   user.duptBalance
   *
   * Staff:
   *   business.duptBalance
   *
   * Admin:
   *   no business wallet
   */
  const businessBalance =
    user.role === "owner"
      ? user.duptBalance ?? 0
      : user.role === "staff"
        ? business?.duptBalance ?? 0
        : 0;

  return {
    /*
     * ========================================================
     * LOGGED-IN ACCOUNT IDENTITY
     * ========================================================
     *
     * IMPORTANT:
     * Always use the currently authenticated user's values.
     *
     * Owner  -> owner's name
     * Staff  -> staff member's name
     * Admin  -> admin's name
     */
    id: user._id,

    ownerName: user.ownerName,
    phone: user.phone,
    email: user.email,
    role: user.role,

    /*
     * ========================================================
     * BUSINESS INFORMATION
     * ========================================================
     *
     * Staff gets business information from their business.
     * Owner gets it from themselves.
     * Admin has no business.
     */
    businessName:
      business?.businessName ??
      user.businessName,

    businessType:
      business?.businessType ??
      user.businessType,

    // "solo" (owner verifies receipts themselves, no staff) or "team"
    // (staff verify instead - see the Dashboard staff panel and the
    // "Upgrade to Pro" flow that switches this).
    accountMode:
      business?.accountMode ??
      user.accountMode ??
      "solo",

    /*
     * ========================================================
     * BUSINESS DU PT BALANCE
     * ========================================================
     */
    duptBalance: businessBalance,

    /*
     * Backwards compatibility.
     */
    walletBalance: businessBalance,

    /*
     * Business configuration.
     *
     * Staff should see the business owner's configuration.
     */
    lowBalanceThreshold:
      business?.lowBalanceThreshold ??
      user.lowBalanceThreshold,

    cbeAccountSuffix:
      business?.cbeAccountSuffix ??
      user.cbeAccountSuffix,

    abyssiniaAccountSuffix:
      business?.abyssiniaAccountSuffix ??
      user.abyssiniaAccountSuffix,

    /*
     * Personal preferences belong to the
     * currently logged-in account.
     */
    themePreference:
      user.themePreference,

    notificationPreferences:
      user.notificationPreferences,

    // Double opt-in status — the frontend uses this to
    // restrict unverified accounts.
    isVerified: user.isVerified ?? false,

    // Google sign-ups must complete phone/businessType first.
    profileComplete: user.profileComplete ?? true,
  };
}

/* ============================================================
   GOOGLE OAUTH
============================================================ */

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID;

const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET;

const GOOGLE_OAUTH_COOKIE = "dv_google_oauth";
const GOOGLE_OAUTH_STATE_TTL_SECONDS = 10 * 60;

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function normalizeCallbackUrl(value) {
  try {
    const url = new URL(String(value || "").trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

const FRONTEND_ORIGINS = [
  process.env.FRONTEND_URL,
  ...(process.env.FRONTEND_URLS || "").split(","),
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
]
  .map(normalizeOrigin)
  .filter((origin, index, origins) => origin && origins.indexOf(origin) === index);

const DEFAULT_FRONTEND_ORIGIN =
  normalizeOrigin(process.env.FRONTEND_URL) || FRONTEND_ORIGINS[0] || "http://localhost:5173";

const GOOGLE_CALLBACK_URLS = [
  process.env.GOOGLE_CALLBACK_URL,
  ...(process.env.GOOGLE_CALLBACK_URLS || "").split(","),
  process.env.BASE_URL
    ? `${String(process.env.BASE_URL).trim().replace(/\/+$/, "")}/api/auth/google/callback`
    : null,
  "http://localhost:5000/api/auth/google/callback",
]
  .map(normalizeCallbackUrl)
  .filter((url, index, urls) => url && urls.indexOf(url) === index);

const GOOGLE_CALLBACK_URL =
  GOOGLE_CALLBACK_URLS[0] || "http://localhost:5000/api/auth/google/callback";

function requestGoogleCallbackUrl(req) {
  const forwardedProtocol = String(req.get("x-forwarded-proto") || "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProtocol || req.protocol;

  const forwardedHost = String(req.get("x-forwarded-host") || "")
    .split(",")[0]
    .trim();
  const host = forwardedHost || req.get("host");

  const requestedUrl = normalizeCallbackUrl(
    `${protocol}://${host}/api/auth/google/callback`
  );

  return GOOGLE_CALLBACK_URLS.includes(requestedUrl)
    ? requestedUrl
    : GOOGLE_CALLBACK_URL;
}

function parseCookie(req, name) {
  const prefix = `${name}=`;
  const part = String(req.headers.cookie || "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));

  return part ? decodeURIComponent(part.slice(prefix.length)) : null;
}

function secureStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function createGoogleState(origin, nonce) {
  return jwt.sign(
    {
      type: "google_oauth",
      origin,
      nonce,
    },
    process.env.JWT_SECRET,
    {
      audience: "google-oauth-state",
      expiresIn: GOOGLE_OAUTH_STATE_TTL_SECONDS,
    }
  );
}

function verifyGoogleState(req, res, next) {
  const callbackUrl = requestGoogleCallbackUrl(req);
  const secureCookie = callbackUrl.startsWith("https://");

  try {
    const payload = jwt.verify(String(req.query.state || ""), process.env.JWT_SECRET, {
      audience: "google-oauth-state",
    });
    const cookieNonce = parseCookie(req, GOOGLE_OAUTH_COOKIE);
    const origin = normalizeOrigin(payload.origin);

    if (
      payload.type !== "google_oauth" ||
      !FRONTEND_ORIGINS.includes(origin) ||
      !secureStringEqual(payload.nonce, cookieNonce)
    ) {
      throw new Error("OAuth state did not match");
    }

    res.clearCookie(GOOGLE_OAUTH_COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: "/api/auth/google",
    });

    req.googleFrontendOrigin = origin;
    req.googleCallbackUrl = callbackUrl;
    return next();
  } catch (err) {
    console.error("[auth/google] invalid state:", err.message);

    res.clearCookie(GOOGLE_OAUTH_COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: "/api/auth/google",
    });

    return res.redirect(`${DEFAULT_FRONTEND_ORIGIN}/login?google=invalid_state`);
  }
}

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  const { Strategy } = require("passport-google-oauth20");

  passport.use(
    new Strategy(
      {
        clientID: GOOGLE_CLIENT_ID,

        clientSecret: GOOGLE_CLIENT_SECRET,

        callbackURL: GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          const emailVerified =
            profile._json?.email_verified ?? profile._json?.verified_email;

          if (!email || emailVerified !== true) {
            return done(new Error("Google account has no verified email"));
          }

          let user = await User.findOne({
            $or: [{ googleId: profile.id }, { email }],
          });

          if (user) {
            if (!user.isActive) {
              return done(null, false, { message: "Account is disabled" });
            }

            if (user.googleId && user.googleId !== profile.id) {
              return done(new Error("Email is already linked to another Google account"));
            }

            // Link Google identity to the existing account.
            if (!user.googleId) {
              user.googleId = profile.id;
            }

            if (!user.avatarUrl && profile.photos?.[0]?.value) {
              user.avatarUrl = profile.photos[0].value;
            }

            // Google has verified this email for us.
            user.isVerified = true;

            await user.save();

            return done(null, user);
          }

          /*
           * New Google signup. Phone is required by the schema
           * and unique — use a placeholder derived from the
           * Google ID; the owner can set a real one later.
           */
          user = await User.create({
            businessName:
              `${profile.displayName || "My"} Business`,

            ownerName:
              profile.displayName || "Google User",

            phone: `G-${profile.id}`,

            email,

            googleId: profile.id,

            avatarUrl:
              profile.photos?.[0]?.value || null,

            // Random unusable, bcrypt-hashed password — Google logins only.
            password: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12),

            role: "owner",

            businessType: "other",

            duptBalance: signupBonusFor("other"),

            walletMigratedAt: new Date(),

            // Google accounts are trusted as verified instantly.
            isVerified: true,

            // But they must supply phone / business type before
            // using the app (see PATCH /auth/complete-profile).
            profileComplete: false,
          });

          if (user.duptBalance > 0) {
            await BillingLedger.create({
              businessId: user._id,

              userId: null,

              type: "ADMIN_CREDIT",

              duptAmount: user.duptBalance,

              balanceBefore: 0,

              balanceAfter: user.duptBalance,

              provider: "signup_bonus",

              reason: 'Signup bonus for business type "other"',

              status: "success",
            });
          }

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
} else {
  console.warn(
    "[auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured — Google sign-in disabled"
  );
}

/* ============================================================
   BUSINESS TYPES
============================================================ */

// GET /api/auth/business-types
router.get(
  "/business-types",
  (req, res) => {
    res.json({
      businessTypes:
        BUSINESS_TYPES,
    });
  }
);


/* ============================================================
   REGISTER
============================================================ */

// POST /api/auth/register
router.post(
  "/register",
  async (req, res) => {
    try {
      const {
        businessName,
        ownerName,
        phone,
        email,
        password,
        businessType,
        accountMode,
      } = req.body;

      /*
       * Basic validation
       */
      if (
        !businessName ||
        !ownerName ||
        !phone ||
        !email ||
        !password ||
        !businessType
      ) {
        return res.status(400).json({
          error:
            "All fields are required, including business type",
        });
      }

      /*
       * "Just me" vs "me and a team" - defaults to solo (verify it
       * yourself) if the field is missing/invalid rather than reject
       * the whole signup over it.
       */
      const normalizedAccountMode =
        accountMode === "team" ? "team" : "solo";

      /*
       * Validate business type
       */
      if (
        !BUSINESS_TYPE_KEYS.includes(
          businessType
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid business type",
        });
      }

      /*
       * EMAIL SANITY CHECKS (pre-filtering):
       * strict format, disposable blocklist, MX record.
       */
      const emailCheck =
        await validateRegistrationEmail(email);

      if (!emailCheck.ok) {
        return res.status(400).json({
          error: emailCheck.error,
        });
      }

      /*
       * Prevent duplicate accounts — checked against BOTH real users
       * and other in-flight registrations still awaiting verification.
       */
      const normalizedEmail = String(email).toLowerCase().trim();

      const existing =
        await User.findOne({
          $or: [
            { email: normalizedEmail },
            { phone },
          ],
        });

      const existingPending =
        await PendingRegistration.findOne({
          $or: [
            { email: normalizedEmail },
            { phone },
          ],
        });

      /*
       * A committed account always blocks registration.
       *
       * A leftover PENDING registration does NOT: it means a previous
       * attempt never finished the OTP step (abandoned tab, OTP email
       * that failed to send, etc.). Replacing it lets the user simply
       * register again instead of being stuck on "already in use" for
       * an account that doesn't actually exist.
       */
      if (existing) {
        return res.status(409).json({
          error:
            "An account with that email or phone already exists",
        });
      }

      if (existingPending) {
        await PendingRegistration.deleteOne({ _id: existingPending._id });
      }

      /*
       * Signup bonus is determined
       * server-side.
       */
      const signupBonus =
        signupBonusFor(
          businessType
        );

      /*
       * Hash password.
       */
      const passwordHash =
        await bcrypt.hash(
          password,
          10
        );

      /*
       * IMPORTANT — DEFERRED COMMIT:
       *
       * Nothing is written to the `users` collection here. The whole
       * registration lives in a temporary PendingRegistration record
       * (auto-deleted after 24h) until the emailed OTP is confirmed.
       * The real business/user document + signup-bonus ledger entry
       * are created in /verify-otp only after the code checks out, so
       * abandoning the OTP step leaves zero residue in the database.
       */
      const pending =
        await PendingRegistration.create({
          businessName,
          ownerName,
          phone,
          email: normalizedEmail,
          businessType,
          accountMode: normalizedAccountMode,
          password:
            passwordHash,

          // Granted only when the account is committed.
          signupBonus,

          // TTL marker — MongoDB deletes stale sign-ups automatically.
          expiresAt: new Date(
            Date.now() + PENDING_TTL_MS
          ),
        });

      /*
       * DOUBLE OPT-IN VIA OTP: generate a 6-digit code and email it.
       * No JWT is issued here — the user must verify before anything
       * is committed or any protected route unlocks.
       */
      const otp = issueOtp(pending, "verify");

      await pending.save();

      try {
        await sendOtpEmail(pending.email, otp, "verify");
      } catch (emailErr) {
        console.error(
          "[auth/register] OTP email failed:",
          emailErr.message
        );
        return res.status(502).json({
          error: "Could not send the verification code. Please try again.",
        });
      }

      return res.status(201).json({
        needsVerification: true,

        email: pending.email,

        message:
          "We sent a 6-digit verification code to your email. Your account will be created once you confirm it.",
      });
    } catch (err) {
      console.error(
        "[auth/register]",
        err
      );

      return res.status(500).json({
        error:
          "Registration failed",

        detail:
          err.message,
      });
    }
  }
);


/* ============================================================
   EMAIL OTP — double opt-in
============================================================ */

/**
 * Shared OTP sender with a 60-second resend cooldown.
 * Internal helper for the endpoints below.
 */
async function sendUserOtp(user, purpose) {
  if (
    user.otpLastSentAt &&
    Date.now() - user.otpLastSentAt.getTime() <
      OTP_RESEND_COOLDOWN_MS
  ) {
    const wait = Math.ceil(
      (OTP_RESEND_COOLDOWN_MS -
        (Date.now() - user.otpLastSentAt.getTime())) /
        1000
    );

    const err = new Error(`Please wait ${wait}s before requesting a new code.`);

    err.cooldown = wait;

    throw err;
  }

  const code = issueOtp(user, purpose);

  await user.save();

  await sendOtpEmail(user.email, code, purpose);
}

// POST /api/auth/send-otp { email }
// Sends a verification OTP to an unverified account.
router.post(
  "/send-otp",
  async (req, res) => {
    try {
      const email = String(req.body.email || "")
        .toLowerCase()
        .trim();

      const user = await User.findOne({ email });

      /*
       * In-flight registration? Resend its code.
       */
      const pending =
        await PendingRegistration.findOne({ email });

      if (pending) {
        // Each new code refreshes the 24h TTL window too.
        pending.expiresAt = new Date(
          Date.now() + PENDING_TTL_MS
        );

        await sendUserOtp(pending, "verify");

        return res.json({
          ok: true,
          message: "A 6-digit code was sent to your email.",
        });
      }

      if (!user) {
        // Do not reveal whether the account exists.
        return res.json({
          ok: true,
          message: "If that account needs verification, a code has been sent.",
        });
      }

      if (user.isVerified || user.role === "staff") {
        return res.json({
          ok: true,
          message: "This account is already verified.",
        });
      }

      await sendUserOtp(user, "verify");

      return res.json({
        ok: true,
        message: "A 6-digit code was sent to your email.",
      });
    } catch (err) {
      if (err.cooldown) {
        return res.status(429).json({ error: err.message });
      }

      console.error("[auth/send-otp]", err.message);

      return res.status(500).json({ error: "Could not send code" });
    }
  }
);

// POST /api/auth/verify-otp { email, otp }
// Confirms the code and issues the session JWT.
//
// Two cases:
//   1. A pending (not-yet-created) registration matches → THIS is
//      where the real User document + signup-bonus ledger entry are
//      finally committed, the pending record is removed, and the
//      session is issued. The user lands on their dashboard with a
//      fully materialized account and nothing before this point was
//      ever saved to `users`.
//   2. An existing unverified account (legacy / password-reset flow)
//      → verified in place, as before.
router.post(
  "/verify-otp",
  async (req, res) => {
    try {
      const email = String(req.body.email || "")
        .toLowerCase()
        .trim();

      const otp = String(req.body.otp || "").trim();

      /*
       * Case 1 — pending registration: commit it now.
       */
      const pending =
        await PendingRegistration.findOne({ email });

      if (pending) {
        if (!otpMatches(pending, otp, "verify")) {
          return res.status(400).json({
            error: "Invalid or expired code. Please try again.",
          });
        }

        /*
         * Final guard: another account may have claimed this email
         * or phone while verification was pending. If so, drop the
         * stale pending record — its data can no longer be used.
         */
        const clash = await User.findOne({
          $or: [
            { email: pending.email },
            { phone: pending.phone },
          ],
        });

        if (clash) {
          await PendingRegistration.deleteOne({ _id: pending._id });

          return res.status(409).json({
            error:
              "An account with that email or phone already exists. Please register again.",
          });
        }

        const user = await User.create({
          businessName: pending.businessName,
          ownerName: pending.ownerName,
          phone: pending.phone,
          email: pending.email,
          businessType: pending.businessType,
          accountMode: pending.accountMode || "solo",
          password: pending.password, // already bcrypt-hashed at register
          role: "owner",

          // New businesses start with their signup DU PT.
          duptBalance: pending.signupBonus,

          // Mark as already migrated so old wallet migration does
          // not credit the account again.
          walletMigratedAt: new Date(),

          // The emailed code just proved ownership of the address.
          isVerified: true,
        });

        /*
         * Record signup bonus in ledger.
         */
        if (pending.signupBonus > 0) {
          await BillingLedger.create({
            businessId: user._id,

            userId: null,

            type: "ADMIN_CREDIT",

            duptAmount: pending.signupBonus,

            balanceBefore: 0,

            balanceAfter: pending.signupBonus,

            provider: "signup_bonus",

            reason: `Signup bonus for business type "${pending.businessType}"`,

            status: "success",
          });
        }

        // Registration is committed — remove the temp record.
        await PendingRegistration.deleteOne({ _id: pending._id });

        console.log(`[auth] registration committed after OTP verify for ${user.email}`);

        const token = signToken(user);

        const safeUser = await publicUser(user);

        return res.json({
          ok: true,
          token,
          user: safeUser,
        });
      }

      /*
       * Case 2 — existing account (e.g. created before deferred
       * registration, or re-verification).
       */
      const user = await User.findOne({ email });

      if (!user || !otpMatches(user, otp, "verify")) {
        return res.status(400).json({
          error: "Invalid or expired code. Please try again.",
        });
      }

      user.isVerified = true;
      user.otpHash = null;
      user.otpPurpose = null;
      user.otpExpires = null;

      await user.save();

      console.log(`[auth] email verified via OTP for ${user.email}`);

      const token = signToken(user);

      const safeUser = await publicUser(user);

      return res.json({
        ok: true,
        token,
        user: safeUser,
      });
    } catch (err) {
      console.error("[auth/verify-otp]", err.message);

      return res.status(500).json({ error: "Verification failed" });
    }
  }
);

// POST /api/auth/resend-verification { email }
// Public resend used by the OTP screen.
router.post(
  "/resend-verification",
  async (req, res) => {
    try {
      const email = String(req.body.email || "")
        .toLowerCase()
        .trim();

      const user = await User.findOne({ email });

      /*
       * In-flight registration? Resend its code (and refresh TTL).
       */
      const pending =
        await PendingRegistration.findOne({ email });

      if (pending) {
        pending.expiresAt = new Date(
          Date.now() + PENDING_TTL_MS
        );

        await sendUserOtp(pending, "verify");

        return res.json({
          ok: true,
          message: "A new code was sent to your email.",
        });
      }

      if (!user || user.isVerified || user.role === "staff") {
        return res.json({
          ok: true,
          message: "If that account needs verification, a code has been sent.",
        });
      }

      await sendUserOtp(user, "verify");

      return res.json({
        ok: true,
        message: "A new code was sent to your email.",
      });
    } catch (err) {
      if (err.cooldown) {
        return res.status(429).json({ error: err.message });
      }

      console.error("[auth/resend-verification]", err.message);

      return res.status(500).json({ error: "Could not send code" });
    }
  }
);


/* ============================================================
   FORGOT / RESET PASSWORD (email OTP)
============================================================ */

// POST /api/auth/forgot-password { email }
router.post(
  "/forgot-password",
  async (req, res) => {
    try {
      const email = String(req.body.email || "")
        .toLowerCase()
        .trim();

      const user = await User.findOne({ email });

      // Never reveal whether the account exists.
      if (!user || !user.email) {
        return res.json({
          ok: true,
          message: "If that account exists, a reset code has been sent.",
        });
      }

      await sendUserOtp(user, "reset");

      return res.json({
        ok: true,
        message: "A reset code was sent to your email.",
      });
    } catch (err) {
      if (err.cooldown) {
        return res.status(429).json({ error: err.message });
      }

      console.error("[auth/forgot-password]", err.message);

      return res.status(500).json({ error: "Could not send reset code" });
    }
  }
);

// POST /api/auth/reset-password { email, otp, newPassword }
router.post(
  "/reset-password",
  async (req, res) => {
    try {
      const email = String(req.body.email || "")
        .toLowerCase()
        .trim();

      const otp = String(req.body.otp || "").trim();

      const newPassword = String(req.body.newPassword || "");

      if (newPassword.length < 8) {
        return res.status(400).json({
          error: "New password must be at least 8 characters",
        });
      }

      const user = await User.findOne({ email });

      if (!user || !otpMatches(user, otp, "reset")) {
        return res.status(400).json({
          error: "Invalid or expired code.",
        });
      }

      user.password = await bcrypt.hash(newPassword, 10);

      // Invalidate the used code.
      user.otpHash = null;
      user.otpPurpose = null;
      user.otpExpires = null;

      await user.save();

      console.log(`[auth] password reset via OTP for ${user.email}`);

      return res.json({
        ok: true,
        message: "Password updated. You can now sign in.",
      });
    } catch (err) {
      console.error("[auth/reset-password]", err.message);

      return res.status(500).json({ error: "Password reset failed" });
    }
  }
);


/* ============================================================
   COMPLETE PROFILE (Google sign-ups)
============================================================ */

// PATCH /api/auth/complete-profile { phone, businessType, businessName? }
// Google accounts are created without phone/businessType; they must
// supply them before using the app.
router.patch(
  "/complete-profile",
  requireAuth,
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id);

      if (!user) {
        return res.status(404).json({ error: "Account not found" });
      }

      const { phone, businessType, businessName } = req.body;

      if (!phone || !String(phone).trim()) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      if (!BUSINESS_TYPE_KEYS.includes(businessType)) {
        return res.status(400).json({ error: "Invalid business type" });
      }

      const existing = await User.findOne({
        phone,

        _id: { $ne: user._id },
      });

      if (existing) {
        return res.status(409).json({
          error: "An account with that phone number already exists",
        });
      }

      user.phone = String(phone).trim();

      user.businessType = businessType;

      if (businessName && String(businessName).trim()) {
        user.businessName = String(businessName).trim();
      }

      user.profileComplete = true;

      await user.save();

      const safeUser = await publicUser(user);

      return res.json({
        ok: true,
        user: safeUser,
      });
    } catch (err) {
      console.error("[auth/complete-profile]", err.message);

      return res.status(500).json({ error: "Could not complete profile" });
    }
  }
);


/* ============================================================
   LOGIN
============================================================ */

// POST /api/auth/login
//
// Owner, staff or admin login.
//
// The identifier field accepts EITHER an email address OR a phone
// number — staff accounts have no email and sign in with their
// phone. Owners/admins always have an email.
router.post(
  "/login",
  async (req, res) => {
    try {
      const rawInput = String(
        req.body.identifier ||
        req.body.email ||
        req.body.phone ||
        ""
      ).trim();

      const { password } = req.body;

      if (!rawInput || !password) {
        return res.status(400).json({
          error: "Email/phone and password are required",
        });
      }

      /*
       * Find account flexibly by email OR phone.
       * Supports normalized phone numbers (e.g. spaces, +251 prefix).
       */
      const normalizedEmail = rawInput.toLowerCase();
      const strippedPhone = rawInput.replace(/[\s\-\(\)]/g, "");
      const ethiopianPhone = strippedPhone.replace(/^\+?251/, "0");

      const searchConditions = [
        { email: normalizedEmail },
        { phone: rawInput },
        { phone: strippedPhone },
        { phone: ethiopianPhone },
      ];

      const user = await User.findOne({
        $or: searchConditions,
      });

      /*
       * No committed account — but maybe they are still mid-registration
       * (never finished the OTP step). Point them at the verify screen
       * with a fresh code instead of a generic "invalid credentials".
       */
      if (!user) {
        const pending = await PendingRegistration.findOne({
          $or: searchConditions,
        });

        if (pending) {
          try {
            pending.expiresAt = new Date(
              Date.now() + PENDING_TTL_MS
            );

            await sendUserOtp(pending, "verify");
          } catch (otpErr) {
            // Cooldown is fine — a valid code was sent recently.
            if (!otpErr.cooldown) throw otpErr;
          }

          return res.status(403).json({
            error:
              "Please verify your email to finish creating your account. We sent you a 6-digit code — enter it to continue.",

            code: "EMAIL_NOT_VERIFIED",

            email: pending.email,
          });
        }

        return res.status(401).json({
          error:
            "Invalid credentials",
        });
      }

      if (
        !user.isActive
      ) {
        return res.status(401).json({
          error:
            "Invalid credentials",
        });
      }

      /*
       * Validate password.
       */
      const valid =
        await bcrypt.compare(
          password,
          user.password
        );

      if (!valid) {
        return res.status(401).json({
          error:
            "Invalid credentials",
        });
      }

      /*
       * OWNERS must confirm their email via OTP before they get a
       * session. Staff are created by the business admin and skip
       * verification entirely; admins are created on the server.
       */
      if (
        user.role === "owner" &&
        user.isVerified !== true
      ) {
        try {
          await sendUserOtp(user, "verify");
        } catch (otpErr) {
          if (!otpErr.cooldown) throw otpErr;
        }

        return res.status(403).json({
          error:
            "Your email is not verified. We sent you a 6-digit code — enter it to continue.",

          code: "EMAIL_NOT_VERIFIED",

          email: user.email,
        });
      }

      /*
       * Create token.
       */
      const token =
        signToken(user);

      /*
       * IMPORTANT:
       *
       * publicUser() resolves the business
       * wallet for staff.
       *
       * Therefore:
       *
       * Owner:
       *   user.duptBalance
       *
       * Staff:
       *   business.duptBalance
       */
      const safeUser =
        await publicUser(user);

      return res.json({
        token,
        user: safeUser,
      });
    } catch (err) {
      console.error(
        "[auth/login]",
        err
      );

      return res.status(500).json({
        error:
          "Login failed",

        detail:
          err.message,
      });
    }
  }
);


/* ============================================================
   CURRENT SESSION
============================================================ */

// GET /api/auth/me
router.get(
  "/me",
  requireAuth,
  async (req, res) => {
    try {
      /*
       * Re-read the current business
       * balance from MongoDB.
       *
       * This prevents a stale staff
       * wallet value from being returned.
       */
      const safeUser =
        await publicUser(
          req.user
        );

      return res.json({
        user: safeUser,
      });
    } catch (err) {
      console.error(
        "[auth/me]",
        err
      );

      return res.status(500).json({
        error:
          "Could not load current session",

        detail:
          err.message,
      });
    }
  }
);


/* ============================================================
   UPDATE PERSONAL INFORMATION
============================================================ */

// PATCH /api/auth/me
router.patch(
  "/me",
  requireAuth,
  async (req, res) => {
    try {
      const {
        businessName,
        ownerName,
        phone,
        email,
        cbeAccountSuffix,
        abyssiniaAccountSuffix,
      } = req.body;

      /*
       * Required personal fields.
       */
      if (
        !ownerName ||
        !phone ||
        !email
      ) {
        return res.status(400).json({
          error:
            "Name, phone, and email are required",
        });
      }

      /*
       * Only owners can modify
       * business-level configuration.
       */
      if (
        req.user.role === "owner"
      ) {
        /*
         * Business name.
         */
        if (businessName) {
          req.user.businessName =
            businessName;
        }

        /*
         * CBE account suffix.
         */
        if (
          cbeAccountSuffix !==
          undefined
        ) {
          if (
            cbeAccountSuffix &&
            !/^\d{8}$/.test(
              cbeAccountSuffix
            )
          ) {
            return res.status(400).json({
              error:
                "CBE account suffix must be exactly 8 digits",
            });
          }

          req.user.cbeAccountSuffix =
            cbeAccountSuffix;
        }

        /*
         * Abyssinia account suffix.
         */
        if (
          abyssiniaAccountSuffix !==
          undefined
        ) {
          if (
            abyssiniaAccountSuffix &&
            !/^\d{5}$/.test(
              abyssiniaAccountSuffix
            )
          ) {
            return res.status(400).json({
              error:
                "Abyssinia account suffix must be exactly 5 digits",
            });
          }

          req.user.abyssiniaAccountSuffix =
            abyssiniaAccountSuffix;
        }
      }

      /*
       * Prevent email/phone collisions.
       */
      const conflict =
        await User.findOne({
          _id: {
            $ne: req.user._id,
          },

          $or: [
            { email },
            { phone },
          ],
        });

      if (conflict) {
        return res.status(409).json({
          error:
            "That email or phone is already in use by another account",
        });
      }

      /*
       * Update personal information.
       */
      req.user.ownerName =
        ownerName;

      req.user.phone =
        phone;

      req.user.email =
        email;

      await req.user.save();

      /*
       * Return normalized user.
       *
       * For staff this also includes
       * the current business DU PT balance.
       */
      const safeUser =
        await publicUser(
          req.user
        );

      return res.json({
        user: safeUser,
      });
    } catch (err) {
      console.error(
        "[auth/me PATCH]",
        err
      );

      return res.status(500).json({
        error:
          "Could not update profile",

        detail:
          err.message,
      });
    }
  }
);


/* ============================================================
   CHANGE PASSWORD
============================================================ */

// PATCH /api/auth/me/password
router.patch(
  "/me/password",
  requireAuth,
  async (req, res) => {
    try {
      const {
        currentPassword,
        newPassword,
      } = req.body;

      /*
       * Validate input.
       */
      if (
        !currentPassword ||
        !newPassword
      ) {
        return res.status(400).json({
          error:
            "Current and new password are required",
        });
      }

      /*
       * Minimum password length.
       */
      if (
        newPassword.length < 8
      ) {
        return res.status(400).json({
          error:
            "New password must be at least 8 characters",
        });
      }

      /*
       * Validate current password.
       */
      const valid =
        await bcrypt.compare(
          currentPassword,
          req.user.password
        );

      if (!valid) {
        return res.status(401).json({
          error:
            "Current password is incorrect",
        });
      }

      /*
       * Hash and save new password.
       */
      req.user.password =
        await bcrypt.hash(
          newPassword,
          10
        );

      await req.user.save();

      return res.json({
        ok: true,
      });
    } catch (err) {
      console.error(
        "[auth/me/password]",
        err
      );

      return res.status(500).json({
        error:
          "Could not update password",

        detail:
          err.message,
      });
    }
  }
);


/* ============================================================
   PREFERENCES
============================================================ */

// PATCH /api/auth/me/preferences
router.patch(
  "/me/preferences",
  requireAuth,
  async (req, res) => {
    try {
      const {
        themePreference,
        notificationPreferences,
      } = req.body;

      /*
       * Theme.
       */
      if (
        themePreference !==
        undefined
      ) {
        if (
          ![
            "light",
            "dark",
            "system",
          ].includes(
            themePreference
          )
        ) {
          return res.status(400).json({
            error:
              "themePreference must be light, dark, or system",
          });
        }

        req.user.themePreference =
          themePreference;
      }

      /*
       * Notification preferences.
       */
      if (
        notificationPreferences !==
        undefined
      ) {
        req.user.notificationPreferences =
        {
          ...req.user
            .notificationPreferences,

          ...notificationPreferences,
        };
      }

      await req.user.save();

      /*
       * Return normalized user
       * with current business balance.
       */
      const safeUser =
        await publicUser(
          req.user
        );

      return res.json({
        user: safeUser,
      });
    } catch (err) {
      console.error(
        "[auth/me/preferences]",
        err
      );

      return res.status(500).json({
        error:
          "Could not update preferences",

        detail:
          err.message,
      });
    }
  }
);

/* ============================================================
   ACCOUNT MODE — "Just me" (solo) vs "Me and a team" (team)
============================================================

   solo: the owner verifies receipts themselves; adding staff is
         locked.
   team: staff verify instead of the owner; this is the "Upgrade to
         Pro" action when switching FROM solo.

   Switching solo -> team is always allowed (that's the upgrade).
   Switching team -> solo is only allowed once there are no active
   staff accounts left, so an owner can't accidentally lock staff
   who are still working out of their own dashboard.
============================================================ */

// PATCH /api/auth/me/account-mode { accountMode: "solo" | "team" }
router.patch(
  "/me/account-mode",
  requireAuth,
  requireOwner,
  async (req, res) => {
    try {
      const { accountMode } = req.body;

      if (!["solo", "team"].includes(accountMode)) {
        return res.status(400).json({
          error: "accountMode must be 'solo' or 'team'",
        });
      }

      if (accountMode === "solo" && req.user.accountMode !== "solo") {
        const activeStaffCount = await User.countDocuments({
          businessId: req.user._id,
          role: "staff",
          isActive: true,
        });

        if (activeStaffCount > 0) {
          return res.status(409).json({
            error:
              "Disable or remove your active staff accounts before switching back to verifying receipts yourself.",
          });
        }
      }

      req.user.accountMode = accountMode;
      await req.user.save();

      const safeUser = await publicUser(req.user);

      return res.json({
        user: safeUser,
        message:
          accountMode === "team"
            ? "Upgraded to Pro. You can now add staff accounts."
            : "Switched back to verifying receipts yourself.",
      });
    } catch (err) {
      console.error("[auth/me/account-mode]", err.message);

      return res.status(500).json({
        error: "Could not update account mode",
        detail: err.message,
      });
    }
  }
);


/* ============================================================
   GOOGLE OAUTH ROUTES
============================================================ */

// GET /api/auth/google — start the OAuth flow.
//
// The frontend links here after selecting a healthy API. Signed `state`
// carries the allowlisted return origin and is bound to this browser with
// a short-lived HTTP-only cookie.
router.get(
  "/google",
  (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !process.env.JWT_SECRET) {
      return res.status(501).json({
        error: "Google sign-in is not configured",
      });
    }

    const requestedOrigin = normalizeOrigin(req.query.origin);
    const origin = FRONTEND_ORIGINS.includes(requestedOrigin)
      ? requestedOrigin
      : DEFAULT_FRONTEND_ORIGIN;

    const callbackUrl = requestGoogleCallbackUrl(req);
    const nonce = crypto.randomBytes(32).toString("base64url");
    const state = createGoogleState(origin, nonce);

    res.cookie(GOOGLE_OAUTH_COOKIE, nonce, {
      httpOnly: true,
      sameSite: "lax",
      secure: callbackUrl.startsWith("https://"),
      maxAge: GOOGLE_OAUTH_STATE_TTL_SECONDS * 1000,
      path: "/api/auth/google",
    });

    return passport.authenticate("google", {
      scope: ["profile", "email"],

      state,
      callbackURL: callbackUrl,
      session: false,
    })(req, res, next);
  }
);

// GET /api/auth/google/callback — Google redirects here.
//
// Issues the same JWT as normal login and redirects the browser
// back to the frontend with the token in the URL fragment (#),
// which is never sent to any server.
router.get(
  "/google/callback",
  verifyGoogleState,
  (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");

    passport.authenticate(
      "google",
      {
        session: false,
        callbackURL: req.googleCallbackUrl,
      },
      async (err, user) => {
        try {
          const origin = req.googleFrontendOrigin;

          if (err || !user) {
            console.error(
              "[auth/google] failed:",
              err?.message || "no user"
            );

            return res.redirect(`${origin}/login?google=failed`);
          }

          const token = signToken(user);

          const safeUser = await publicUser(user);

          const payload = encodeURIComponent(
            JSON.stringify({ token, user: safeUser })
          );

          return res.redirect(
            `${origin}/auth/success#payload=${payload}`
          );
        } catch (cbErr) {
          console.error("[auth/google] callback error:", cbErr.message);

          return res.redirect(
            `${DEFAULT_FRONTEND_ORIGIN}/login?google=failed`
          );
        }
      }
    )(req, res, next);
  }
);

/* ============================================================
   EXPORT
============================================================ */

module.exports = router;
