const express = require("express");
const multer = require("multer");
const User = require("../models/User");
const Verification = require("../models/Verification");
const BillingLedger = require("../models/BillingLedger");
const PaymentAccount = require("../models/PaymentAccount");
const PlatformSettings = require("../models/PlatformSettings");
const AdminAction = require("../models/AdminAction");
const { requireAuth } = require("../middleware/auth");
const { extractReceiptData } = require("../services/ocr");
const { verifyReceipt } = require("../services/veritas");
const { decodeQrFromImage } = require("../services/qrDecode");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

// One DU PT per billable verification.
const VERIFICATION_COST = 1;

router.use(requireAuth);

/* ============================================================
   EMAIL VERIFICATION GATE
============================================================

   Unverified accounts may not run verifications until they
   confirm their email address. Google accounts are verified
   automatically at login.
============================================================ */

router.use((req, res, next) => {
  if (
    req.user.role === "admin" ||
    req.user.isVerified !== false
  ) {
    return next();
  }

  return res.status(403).json({
    error:
      "Please verify your email address before running verifications. Check your inbox for the activation link.",

    code: "EMAIL_NOT_VERIFIED",
  });
});

/* ============================================================
   HELPERS
============================================================ */

/**
 * Normalize an account number.
 *
 * Example:
 *
 *   "1000-1234-5678" -> "100012345678"
 *   "100012345678"   -> "100012345678"
 */
function normalizeAccountNumber(value) {
  return String(value || "")
    .replace(/\D/g, "");
}

/**
 * Account-number normalization WITH explicit OCR letter
 * substitution.
 *
 * SAFE OCR substitutions only:
 *
 *   O/o -> 0     S/s -> 5     I/i -> 1     L/l -> 1     B/b -> 8
 *
 * Example:
 *
 *   "1234O678" -> "12340678"
 *   "1234-5678-9012" -> "123456789012"
 *
 * IMPORTANT:
 *
 *   This is NOT fuzzy matching. After normalization the
 *   comparison is exact — a genuinely changed digit can
 *   NEVER pass.
 */
function normalizeAccountNumberWithOcr(value) {
  return String(value || "")
    .replace(/[Oo]/g, "0")
    .replace(/[Ss]/g, "5")
    .replace(/[Ii]/g, "1")
    .replace(/[Ll]/g, "1")
    .replace(/[Bb]/g, "8")
    .replace(/\D/g, "");
}

/**
 * Normalize a person's name.
 */
function normalizeName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Collapse common OCR character confusions so that minor
 * scanning errors do not break comparison.
 *
 * Applied ONLY during fuzzy comparison — never to stored data.
 *
 *   0 <-> O     1 <-> I / L     5 <-> S     8 <-> B
 */
function ocrCollapse(value) {
  return String(value || "")
    .replace(/[0o]/g, "0")
    .replace(/[1il|]/g, "1")
    .replace(/[5s]/g, "5")
    .replace(/[8b]/g, "8");
}

/**
 * Levenshtein edit distance (small strings only).
 */
function editDistance(a, b) {
  if (a === b) return 0;

  const m = a.length;
  const n = b.length;

  if (!m || !n) return Math.max(m, n);

  let prev = Array.from(
    { length: n + 1 },
    (_, i) => i
  );

  for (let i = 1; i <= m; i++) {
    const curr = [i];

    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] +
          (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }

    prev = curr;
  }

  return prev[n];
}

/**
 * Compare two single name tokens tolerantly.
 *
 * Tokens are considered equivalent when they are equal,
 * equal after OCR-character collapse, or within a small
 * edit distance proportional to their length.
 */
function tokensFuzzyMatch(a, b) {
  if (!a || !b) return false;

  if (a === b) return true;

  const ca = ocrCollapse(a);
  const cb = ocrCollapse(b);

  if (ca === cb) return true;

  // SECURITY: be conservative with very short tokens.
  // Edit distance becomes unreliable there ("ALI" vs "ABE"),
  // so short tokens must match exactly or via OCR collapse.
  if (Math.min(ca.length, cb.length) < 4) {
    return false;
  }

  const maxLen = Math.max(ca.length, cb.length);

  // Allow ~1 edit per 4 characters, minimum 1.
  const tolerance = Math.max(1, Math.floor(maxLen / 4));

  return editDistance(ca, cb) <= tolerance;
}

/**
 * OCR-tolerant holder-name matching.
 *
 * Acceptance rules:
 *
 *   - exact normalized equality
 *   - first + last token agreement (exact or fuzzy)
 *     with sufficient overall token overlap
 *   - missing middle names are tolerated
 *   - extra/missing spaces and case differences ignored
 *   - completely different names NEVER match
 *
 * Returns { matched, similarity } for logging.
 */
function ocrTolerantNamesMatch(expectedName, receivedName) {
  const expected = normalizeName(expectedName);
  const received = normalizeName(receivedName);

  if (!expected || !received) {
    return { matched: false, similarity: 0 };
  }

  if (expected === received) {
    return { matched: true, similarity: 1 };
  }

  const expectedParts = expected.split(" ");
  const receivedParts = received.split(" ");

  if (expectedParts.length < 2 || receivedParts.length < 2) {
    return { matched: false, similarity: 0 };
  }

  const expFirst = expectedParts[0];
  const expLast = expectedParts[expectedParts.length - 1];
  const recFirst = receivedParts[0];
  const recLast = receivedParts[receivedParts.length - 1];

  // First AND last name must agree (fuzzily).
  const firstOk = tokensFuzzyMatch(expFirst, recFirst);
  const lastOk = tokensFuzzyMatch(expLast, recLast);

  if (!firstOk || !lastOk) {
    return { matched: false, similarity: 0 };
  }

  // Require sufficient overlap between the token sets so that
  // unrelated holders cannot pass on first+last alone when the
  // configured name has more parts.
  const matchedTokens = expectedParts.filter((token) =>
    receivedParts.some((other) => tokensFuzzyMatch(token, other))
  ).length;

  const similarity =
    matchedTokens / Math.max(expectedParts.length, receivedParts.length);

  // If both names have the same number of parts, first+last
  // agreement is strong enough. If part counts differ (missing
  // middle name), require at least half the tokens to agree.
  const samePartCount =
    expectedParts.length === receivedParts.length;

  const threshold = samePartCount ? 0.5 : 0.5;

  const matched = similarity >= threshold;

  console.log(
    "[HolderMatch]",
    JSON.stringify({
      holderComparison: "tolerant",

      expectedTokenCount: expectedParts.length,

      receivedTokenCount: receivedParts.length,

      matchedTokens,

      similarity: Number(similarity.toFixed(2)),

      result: matched ? "MATCH" : "MISMATCH",
    })
  );

  return { matched, similarity };
}

/**
 * Legacy exact matcher kept for callers that need strictness.
 */
function namesMatch(expectedName, receivedName) {
  return ocrTolerantNamesMatch(
    expectedName,
    receivedName
  ).matched;
}

/**
 * Name matching.
 *
 * Either:
 *
 *   John Doe
 *   JOHN DOE
 *
 * or:
 *
 *   John Michael Doe
 *   John Doe
 *
 * are considered the same person.
 *
 * First + last names must match.
 */
function namesMatch(expectedName, receivedName) {
  const expected =
    normalizeName(expectedName);

  const received =
    normalizeName(receivedName);

  if (!expected || !received) {
    return false;
  }

  if (expected === received) {
    return true;
  }

  const expectedParts =
    expected.split(" ");

  const receivedParts =
    received.split(" ");

  if (
    expectedParts.length < 2 ||
    receivedParts.length < 2
  ) {
    return false;
  }

  const expectedFirst =
    expectedParts[0];

  const expectedLast =
    expectedParts[
    expectedParts.length - 1
    ];

  const receivedFirst =
    receivedParts[0];

  const receivedLast =
    receivedParts[
    receivedParts.length - 1
    ];

  return (
    expectedFirst === receivedFirst &&
    expectedLast === receivedLast
  );
}

/**
 * Account number matching.
 */
/**
 * Account number matching.
 *
 * Harmless formatting differences (spaces, dashes) are ignored
 * and safe OCR letter substitutions are normalized — but after
 * that the comparison is STRICTLY EXACT.
 *
 * No edit distance. No fuzzy matching. A single genuinely
 * changed digit is always a mismatch.
 */
function accountNumbersMatch(
  expectedAccount,
  receivedAccount
) {
  const expected =
    normalizeAccountNumberWithOcr(
      expectedAccount
    );

  const received =
    normalizeAccountNumberWithOcr(
      receivedAccount
    );

  if (!expected || !received) {
    return false;
  }

  return expected === received;
}

/**
 * Generate account suffix automatically.
 *
 * CBE       -> last 8 digits
 * Abyssinia -> last 5 digits
 *
 * Other providers do not need a suffix.
 */
function generateAccountSuffix(
  provider,
  accountNumber
) {
  const digits =
    normalizeAccountNumber(
      accountNumber
    );

  const normalizedProvider =
    String(provider || "")
      .toLowerCase()
      .trim();

  if (normalizedProvider === "cbe") {
    return digits.slice(-8);
  }

  if (
    normalizedProvider === "abyssinia" ||
    normalizedProvider === "abisinya"
  ) {
    return digits.slice(-5);
  }

  return "";
}

/**
 * Extract an account number from provider responses.
 */
function extractReceiverAccountNumber(body) {
  if (!body) {
    return null;
  }

  const d =
    body.data ||
    body.result ||
    {};

  const candidates = [
    body.accountNumber,
    body.account_number,

    body.receiverAccountNumber,
    body.receiver_account_number,

    body.destinationAccount,
    body.destination_account,

    body.creditAccount,
    body.credit_account,

    body.toAccount,
    body.to_account,

    body.recipientAccount,
    body.recipient_account,

    body.receiverAccount,
    body.receiver_account,

    d.accountNumber,
    d.account_number,

    d.receiverAccountNumber,
    d.receiver_account_number,

    d.destinationAccount,
    d.destination_account,

    d.creditAccount,
    d.credit_account,

    d.toAccount,
    d.to_account,

    d.recipientAccount,
    d.recipient_account,

    d.receiverAccount,
    d.receiver_account,
  ];

  const found =
    candidates.find(
      (value) =>
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
    );

  return found
    ? String(found).trim()
    : null;
}

/**
 * Extract amount from Veritas response.
 */
function extractAmountFromVeritasBody(body) {
  if (!body) {
    return null;
  }

  const d =
    body.data ||
    body.result ||
    {};

  const candidates = [
    body.amount,
    body.totalAmount,
    body.transactionAmount,

    d.amount,
    d.totalAmount,
    d.transactionAmount,
  ];

  const found =
    candidates.find(
      (value) =>
        value !== undefined &&
        value !== null &&
        value !== ""
    );

  if (found == null) {
    return null;
  }

  const amount =
    Number(
      String(found)
        .replace(/,/g, "")
        .replace(/[^\d.-]/g, "")
    );

  return Number.isFinite(amount)
    ? amount
    : null;
}

/**
 * Extract payer, receiver, amount,
 * account number and transaction time.
 */
function extractPartyAndTimeFromVeritasBody(
  body
) {
  if (!body) {
    return {
      amount: null,
      payerName: null,
      receiverName: null,
      receiverAccountNumber: null,
      transactionTime: null,
    };
  }

  const d =
    body.data ||
    body.result ||
    {};

  const payerCandidates = [
    body.payer_name,
    body.payerName,
    body.sender,
    body.senderName,

    d.payer_name,
    d.payerName,
    d.sender,
    d.senderName,
  ];

  const receiverCandidates = [
    body.receiver_name,
    body.receiverName,
    body.receiver,

    body.recipientName,
    body.recipient_name,

    d.receiver_name,
    d.receiverName,
    d.receiver,

    d.recipientName,
    d.recipient_name,
  ];

  const timeCandidates = [
    body.transaction_date,
    body.transactionDate,
    body.date,
    body.timestamp,
    body.paidAt,

    d.transaction_date,
    d.transactionDate,
    d.date,
    d.timestamp,
    d.paidAt,
  ];

  const pick = (arr) =>
    arr.find(
      (value) =>
        value !== undefined &&
        value !== null &&
        value !== ""
    );

  const rawTime =
    pick(timeCandidates);

  const parsedTime =
    rawTime
      ? new Date(rawTime)
      : null;

  return {
    amount:
      extractAmountFromVeritasBody(
        body
      ),

    payerName:
      pick(payerCandidates) ||
      null,

    receiverName:
      pick(receiverCandidates) ||
      null,

    receiverAccountNumber:
      extractReceiverAccountNumber(
        body
      ),

    transactionTime:
      parsedTime &&
        !isNaN(
          parsedTime.getTime()
        )
        ? parsedTime
        : null,
  };
}

/**
 * Return only hour/minute used by waiter UI.
 */
function formatVerificationHour(
  date
) {
  if (!date) {
    return null;
  }

  const parsed =
    date instanceof Date
      ? date
      : new Date(date);

  if (
    isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  return parsed.toLocaleTimeString(
    "en-US",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  );
}

/**
 * ============================================================
 * MATCH RECEIVER AGAINST ALL ADMIN PAYMENT ACCOUNTS
 * ============================================================
 *
 * IMPORTANT:
 *
 * A business can have:
 *
 *   Awash account A
 *   Awash account B
 *   Awash account C
 *
 * The customer may pay to ANY of them.
 *
 * We consider the transaction valid when:
 *
 *   received account == ANY configured account
 *
 * OR
 *
 *   received holder name == ANY configured holder name
 *
 * Otherwise:
 *
 *   RECEIVER_MISMATCH
 */
/**
 * Match the receiver against admin-configured payment accounts.
 *
 * PROVIDER-SPECIFIC ACCOUNT SELECTION (STRICT):
 *
 * When the customer pays through a specific bank/provider, the
 * comparison MUST use the admin-configured receiver accounts
 * belonging to that SAME provider.
 *
 * Example:
 *
 *   Payment provider: Awash
 *   Admin config:     Awash -> A, CBE -> B, Dashen -> C
 *
 *   The Awash payment is compared ONLY against the configured
 *   Awash account(s). A valid CBE account/name does NOT make an
 *   Awash transaction pass.
 *
 * If the business has no accounts tagged with this provider,
 * we fall back to comparing all enabled accounts so existing
 * configurations keep working.
 *
 * Matching priority (ANY ONE reliable match is sufficient):
 *
 *   1. Exact normalized account-number match
 *   2. Strong OCR-tolerant holder-name match
 *
 * Account numbers are compared digit-preserving exact — OCR
 * tolerance applies to NAMES only, never to digits.
 */
function matchAgainstPaymentAccounts(
  paymentAccounts,
  receivedAccount,
  receivedHolder,
  bankName
) {
  let accountNumberMatch = false;
  let accountHolderNameMatch = false;

  let matchedAccount = null;

  // Provider-specific selection first.
  const normalizedBank =
    String(bankName || "")
      .toLowerCase()
      .trim();

  const providerAccounts = paymentAccounts.filter(
    (account) =>
      String(account.provider || "")
        .toLowerCase()
        .trim() === normalizedBank
  );

  /*
   * SECURITY:
   *
   * When accounts ARE tagged by provider, an Awash payment may
   * ONLY match Awash-tagged accounts — never a CBE/Dashen
   * account, even if the holder name is similar.
   *
   * The all-accounts fallback exists ONLY for legacy setups
   * where no account has a provider tag at all.
   */
  const anyTagged = paymentAccounts.some(
    (account) =>
      String(account.provider || "").trim() !== ""
  );

  const candidates = providerAccounts.length
    ? providerAccounts
    : anyTagged
      ? []
      : paymentAccounts;

  console.log(
    "[HolderMatch]",
    JSON.stringify({
      providerFilter: bankName,

      providerSpecificAccounts:
        providerAccounts.length,

      candidateAccounts: candidates.length,
    })
  );

  for (
    const paymentAccount of candidates
  ) {
    const accountMatches =
      accountNumbersMatch(
        paymentAccount.accountNumber,
        receivedAccount
      );

    const nameComparison =
      ocrTolerantNamesMatch(
        paymentAccount.accountHolderName,
        receivedHolder
      );

    const holderMatches =
      nameComparison.matched;

    if (accountMatches) {
      accountNumberMatch = true;
    }

    if (holderMatches) {
      accountHolderNameMatch = true;
    }

    /*
     * EITHER a reliable account-number match OR a
     * reliable holder-name match is enough.
     */
    if (
      accountMatches ||
      holderMatches
    ) {
      matchedAccount =
        paymentAccount;

      console.log(
        "[HolderMatch]",
        JSON.stringify({
          accountMatch: accountMatches,

          holderMatch: holderMatches
            ? "tolerant"
            : false,

          finalResult: "MATCH",
        })
      );

      break;
    }
  }

  if (!matchedAccount) {
    console.log(
      "[HolderMatch]",
      JSON.stringify({
        accountMatch: false,

        holderSimilarity: "insufficient",

        finalResult: "MISMATCH",
      })
    );
  }

  return {
    matched:
      Boolean(matchedAccount),

    accountNumberMatch,

    accountHolderNameMatch,

    matchedAccount,
  };
}

/* ============================================================
   POST /api/verify
============================================================ */

router.post(
  "/",
  upload.single("image"),
  async (req, res) => {
    try {
      const {
        bankName,
        expectedAmount,
        phoneNumber,
        transactionRef,
      } = req.body;

      const manualReference =
        transactionRef?.trim() || "";

      /* ========================================================
         STEP 0: BASIC VALIDATION
      ======================================================== */

      if (
        !req.file &&
        !manualReference
      ) {
        return res.status(400).json({
          error:
            "Receipt image or transaction reference is required",
        });
      }

      if (!bankName) {
        return res.status(400).json({
          error:
            "bankName is required",
        });
      }

      /* ========================================================
         STEP 0.1: EXPECTED AMOUNT
      ======================================================== */

      const hasExpectedAmount =
        expectedAmount !== undefined &&
        expectedAmount !== null &&
        String(
          expectedAmount
        ).trim() !== "";

      const normalizedExpectedAmount =
        hasExpectedAmount
          ? Number(expectedAmount)
          : null;

      if (
        hasExpectedAmount &&
        (
          !Number.isFinite(
            normalizedExpectedAmount
          ) ||
          normalizedExpectedAmount < 0
        )
      ) {
        return res.status(400).json({
          error:
            "expectedAmount must be a valid positive number",
        });
      }

      /* ========================================================
         STEP 0.2: LOAD BUSINESS
      ========================================================

         Admins have no business of their own - when an admin
         runs this (from the Admin dashboard's Verify tool, for
         a client who has no staff to do it themselves), the
         target business must be given explicitly.
      ======================================================== */

      let business;

      if (req.user.role === "owner") {
        business = req.user;
      } else if (req.user.role === "admin") {
        const targetBusinessId = req.body.businessId;

        if (!targetBusinessId) {
          return res.status(400).json({
            error:
              "Select a business to run this verification on behalf of.",
          });
        }

        business = await User.findOne({
          _id: targetBusinessId,
          role: "owner",
        });
      } else {
        business = await User.findById(
          req.user.businessId
        );
      }

      if (!business) {
        return res.status(404).json({
          error:
            "Business account not found",
        });
      }

      // "Team" accounts have staff verify receipts instead of the
      // owner - the owner manages the business, staff do the checks.
      // (Solo accounts have no staff at all, so this never applies to
      // them.) An admin acting on a team business's behalf via the
      // Admin dashboard's Verify tool is exempt - that's a deliberate
      // support override, logged above/below as such.
      if (
        req.user.role === "owner" &&
        business.accountMode === "team"
      ) {
        return res.status(403).json({
          error:
            "Your account is set up for a team - have one of your staff run this check, or add staff in your dashboard if you haven't yet.",
          code: "ACCOUNT_MODE_TEAM",
        });
      }

      // Audit trail: an admin running a check on a client's behalf is a
      // deliberate override of the normal "only the business itself
      // checks its own receipts" flow, and uses the existing
      // "verification_override" AdminAction type set aside for this.
      // Fire-and-forget - never block the actual verification on it.
      if (req.user.role === "admin") {
        AdminAction.create({
          adminId: req.user._id,
          businessId: business._id,
          action: "verification_override",
          reason: `Ran a ${bankName} receipt verification on behalf of this client.`,
        }).catch((err) =>
          console.error(
            "[verify] could not log admin verification_override:",
            err.message
          )
        );
      }

      /* ========================================================
         STEP 0.3: DU PT BALANCE
      ======================================================== */

      if (
        business.duptBalance <
        VERIFICATION_COST
      ) {
        return res.status(402).json({
          error:
            "Insufficient DU PT balance. Please top up.",
        });
      }

      /* ========================================================
         STEP 0.35: PLATFORM PROVIDER KILL SWITCH
      ======================================================== */

      const platformSettings =
        await PlatformSettings.getOrCreate();

      if (
        platformSettings
          .providerEnabled?.[
        bankName
        ] === false
      ) {
        return res.status(200).json({
          status:
            "NOT_VERIFIED",

          verified:
            false,

          userMessage:
            `${bankName} verification is temporarily unavailable. Please try again later or contact support.`,
        });
      }

      /* ========================================================
         STEP 0.4: LOAD ALL ADMIN CONFIGURED ACCOUNTS
      ========================================================

         IMPORTANT CHANGE:

         OLD:

           findOne()

         NEW:

           find()

         Therefore a business can configure:

           Awash account 1
           Awash account 2
           Awash account 3

         and all of them are accepted.
      */

      /* ========================================================
     STEP 0.4: LOAD ALL ADMIN CONFIGURED ACCOUNTS
  ========================================================
  
     IMPORTANT:
  
     bankName is ONLY the provider used to verify the
     transaction.
  
     It must NOT restrict which business payment accounts
     can receive the money.
  
     Example:
  
       Customer uses Awash
          ↓
       pays to CBE account
  
     The transaction is verified through Awash, but the
     receiver is allowed because the CBE account belongs
     to this business.
  */

      const paymentAccounts =
        await PaymentAccount.find({
          businessId:
            business._id,

          enabled:
            true,
        });

      if (
        !paymentAccounts ||
        paymentAccounts.length === 0
      ) {
        return res.status(200).json({
          status:
            "SITE_ERROR",

          verified:
            false,

          retryable:
            true,

          userMessage:
            "The business payment setup is incomplete. Please try again or contact the administrator.",
        });
      }

      console.log(
        "[verify] loaded all enabled payment accounts:",
        paymentAccounts.map(
          (account) => ({
            provider:
              account.provider,

            accountNumber:
              account.accountNumber,

            accountHolderName:
              account.accountHolderName,
          })
        )
      );

      console.log(
        `[verify] loaded ${paymentAccounts.length} configured ${bankName} payment account(s)`
      );

      /* ========================================================
         STEP 1: DETERMINE TRANSACTION REFERENCE
      ======================================================== */

      let extracted = null;

      let reference =
        manualReference;

      let qrReference = null;

      /* ========================================================
         STEP 1A: MANUAL REFERENCE
      ======================================================== */

      if (reference) {
        console.log(
          "[verify] using manually supplied reference:",
          reference
        );
      }

      /* ========================================================
         STEP 1B: CBE QR
      ======================================================== */

      if (
        !reference &&
        req.file &&
        bankName === "CBE"
      ) {
        try {
          const decodedQr =
            await decodeQrFromImage(
              req.file.buffer
            );

          console.log(
            "[verify] CBE QR decoded:",
            decodedQr
          );

          if (
            typeof decodedQr ===
            "string"
          ) {
            qrReference =
              decodedQr.trim();
          } else if (
            decodedQr &&
            typeof decodedQr ===
            "object"
          ) {
            qrReference =
              String(
                decodedQr.url ||
                decodedQr.text ||
                decodedQr.data ||
                decodedQr.rawValue ||
                ""
              ).trim();
          }

          if (qrReference) {
            reference =
              qrReference;

            console.log(
              "[verify] using CBE QR reference:",
              reference
            );
          }
        } catch (qrErr) {
          console.warn(
            "[verify] CBE QR decode failed:",
            qrErr.message
          );

          qrReference =
            null;
        }
      }

      /* ========================================================
         STEP 1C: OCR FOR NON-CBE
      ======================================================== */

      if (!reference) {
        if (bankName === "CBE") {
          if (!req.file) {
            const log =
              await Verification.create({
                businessId: business._id,
                checkedBy: req.user._id,
                bankName,
                transactionRef: "QR_NOT_FOUND",
                amount: normalizedExpectedAmount ?? 0,
                screenshotUrl: "not-stored",
                status: "OCR_FAILED",
                verificationCost: 0,
              });

            return res.status(200).json({
              status: "OCR_FAILED",
              verified: false,
              failureReason: "NO_REFERENCE",
              userMessage:
                "Could not find the CBE receipt QR code or a readable receipt reference. Please retake the receipt image or enter the CBE receipt link manually.",
              providerName: bankName,
              log,
            });
          }

          try {
            extracted = await extractReceiptData(
              req.file.buffer,
              req.file.mimetype
            );
          } catch (ocrErr) {
            console.error("[ocr] extraction failed:", ocrErr.message, ocrErr.cause || "");

            const userMessage =
              ocrErr.message.startsWith("Receipt scanning") ||
              ocrErr.message.startsWith("Could not analyze")
                ? ocrErr.message
                : "Could not read this receipt. Try a clearer photo of the full confirmation screen.";

            const log =
              await Verification.create({
                businessId: business._id,
                checkedBy: req.user._id,
                bankName,
                transactionRef: "UNKNOWN",
                amount: normalizedExpectedAmount ?? 0,
                screenshotUrl: "not-stored",
                status: "OCR_FAILED",
                verificationCost: 0,
              });

            return res.status(200).json({
              status: "OCR_FAILED",
              verified: false,
              failureReason: "API_ERROR",
              userMessage,
              providerName: bankName,
              log,
            });
          }

          // CBE USSD confirmation screens (dialed *847# etc.) can never be
          // verified - CBE exposes no public lookup for them, unlike a
          // real app/receipt screen (QR, mbreciept link, or FT reference).
          // extracted.isUSSDResult is the actual signal for this; it is
          // deliberately separate from "not a transaction image at all"
          // below, since a USSD screen IS a real transaction image - it
          // just isn't one CBE lets us verify.
          if (extracted?.failureReason === "CBE_USSD_NOT_ACCEPTED") {
            const log =
              await Verification.create({
                businessId: business._id,
                checkedBy: req.user._id,
                bankName,
                transactionRef: "USSD_NOT_ACCEPTED",
                amount: normalizedExpectedAmount ?? 0,
                screenshotUrl: "not-stored",
                status: "OCR_FAILED",
                verificationCost: 0,
              });

            return res.status(200).json({
              status: "OCR_FAILED",
              verified: false,
              failureReason: "CBE_USSD_NOT_ACCEPTED",
              userMessage: "CBE USSD results are not accepted.",
              providerName: bankName,
              log,
            });
          }

          if (
            extracted?.isTransactionImage === false ||
            extracted?.failureReason === "NOT_TRANSACTION" ||
            extracted?.issue === "not_transaction"
          ) {
            const log =
              await Verification.create({
                businessId: business._id,
                checkedBy: req.user._id,
                bankName,
                transactionRef: "UNKNOWN",
                amount: normalizedExpectedAmount ?? 0,
                screenshotUrl: "not-stored",
                status: "OCR_FAILED",
                verificationCost: 0,
              });

            return res.status(200).json({
              status: "OCR_FAILED",
              verified: false,
              failureReason: "NOT_TRANSACTION",
              userMessage: "This does not look like a payment receipt or USSD confirmation.",
              providerName: bankName,
              log,
            });
          }

          if (extracted?.extractionOk && extracted?.transactionRef) {
            reference = extracted.transactionRef.trim();
            console.log("[verify] CBE OCR reference:", reference);
          } else {
            const log =
              await Verification.create({
                businessId: business._id,
                checkedBy: req.user._id,
                bankName,
                transactionRef: "UNKNOWN",
                amount: normalizedExpectedAmount ?? 0,
                screenshotUrl: "not-stored",
                status: "OCR_FAILED",
                verificationCost: 0,
              });

            return res.status(200).json({
              status: "OCR_FAILED",
              verified: false,
              failureReason: extracted?.failureReason || "NO_REFERENCE",
              userMessage:
                extracted?.userMessage ||
                "Could not find a CBE receipt QR code or readable receipt reference.",
              imageQuality: extracted?.imageQuality,
              confidence: extracted?.confidence,
              providerName: bankName,
              log,
            });
          }
        } else {
          if (!req.file) {
            return res.status(400).json({
              error: "Receipt image or transaction reference is required",
            });
          }

          try {
            extracted = await extractReceiptData(
              req.file.buffer,
              req.file.mimetype
            );
          } catch (ocrErr) {
            console.error("[ocr] extraction failed:", ocrErr.message, ocrErr.cause || "");

            const userMessage =
              ocrErr.message.startsWith("Receipt scanning") ||
              ocrErr.message.startsWith("Could not analyze")
                ? ocrErr.message
                : "Could not read this receipt. Try a clearer photo of the full confirmation screen.";

            const log =
              await Verification.create({
                businessId: business._id,
                checkedBy: req.user._id,
                bankName,
                transactionRef: "UNKNOWN",
                amount: normalizedExpectedAmount ?? 0,
                screenshotUrl: "not-stored",
                status: "OCR_FAILED",
                verificationCost: 0,
              });

            return res.status(200).json({
              status: "OCR_FAILED",
              verified: false,
              failureReason: "API_ERROR",
              userMessage,
              providerName: bankName,
              log,
            });
          }

          if (!extracted || !extracted.extractionOk || !extracted.transactionRef) {
            const log =
              await Verification.create({
                businessId: business._id,
                checkedBy: req.user._id,
                bankName,
                transactionRef: "UNKNOWN",
                amount: normalizedExpectedAmount ?? 0,
                screenshotUrl: "not-stored",
                status: "OCR_FAILED",
                verificationCost: 0,
              });

            return res.status(200).json({
              status: "OCR_FAILED",
              verified: false,
              failureReason: extracted?.failureReason || "NO_REFERENCE",
              userMessage:
                extracted?.userMessage ||
                "Could not find a transaction reference in this image.",
              imageQuality: extracted?.imageQuality,
              confidence: extracted?.confidence,
              providerName: bankName,
              log,
            });
          }

          reference = extracted.transactionRef.trim();

          console.log("[verify] OCR reference:", reference);
        }
      }

      /* ========================================================
         STEP 2: DUPLICATE CHECK
      ========================================================

         Currently disabled as in previous implementation.
      */

      /* ========================================================
         STEP 3: CHARGE DU PT
      ======================================================== */

      const balanceBefore =
        business.duptBalance;

      business.duptBalance -=
        VERIFICATION_COST;

      const balanceAfter =
        business.duptBalance;

      await business.save();

      await BillingLedger.create({
        businessId:
          business._id,

        userId:
          req.user._id,

        type:
          "VERIFICATION_CHARGE",

        duptAmount:
          -VERIFICATION_COST,

        balanceBefore,

        balanceAfter,

        status:
          "success",

        reason:
          `Verification charge (${bankName})`,
      });

      /* ========================================================
         STEP 4: PROVIDER VERIFICATION
      ========================================================

         IMPORTANT:

         The provider confirms that the transaction itself
         exists.

         It does NOT decide which configured admin account
         belongs to the business.

         That comparison happens below against ALL
         paymentAccounts.
      */

      /*
       * Build suffixes for every configured account.
       *
       * This is useful for providers such as CBE/Abyssinia
       * that may need account suffix information.
       */
      const accountSuffixes =
        paymentAccounts
          .map(
            (account) =>
              account.accountSuffix ||
              generateAccountSuffix(
                bankName,
                account.accountNumber
              )
          )
          .filter(Boolean);

      /*
       * Keep the old single accountSuffix field for
       * backwards compatibility with providers that still
       * expect it.
       */
      const firstAccountSuffix =
        accountSuffixes[0] ||
        undefined;

      const veritasResult =
        await verifyReceipt({
          bankName,

          reference,

          /*
           * Backwards compatibility.
           */
          accountSuffix:
            bankName === "CBE" ||
              bankName === "Abyssinia"
              ? firstAccountSuffix
              : undefined,

          /*
           * New multi-account support.
           *
           * Providers can use this if they support
           * multiple configured accounts.
           */
          accountSuffixes:
            bankName === "CBE" ||
              bankName === "Abyssinia"
              ? accountSuffixes
              : undefined,

          /*
           * Full configured accounts are passed for
           * providers that need them.
           */
          paymentAccounts:
            paymentAccounts.map(
              (account) => ({
                accountNumber:
                  account.accountNumber,

                accountHolderName:
                  account.accountHolderName,

                accountSuffix:
                  account.accountSuffix ||
                  generateAccountSuffix(
                    bankName,
                    account.accountNumber
                  ),
              })
            ),

          phoneNumber,

          qrReference:
            bankName === "CBE"
              ? qrReference
              : null,
        });

      /* ========================================================
         STEP 5: DID PROVIDER CONFIRM REAL TRANSACTION?
      ======================================================== */

      const providerVerified =
        veritasResult.httpOk &&
        veritasResult.body?.success !==
        false;

      if (!providerVerified) {
        console.error(
          "[verify] Provider did not confirm transaction:",
          JSON.stringify({
            bankName,

            reference,

            httpStatus:
              veritasResult.status,

            body:
              veritasResult.body,
          })
        );
      }

      /* ========================================================
         STEP 6: EXTRACT PROVIDER DATA
      ======================================================== */

      const providerDetails =
        providerVerified
          ? extractPartyAndTimeFromVeritasBody(
            veritasResult.body
          )
          : null;

      /* ========================================================
         STEP 7: PROVIDER RESULT (CLASSIFICATION-BASED)
      ========================================================

         The provider adapter supplies a classification:

           VALID | NOT_VERIFIED | PROVIDER_UNAVAILABLE
               | INVALID_FORMAT (local input validation)

         STRICT RULE:

           A provider failing to respond is NEVER evidence
           that the transaction is invalid.

           PROVIDER_UNAVAILABLE => neutral result + DU PT refund.
      ======================================================== */

      const classification =
        veritasResult.classification || {
          status: providerVerified
            ? "VALID"
            : "PROVIDER_UNAVAILABLE",

          reason: "LEGACY_FALLBACK",

          retryable: !providerVerified,
        };

      console.log(
        `[verify] ${bankName} classification: ${classification.status} (${classification.reason || "n/a"})`
      );

      let status =
        "INVALID_FORMAT";

      if (
        classification.status ===
        "PROVIDER_UNAVAILABLE"
      ) {
        status = "PROVIDER_UNAVAILABLE";
      } else if (
        classification.status ===
        "NOT_VERIFIED"
      ) {
        status = "NOT_VERIFIED";
      } else if (providerVerified) {
        const providerAmount =
          providerDetails?.amount;

        if (
          hasExpectedAmount &&
          providerAmount != null &&
          Number(providerAmount) +
          0.01 <
          Number(
            normalizedExpectedAmount
          )
        ) {
          status =
            "AMOUNT_MISMATCH";
        } else {
          status =
            "VALID";
        }
      } else {
        // Unknown/unclassified failure fails safe.
        status = "PROVIDER_UNAVAILABLE";
      }

      /* ========================================================
         STEP 7.5: DU PT REFUND ON PROVIDER OUTAGE
      ========================================================

         A provider outage is NOT a successful verification.
         The credit is refunded in full and a reversal entry
         is written to the billing ledger.
      ======================================================== */

      if (
        status ===
        "PROVIDER_UNAVAILABLE"
      ) {
        const refundBalanceBefore =
          business.duptBalance;

        business.duptBalance +=
          VERIFICATION_COST;

        const refundBalanceAfter =
          business.duptBalance;

        await business.save();

        await BillingLedger.create({
          businessId:
            business._id,

          userId:
            req.user._id,

          type: "VERIFICATION_REFUND",

          duptAmount:
            VERIFICATION_COST,

          balanceBefore:
            refundBalanceBefore,

          balanceAfter:
            refundBalanceAfter,

          status: "success",

          reason: `Refund — ${bankName} provider unavailable`,
        });

        console.warn(
          `[verify] ${bankName} outage — refunded ${VERIFICATION_COST} DU PT`
        );
      }

      /* ========================================================
         STEP 8: INTERNAL VERIFIED DATA
      ======================================================== */

      const finalAmount =
        providerDetails?.amount ??
        extracted?.amount ??
        normalizedExpectedAmount ??
        null;

      const finalSender =
        providerDetails?.payerName ||
        extracted?.senderName ||
        null;

      const finalReceiver =
        providerDetails?.receiverName ||
        extracted?.receiverName ||
        null;

      const finalReceiverAccount =
        providerDetails
          ?.receiverAccountNumber ||
        extracted?.receiverAccountNumber ||
        extracted?.receiverAccount ||
        extracted?.accountNumber ||
        null;

      const finalTransactionTime =
        providerDetails?.transactionTime ||
        null;

      /* ========================================================
         STEP 8.5: ADMIN PAYMENT ACCOUNT MATCH
      ========================================================

         NEW MULTI-ACCOUNT LOGIC
      ========================================================

         Example:

         Admin configured:

           Awash #1
           Account: 100001111111
           Holder: ABC Restaurant

           Awash #2
           Account: 100002222222
           Holder: ABC Restaurant

           Awash #3
           Account: 100003333333
           Holder: ABC Restaurant

         Customer pays:

           100002222222

         Result:

           Account #2 matches
           => VALID

         Customer pays:

           100009999999

         Result:

           No account matches
           => RECEIVER_MISMATCH

         The match can happen through:

           account number
                  OR
           account holder name

         against ANY configured account.
      */

      let accountNumberMatch =
        false;

      let accountHolderNameMatch =
        false;

      let matchedPaymentAccount =
        null;

      if (
        status === "VALID"
      ) {
        const match =
          matchAgainstPaymentAccounts(
            paymentAccounts,

            finalReceiverAccount,

            finalReceiver,

            bankName
          );

        accountNumberMatch =
          match.accountNumberMatch;

        accountHolderNameMatch =
          match.accountHolderNameMatch;

        matchedPaymentAccount =
          match.matchedAccount;

        if (!match.matched) {
          status =
            "RECEIVER_MISMATCH";

          // Privacy-safe logging: mask account numbers and
          // holder names — never log full sensitive values.
          const maskAccount = (value) => {
            const digits =
              normalizeAccountNumber(value);

            return digits
              ? `***${digits.slice(-4)}`
              : "(missing)";
          };

          const maskName = (value) => {
            const parts = normalizeName(value).split(" ");

            return parts.length && parts[0]
              ? `${parts[0][0].toUpperCase()}***`
              : "(missing)";
          };

          console.warn(
            "[verify] receiver mismatch:",
            JSON.stringify({
              provider: bankName,

              receivedAccount: maskAccount(
                finalReceiverAccount
              ),

              receivedHolder: maskName(
                finalReceiver
              ),

              configuredAccounts:
                paymentAccounts.map(
                  (account) => ({
                    provider: account.provider,

                    accountNumber: maskAccount(
                      account.accountNumber
                    ),

                    accountHolderName: maskName(
                      account.accountHolderName
                    ),
                  })
                ),
            })
          );
        } else {
          console.log(
            "[verify] receiver matched configured payment account:",
            {
              bankName,

              matchedAccountId:
                matchedPaymentAccount?._id,

              accountNumberMatch,

              accountHolderNameMatch,
            }
          );
        }
      }

      /* ========================================================
         STEP 9: SAVE VERIFICATION LOG
      ======================================================== */

      const log =
        await Verification.create({
          businessId:
            business._id,

          checkedBy:
            req.user._id,

          bankName,

          transactionRef:
            reference,

          amount:
            finalAmount,

          senderName:
            finalSender,

          receiverName:
            finalReceiver,

          transactionTime:
            finalTransactionTime,

          screenshotUrl:
            req.file
              ? "not-stored"
              : "manual-reference",

          status,

          verificationCost:
            status === "PROVIDER_UNAVAILABLE"
              ? 0
              : VERIFICATION_COST,
        });

      const responseMeta = {
        providerName: bankName,
        // CBE always gets a client-facing status message, no matter which
        // path produced the reference (QR, OCR fallback, or manual entry)
        // - previously only the QR path did, so OCR/manual CBE checks
        // silently showed nothing in the client message section.
        providerMessage:
          bankName === "CBE"
            ? getCbeQrMessage(status, Boolean(qrReference))
            : null,
        // The CBE "new" receipt flow (QR or its OCR-extracted link) always
        // resolves to a working mbreciept.cbe.com.et link once verified;
        // legacy FT receipts have no such link, so this is correctly null
        // for those.
        providerLink:
          bankName === "CBE"
            ? veritasResult.body?.receipt_url || null
            : null,
      };

      /* ========================================================
         STEP 10: RECEIVER MISMATCH RESPONSE
      ======================================================== */

      if (
        status ===
        "RECEIVER_MISMATCH"
      ) {
        return res.json({
          status:
            "RECEIVER_MISMATCH",

          verified:
            false,

          duptBalance:
            business.duptBalance,

          ...responseMeta,

          /*
           * Do not expose:
           *
           * - sender
           * - receiver
           * - receiver account
           * - configured accounts
           */
          userMessage:
            "Payment was verified by the provider, but it does not match any payment account configured by the administrator.",

          mismatch: {
            accountNumber:
              !accountNumberMatch,

            accountHolderName:
              !accountHolderNameMatch,
          },

          log,
        });
      }

      /* ========================================================
         STEP 10.5: PROVIDER REACHED, PAYMENT UNCONFIRMED
      ======================================================== */

      if (
        status ===
        "NOT_VERIFIED"
      ) {
        return res.json({
          status:
            "NOT_VERIFIED",

          verified:
            false,

          duptBalance:
            business.duptBalance,

          ...responseMeta,

          userMessage:
            "Payment unconfirmed. The payment provider was reached but did not confirm this transaction.",

          log,
        });
      }

      /* ========================================================
         STEP 10.6: PROVIDER UNAVAILABLE (NEUTRAL RESULT)
      ========================================================

         We could not reliably communicate with the provider.

         This does NOT mean the payment is fake or invalid.
         The DU PT has already been refunded above.
      ======================================================== */

      if (
        status ===
        "PROVIDER_UNAVAILABLE"
      ) {
        return res.json({
          status:
            "PROVIDER_UNAVAILABLE",

          verified:
            false,

          retryable:
            true,

          duptBalance:
            business.duptBalance,

          ...responseMeta,

          userMessage:
            "We couldn't reliably reach the payment provider. This does not mean the payment is invalid. Please try again.",

          log,
        });
      }

      /* ========================================================
         STEP 11: PROVIDER ERROR (legacy)
      ======================================================== */

      if (
        status ===
        "PROVIDER_ERROR"
      ) {
        return res.json({
          status:
            "PROVIDER_ERROR",

          verified:
            false,

          retryable:
            true,

          duptBalance:
            business.duptBalance,

          ...responseMeta,

          userMessage:
            "We couldn't complete the provider check. Please try again.",

          log,
        });
      }

      /* ========================================================
         STEP 12: AMOUNT MISMATCH
      ======================================================== */

      if (
        status ===
        "AMOUNT_MISMATCH"
      ) {
        return res.json({
          status:
            "AMOUNT_MISMATCH",

          verified:
            false,

          duptBalance:
            business.duptBalance,

          ...responseMeta,

          amount:
            finalAmount,

          userMessage:
            "The confirmed payment amount is lower than the expected amount.",

          log,
        });
      }

      /* ========================================================
         STEP 13: SUCCESS
      ======================================================== */

      if (
        status ===
        "VALID"
      ) {
        return res.json({
          status:
            "VALID",

          verified:
            true,

          duptBalance:
            business.duptBalance,

          ...responseMeta,

          amount:
            finalAmount,

          verificationHour:
            formatVerificationHour(
              finalTransactionTime
            ),

          userMessage:
            "Payment verified successfully.",

          log,
        });
      }

      /* ========================================================
         FALLBACK
      ======================================================== */

      return res.json({
        status,

        verified:
          false,

        duptBalance:
          business.duptBalance,

        ...responseMeta,

        userMessage:
          "Transaction could not be verified.",

        log,
      });
    } catch (err) {
      console.error(
        "[verify] request failed:",
        err.message
      );

      if (err.stack) {
        console.error(
          err.stack
        );
      }

      return res.status(500).json({
        error:
          "Verification failed",

        detail:
          err.message,
      });
    }
  }
);

/* ============================================================
   GET /api/verify/history
============================================================ */

router.get(
  "/history",
  async (req, res) => {
    try {
      const businessId =
        req.businessId ||
        (
          req.user.role === "owner"
            ? req.user._id
            : req.user.role === "admin"
              ? req.query.businessId
              : req.user.businessId
        );

      if (!businessId) {
        return res.status(400).json({
          error:
            "No business context for this account",
        });
      }

      const {
        status,
        from,
        to,
        page = 1,
        limit = 20,
      } = req.query;

      const filter = {
        businessId,
      };

      if (status) {
        filter.status =
          status;
      }

      if (from || to) {
        filter.checkedAt = {};

        if (from) {
          filter.checkedAt.$gte =
            new Date(from);
        }

        if (to) {
          filter.checkedAt.$lte =
            new Date(to);
        }
      }

      const pageNumber =
        Math.max(
          1,
          Number(page) || 1
        );

      const limitNumber =
        Math.min(
          100,
          Math.max(
            1,
            Number(limit) || 20
          )
        );

      const skip =
        (pageNumber - 1) *
        limitNumber;

      const [
        items,
        total,
      ] =
        await Promise.all([
          Verification.find(filter)
            .sort({
              checkedAt: -1,
            })
            .skip(skip)
            .limit(limitNumber)
            .populate(
              "checkedBy",
              "ownerName"
            ),

          Verification.countDocuments(
            filter
          ),
        ]);

      return res.json({
        items,

        total,

        page:
          pageNumber,

        limit:
          limitNumber,
      });
    } catch (err) {
      console.error(
        "[verify/history] request failed:",
        err.message
      );

      return res.status(500).json({
        error:
          "Failed to load verification history",

        detail:
          err.message,
      });
    }
  }
);

/* ============================================================
   USER MESSAGES
============================================================ */

function getManualReferenceMessage(
  status
) {
  switch (status) {
    case "VALID":
      return "This transaction reference matches a confirmed transaction.";

    case "AMOUNT_MISMATCH":
      return "The confirmed payment amount is lower than the expected amount.";

    case "RECEIVER_MISMATCH":
      return "This transaction is real, but it does not match any business payment account configured by the administrator.";

    case "PROVIDER_UNAVAILABLE":
      return "We couldn't reliably reach the payment provider. This does not mean the payment is invalid. Please try again.";

    case "NOT_VERIFIED":
      return "Payment unconfirmed. The payment provider was reached but did not confirm this transaction.";

    case "PROVIDER_ERROR":
      return "We couldn't complete the provider check. Please try again.";

    case "INVALID_FORMAT":
      return "This reference could not be verified for the selected bank. Please try again.";

    default:
      return "Transaction verification completed.";
  }
}

// Client-facing CBE status message. CBE references can reach this point
// three ways - a decoded QR code, an OCR-extracted receipt link/reference,
// or a manually typed one - and every one of them should still produce a
// useful message + provider name for the client message section (not just
// the QR path). `viaQr` only changes the wording, never whether a message
// is returned.
function getCbeQrMessage(
  status,
  viaQr = false
) {
  const subject = viaQr
    ? "This CBE receipt QR code"
    : "This CBE receipt";

  switch (status) {
    case "VALID":
      return `${subject} matches a confirmed transaction.`;

    case "AMOUNT_MISMATCH":
      return "The confirmed CBE payment amount is lower than the expected amount.";

    case "RECEIVER_MISMATCH":
      return "This CBE transaction is real, but it does not match any business payment account configured by the administrator.";

    case "PROVIDER_UNAVAILABLE":
      return "We couldn't reliably reach CBE. This does not mean the payment is invalid. Please try again.";

    case "NOT_VERIFIED":
      return "Payment unconfirmed. CBE was reached but did not confirm this transaction.";

    case "PROVIDER_ERROR":
      return viaQr
        ? "We couldn't complete the CBE QR receipt check. Please try again."
        : "We couldn't complete the CBE receipt check. Please try again.";

    case "INVALID_FORMAT":
      return viaQr
        ? "This QR code could not be read as a CBE payment receipt. Please try again."
        : "This could not be read as a CBE payment receipt. Please try again.";

    default:
      return "CBE receipt verification completed.";
  }
}

module.exports = router;
