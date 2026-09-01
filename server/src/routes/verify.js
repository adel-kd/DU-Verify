const express = require("express");
const multer = require("multer");
const User = require("../models/User");
const Verification = require("../models/Verification");
const BillingLedger = require("../models/BillingLedger");
const PaymentAccount = require("../models/PaymentAccount");
const PlatformSettings = require("../models/PlatformSettings");
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
function accountNumbersMatch(
  expectedAccount,
  receivedAccount
) {
  const expected =
    normalizeAccountNumber(
      expectedAccount
    );

  const received =
    normalizeAccountNumber(
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
function matchAgainstPaymentAccounts(
  paymentAccounts,
  receivedAccount,
  receivedHolder
) {
  let accountNumberMatch = false;
  let accountHolderNameMatch = false;

  let matchedAccount = null;

  for (
    const paymentAccount of paymentAccounts
  ) {
    const accountMatches =
      accountNumbersMatch(
        paymentAccount.accountNumber,
        receivedAccount
      );

    const holderMatches =
      namesMatch(
        paymentAccount.accountHolderName,
        receivedHolder
      );

    if (accountMatches) {
      accountNumberMatch = true;
    }

    if (holderMatches) {
      accountHolderNameMatch = true;
    }

    /*
     * EITHER account number OR holder name
     * is enough.
     */
    if (
      accountMatches ||
      holderMatches
    ) {
      matchedAccount =
        paymentAccount;

      break;
    }
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
      ======================================================== */

      const business =
        req.user.role === "owner"
          ? req.user
          : await User.findById(
            req.user.businessId
          );

      if (!business) {
        return res.status(404).json({
          error:
            "Business account not found",
        });
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
            "NOT_VERIFIED",

          verified:
            false,

          userMessage:
            "Unable to verify this payment. The business payment account is not fully configured. Please contact the administrator.",
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

      if (
        !paymentAccounts ||
        paymentAccounts.length === 0
      ) {
        return res.status(200).json({
          status:
            "NOT_VERIFIED",

          verified:
            false,

          userMessage:
            "Unable to verify this payment. The business payment account is not fully configured. Please contact the administrator.",
        });
      }

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
          const log =
            await Verification.create({
              businessId:
                business._id,

              checkedBy:
                req.user._id,

              bankName,

              transactionRef:
                "QR_NOT_FOUND",

              amount:
                normalizedExpectedAmount ??
                0,

              screenshotUrl:
                "not-stored",

              status:
                "OCR_FAILED",

              verificationCost:
                0,
            });

          return res.status(200).json({
            status:
              "OCR_FAILED",

            verified:
              false,

            failureReason:
              "NO_REFERENCE",

            userMessage:
              "Could not find the CBE receipt QR code. Please retake the receipt image or enter the CBE receipt link manually.",

            log,
          });
        }

        if (!req.file) {
          return res.status(400).json({
            error:
              "Receipt image or transaction reference is required",
          });
        }

        try {
          extracted =
            await extractReceiptData(
              req.file.buffer,
              req.file.mimetype
            );
        } catch (ocrErr) {
          console.error(
            "[ocr] extraction failed:",
            ocrErr.message,
            ocrErr.cause || ""
          );

          const userMessage =
            ocrErr.message.startsWith(
              "Receipt scanning"
            ) ||
              ocrErr.message.startsWith(
                "Could not analyze"
              )
              ? ocrErr.message
              : "Could not read this receipt. Try a clearer photo of the full confirmation screen.";

          const log =
            await Verification.create({
              businessId:
                business._id,

              checkedBy:
                req.user._id,

              bankName,

              transactionRef:
                "UNKNOWN",

              amount:
                normalizedExpectedAmount ??
                0,

              screenshotUrl:
                "not-stored",

              status:
                "OCR_FAILED",

              verificationCost:
                0,
            });

          return res.status(200).json({
            status:
              "OCR_FAILED",

            verified:
              false,

            failureReason:
              "API_ERROR",

            userMessage,

            log,
          });
        }

        if (
          !extracted ||
          !extracted.extractionOk ||
          !extracted.transactionRef
        ) {
          const log =
            await Verification.create({
              businessId:
                business._id,

              checkedBy:
                req.user._id,

              bankName,

              transactionRef:
                "UNKNOWN",

              amount:
                normalizedExpectedAmount ??
                0,

              screenshotUrl:
                "not-stored",

              status:
                "OCR_FAILED",

              verificationCost:
                0,
            });

          return res.status(200).json({
            status:
              "OCR_FAILED",

            verified:
              false,

            failureReason:
              extracted?.failureReason ||
              "NO_REFERENCE",

            userMessage:
              extracted?.userMessage ||
              "Could not find a transaction reference in this image.",

            imageQuality:
              extracted?.imageQuality,

            confidence:
              extracted?.confidence,

            log,
          });
        }

        reference =
          extracted.transactionRef.trim();

        console.log(
          "[verify] OCR reference:",
          reference
        );
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
         STEP 7: PROVIDER RESULT
      ======================================================== */

      let status =
        "INVALID_FORMAT";

      if (providerVerified) {
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
        status =
          "PROVIDER_ERROR";
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

            finalReceiver
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

          console.warn(
            "[verify] receiver mismatch:",
            {
              bankName,

              receivedAccount:
                finalReceiverAccount,

              receivedHolder:
                finalReceiver,

              configuredAccounts:
                paymentAccounts.map(
                  (account) => ({
                    accountNumber:
                      account.accountNumber,

                    accountHolderName:
                      account.accountHolderName,
                  })
                ),
            }
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
            VERIFICATION_COST,
        });

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
         STEP 11: PROVIDER ERROR
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

          duptBalance:
            business.duptBalance,

          userMessage:
            "The payment provider could not confirm this transaction.",

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

    case "PROVIDER_ERROR":
      return "The provider couldn't confirm this transaction.";

    case "INVALID_FORMAT":
      return "This reference could not be verified for the selected bank.";

    default:
      return "Transaction verification completed.";
  }
}

function getCbeQrMessage(
  status
) {
  switch (status) {
    case "VALID":
      return "This CBE receipt QR code matches a confirmed transaction.";

    case "AMOUNT_MISMATCH":
      return "The confirmed CBE payment amount is lower than the expected amount.";

    case "RECEIVER_MISMATCH":
      return "This CBE transaction is real, but it does not match any business payment account configured by the administrator.";

    case "PROVIDER_ERROR":
      return "CBE couldn't confirm this QR receipt.";

    case "INVALID_FORMAT":
      return "This QR code could not be verified as a CBE payment receipt.";

    default:
      return "CBE receipt verification completed.";
  }
}

module.exports = router;