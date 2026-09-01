const express = require("express");
const PaymentAccount = require("../models/PaymentAccount");
const { requireAuth } = require("../middleware/auth");
const { requireOwner } = require("../middleware/roleCheck");

const router = express.Router();

router.use(requireAuth);

/* ============================================================
   BUSINESS CONTEXT
============================================================ */

// Resolves the business id a request is scoped to,
// regardless of whether the caller is the owner themselves
// or one of their staff.
function businessIdFor(req) {
  return req.user.role === "owner"
    ? req.user._id
    : req.user.businessId;
}

/* ============================================================
   ACCOUNT SUFFIX
============================================================ */

// Generates the account suffix automatically.
//
// CBE       -> last 8 digits
// Abyssinia -> last 5 digits
// Other     -> empty string
//
// The frontend never sends accountSuffix.
function generateAccountSuffix(provider, accountNumber) {
  const digits = String(accountNumber || "").replace(
    /\D/g,
    ""
  );

  const normalizedProvider = String(provider || "")
    .trim()
    .toLowerCase();

  if (normalizedProvider === "cbe") {
    return digits.slice(-8);
  }

  if (normalizedProvider === "abyssinia") {
    return digits.slice(-5);
  }

  return "";
}

/* ============================================================
   ACCOUNT NUMBER NORMALIZATION
============================================================ */

// Makes account numbers comparable even when OCR or users
// add spaces, dashes, etc.
//
// Example:
//
// 1000 1234 5678
// 1000-1234-5678
// 100012345678
//
// All become:
//
// 100012345678
function normalizeAccountNumber(accountNumber) {
  return String(accountNumber || "")
    .replace(/\D/g, "");
}

/* ============================================================
   NAME NORMALIZATION
============================================================ */

// Makes names easier to compare.
//
// Handles:
//
// JOHN DOE
// john doe
// John   Doe
// John-Doe
// John, Doe
//
// All normalize consistently.
//
// Unicode letters are preserved so names aren't limited
// to English characters.
function normalizeName(name) {
  return String(name || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ============================================================
   NAME MATCHING
============================================================ */

// Name matching rules:
//
// 1. Exact normalized match -> true
//
// 2. Otherwise compare FIRST + LAST names.
//
// This means:
//
// "John Doe"
// vs
// "JOHN DOE"
// -> true
//
// "John Michael Doe"
// vs
// "John Doe"
// -> true
//
// "John Doe"
// vs
// "John Michael Doe"
// -> true
//
// "John   Michael   Doe"
// vs
// "john doe"
// -> true
//
// Middle names can be present or absent.
//
// But:
//
// "John Doe"
// vs
// "John Smith"
// -> false
//
// "John Doe"
// vs
// "Michael Doe"
// -> false
function nameMatches(expectedName, receivedName) {
  const expected = normalizeName(expectedName);
  const received = normalizeName(receivedName);

  if (!expected || !received) {
    return false;
  }

  // Exact normalized match.
  if (expected === received) {
    return true;
  }

  const expectedParts = expected.split(" ");
  const receivedParts = received.split(" ");

  // We need at least first + last.
  if (
    expectedParts.length < 2 ||
    receivedParts.length < 2
  ) {
    return false;
  }

  const expectedFirst = expectedParts[0];
  const expectedLast =
    expectedParts[expectedParts.length - 1];

  const receivedFirst = receivedParts[0];
  const receivedLast =
    receivedParts[receivedParts.length - 1];

  return (
    expectedFirst === receivedFirst &&
    expectedLast === receivedLast
  );
}

/* ============================================================
   RECEIVER MATCHING
============================================================ */

// A payment is considered matched when EITHER:
//
// - account number matches
// OR
// - account holder name matches
//
// Both are NOT required.
//
// This is intentionally OR, as requested.
function paymentReceiverMatches({
  accountNumber,
  accountHolderName,
  receivedAccountNumber,
  receivedReceiverName,
}) {
  const normalizedExpectedAccount =
    normalizeAccountNumber(accountNumber);

  const normalizedReceivedAccount =
    normalizeAccountNumber(receivedAccountNumber);

  const accountMatch =
    Boolean(normalizedExpectedAccount) &&
    Boolean(normalizedReceivedAccount) &&
    normalizedExpectedAccount ===
    normalizedReceivedAccount;

  const nameMatch = nameMatches(
    accountHolderName,
    receivedReceiverName
  );

  return {
    matched: accountMatch || nameMatch,
    accountMatch,
    nameMatch,
  };
}

/* ============================================================
   GET /api/payment-accounts
============================================================ */

// Owner:
//   sees every account, enabled and disabled.
//
// Staff:
//   sees only enabled accounts.
//
// Disabled accounts are never returned to staff.
router.get("/", async (req, res) => {
  try {
    const businessId = businessIdFor(req);

    if (!businessId) {
      return res.status(400).json({
        error:
          "No business context for this account",
      });
    }

    if (req.user.role === "owner") {
      const accounts =
        await PaymentAccount.find({
          businessId,
        }).sort({
          provider: 1,
        });

      return res.json({
        accounts,
      });
    }

    const accounts =
      await PaymentAccount.find({
        businessId,
        enabled: true,
      })
        .select(
          "provider accountNumber accountHolderName accountSuffix"
        )
        .sort({
          provider: 1,
        });

    return res.json({
      accounts,
    });
  } catch (err) {
    console.error(
      "GET /payment-accounts error:",
      err
    );

    return res.status(500).json({
      error:
        "Could not fetch payment accounts",
      detail: err.message,
    });
  }
});

/* ============================================================
   POST /api/payment-accounts
============================================================ */

// Owner only.
//
// Frontend sends:
//
// {
//   provider,
//   accountNumber,
//   accountHolderName
// }
//
// accountSuffix is generated automatically.
//
// CBE:
//   last 8 digits
//
// Abyssinia:
//   last 5 digits
router.post("/", requireOwner, async (req, res) => {
  try {
    const {
      provider,
      accountNumber,
      accountHolderName,
    } = req.body;

    if (
      !provider ||
      !accountNumber ||
      !accountHolderName
    ) {
      return res.status(400).json({
        error:
          "provider, accountNumber, and accountHolderName are required",
      });
    }

    const cleanProvider = String(provider).trim();
    const cleanAccountNumber =
      String(accountNumber).trim();
    const cleanAccountHolderName =
      String(accountHolderName)
        .replace(/\s+/g, " ")
        .trim();

    if (!cleanAccountNumber) {
      return res.status(400).json({
        error: "Account number is required",
      });
    }

    if (!cleanAccountHolderName) {
      return res.status(400).json({
        error:
          "Account holder name is required",
      });
    }

    const accountSuffix =
      generateAccountSuffix(
        cleanProvider,
        cleanAccountNumber
      );

    const account =
      await PaymentAccount.create({
        businessId: req.user._id,
        provider: cleanProvider,
        accountNumber: cleanAccountNumber,
        accountHolderName:
          cleanAccountHolderName,
        accountSuffix,
      });

    return res.status(201).json({
      account,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: `An account for ${req.body.provider} already exists. Edit it instead of creating a new one.`,
      });
    }

    console.error(
      "POST /payment-accounts error:",
      err
    );

    return res.status(500).json({
      error:
        "Could not create payment account",
      detail: err.message,
    });
  }
});

/* ============================================================
   PATCH /api/payment-accounts/:id
============================================================ */

// Owner only.
//
// Can update:
//
// - accountNumber
// - accountHolderName
// - enabled
//
// accountSuffix is NEVER accepted from the frontend.
//
// If accountNumber changes, suffix is regenerated automatically.
router.patch(
  "/:id",
  requireOwner,
  async (req, res) => {
    try {
      const account =
        await PaymentAccount.findOne({
          _id: req.params.id,
          businessId: req.user._id,
        });

      if (!account) {
        return res.status(404).json({
          error:
            "Payment account not found",
        });
      }

      const {
        accountNumber,
        accountHolderName,
        enabled,
      } = req.body;

      /* -------------------------------
         ACCOUNT NUMBER
      -------------------------------- */

      if (accountNumber !== undefined) {
        const cleanAccountNumber =
          String(accountNumber).trim();

        if (!cleanAccountNumber) {
          return res.status(400).json({
            error:
              "Account number cannot be empty",
          });
        }

        account.accountNumber =
          cleanAccountNumber;

        // Recalculate automatically.
        account.accountSuffix =
          generateAccountSuffix(
            account.provider,
            cleanAccountNumber
          );
      }

      /* -------------------------------
         ACCOUNT HOLDER NAME
      -------------------------------- */

      if (
        accountHolderName !== undefined
      ) {
        const cleanName = String(
          accountHolderName
        )
          .replace(/\s+/g, " ")
          .trim();

        if (!cleanName) {
          return res.status(400).json({
            error:
              "Account holder name cannot be empty",
          });
        }

        account.accountHolderName =
          cleanName;
      }

      /* -------------------------------
         ENABLE / DISABLE
      -------------------------------- */

      if (enabled !== undefined) {
        account.enabled =
          Boolean(enabled);
      }

      account.updatedAt = new Date();

      await account.save();

      return res.json({
        account,
      });
    } catch (err) {
      console.error(
        "PATCH /payment-accounts/:id error:",
        err
      );

      return res.status(500).json({
        error:
          "Could not update payment account",
        detail: err.message,
      });
    }
  }
);

/* ============================================================
   DELETE /api/payment-accounts/:id
============================================================ */

// Owner only.
router.delete(
  "/:id",
  requireOwner,
  async (req, res) => {
    try {
      const account =
        await PaymentAccount.findOneAndDelete({
          _id: req.params.id,
          businessId: req.user._id,
        });

      if (!account) {
        return res.status(404).json({
          error:
            "Payment account not found",
        });
      }

      return res.json({
        deleted: true,
      });
    } catch (err) {
      console.error(
        "DELETE /payment-accounts/:id error:",
        err
      );

      return res.status(500).json({
        error:
          "Could not delete payment account",
        detail: err.message,
      });
    }
  }
);

/* ============================================================
   EXPORT
============================================================ */

module.exports = router;

/*
  IMPORTANT:

  The paymentReceiverMatches() function above is also intended
  for your payment verification flow.

  Example:

  const result = paymentReceiverMatches({
    accountNumber: paymentAccount.accountNumber,
    accountHolderName: paymentAccount.accountHolderName,

    receivedAccountNumber:
      ocrResult.accountNumber,

    receivedReceiverName:
      ocrResult.receiverName,
  });

  if (!result.matched) {
    return res.status(400).json({
      error:
        "Payment receiver could not be verified. Neither the account number nor the account holder name matched.",
    });
  }

  You can also see WHICH field matched:

  result.accountMatch
  result.nameMatch

  Examples:

  {
    matched: true,
    accountMatch: true,
    nameMatch: false
  }

  -> Account number matched. ACCEPT.

  {
    matched: true,
    accountMatch: false,
    nameMatch: true
  }

  -> Name matched. ACCEPT.

  {
    matched: true,
    accountMatch: true,
    nameMatch: true
  }

  -> Both matched. ACCEPT.

  {
    matched: false,
    accountMatch: false,
    nameMatch: false
  }

  -> Neither matched. REJECT.
*/