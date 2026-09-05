// services/veritas.js
//
// Dispatches receipt verification to the correct
// bank/telecom-specific provider.
//
// Each provider talks directly to the bank/telecom's
// own public verification endpoint.
//
// Every provider returns:
//
// {
//   httpOk: Boolean,
//   status: Number,
//   body: {
//     success: Boolean,
//     ...
//   }
// }
//
// ============================================================
// CBE FLOW
// ============================================================
//
// New CBE receipt:
//
//   CBE receipt image
//          ↓
//      QR decoder
//          ↓
//   mbreciept.cbe.com.et/<token>
//          ↓
//      verifyCBE()
//          ↓
//   CBE public transaction endpoint
//
// CBE QR verification does NOT use OCR.
//
// ============================================================
// OTHER PROVIDERS
// ============================================================
//
// Other providers can continue using OCR-extracted
// transaction references.
//
// Manual transaction references are also supported.
//

const { classifyHttpStatus, unavailable } = require("./providerStatus");

const { verifyAwash } = require("./providers/awash");
const { verifyTelebirr } = require("./providers/telebirr");
const { verifyCBE } = require("./providers/cbe");
const { verifyDashen } = require("./providers/dashen");
const { verifyAbyssinia } = require("./providers/abyssinia");
const { verifyCBEBirr } = require("./providers/cbebirr");
const { verifyMpesa } = require("./providers/mpesa");


// ============================================================
// UNSUPPORTED PROVIDER
// ============================================================

function unsupported(bankName) {
  return {
    httpOk: false,

    status: 501,

    body: {
      success: false,

      error:
        `${bankName} isn't supported for automatic verification yet — ` +
        `no public receipt endpoint is available for it. ` +
        `Please verify this one manually.`,
    },
  };
}


// ============================================================
// MAIN PROVIDER DISPATCHER
// ============================================================
//
// @param {Object} options
//
// @param {string} options.bankName
//   Selected bank/provider.
//
// @param {string} options.reference
//   Main transaction reference.
//
//   Normally:
//   - OCR-extracted reference
//   - manually entered reference
//   - manually entered CBE receipt URL/token
//
// @param {string} options.suffix
//   Legacy merchant account suffix.
//
// @param {string} options.accountSuffix
//   Merchant's own receiving-account suffix.
//
//   Used by:
//   - CBE legacy receipts
//   - Abyssinia
//
// @param {string} options.phoneNumber
//   Used by CBE Birr.
//
// @param {string} options.receiptNumber
//   Optional CBE Birr receipt number.
//
// @param {string} options.qrReference
//   Complete QR payload from a receipt.
//
//   Example:
//
//   https://mbreciept.cbe.com.et/v2-hfHCxFUIIEVQe6hqmWv4
//
//   For CBE this is preferred over OCR.
//

async function dispatchReceipt({
  bankName,
  reference,
  suffix,
  accountSuffix,
  phoneNumber,
  receiptNumber,
  qrReference,
}) {

  switch (bankName) {

    // ========================================================
    // CBE
    // ========================================================
    //
    // CBE has two verification systems:
    //
    // 1. NEW receipt system
    //
    //    QR/full URL:
    //
    //    https://mbreciept.cbe.com.et/v2-...
    //
    //    verifyCBE() extracts the token and calls
    //    CBE's public transaction endpoint.
    //
    // 2. LEGACY receipt system
    //
    //    FTXXXXXXXXXX
    //
    //    verifyCBE() recognizes the FT reference and
    //    uses the merchant account suffix.
    //
    // QR takes priority over the normal reference.
    //
    // IMPORTANT:
    //
    // This dispatcher does NOT perform OCR.
    //
    // The route decides whether the reference came from:
    //
    // - QR
    // - manual input
    // - OCR fallback
    //
    // and passes it here.
    //
    case "CBE": {

      const cbeReference =
        typeof qrReference === "string" &&
        qrReference.trim()
          ? qrReference.trim()
          : typeof reference === "string"
          ? reference.trim()
          : "";


      if (!cbeReference) {
        return {
          httpOk: false,

          status: 400,

          body: {
            success: false,

            error:
              "No CBE receipt reference or QR URL was provided.",
          },
        };
      }


      console.log(
        "[veritas] CBE verification:",
        cbeReference
      );


      /*
       * verifyCBE() handles:
       *
       * NEW:
       *   https://mbreciept.cbe.com.et/v2-...
       *
       * NEW:
       *   mbreciept.cbe.com.et/v2-...
       *
       * NEW:
       *   v2-...
       *
       * LEGACY:
       *   FTXXXXXXXXXX
       *
       * accountSuffix is only needed for
       * the legacy FT verification.
       */

      return verifyCBE(
        cbeReference,
        accountSuffix || suffix
      );
    }


    // ========================================================
    // TELEBIRR
    // ========================================================

    case "Telebirr": {

      if (
        !reference ||
        !String(reference).trim()
      ) {
        return {
          httpOk: false,

          status: 400,

          body: {
            success: false,

            error:
              "A Telebirr transaction reference is required.",
          },
        };
      }


      return verifyTelebirr(
        String(reference).trim()
      );
    }


    // ========================================================
    // DASHEN
    // ========================================================

    case "Dashen": {

      if (
        !reference ||
        !String(reference).trim()
      ) {
        return {
          httpOk: false,

          status: 400,

          body: {
            success: false,

            error:
              "A Dashen transaction reference is required.",
          },
        };
      }


      return verifyDashen(
        String(reference).trim()
      );
    }


    // ========================================================
    // ABYSSINIA
    // ========================================================

    case "Abyssinia": {

      if (
        !reference ||
        !String(reference).trim()
      ) {
        return {
          httpOk: false,

          status: 400,

          body: {
            success: false,

            error:
              "An Abyssinia transaction reference is required.",
          },
        };
      }


      return verifyAbyssinia(
        String(reference).trim(),
        accountSuffix || suffix
      );
    }


    // ========================================================
    // CBE BIRR
    // ========================================================

    case "CBEBirr": {

      const cbeBirrReference =
        receiptNumber ||
        reference;


      if (
        !cbeBirrReference ||
        !String(cbeBirrReference).trim()
      ) {
        return {
          httpOk: false,

          status: 400,

          body: {
            success: false,

            error:
              "A CBE Birr receipt number is required.",
          },
        };
      }


      return verifyCBEBirr(
        String(cbeBirrReference).trim(),
        phoneNumber
      );
    }


    // ========================================================
    // MPESA
    // ========================================================

    case "MPesa": {

      if (
        !reference ||
        !String(reference).trim()
      ) {
        return {
          httpOk: false,

          status: 400,

          body: {
            success: false,

            error:
              "An M-Pesa transaction reference is required.",
          },
        };
      }


      return verifyMpesa(
        String(reference).trim()
      );
    }


    // ========================================================
    // AWASH
    // ========================================================

    case "Awash": {

      if (
        !reference ||
        !String(reference).trim()
      ) {
        return {
          httpOk: false,

          status: 400,

          body: {
            success: false,

            error:
              "An Awash transaction reference is required.",
          },
        };
      }


      return verifyAwash(
        String(reference).trim()
      );
    }


    // ========================================================
    // COOPBANK
    // ========================================================
    //
    // No public receipt lookup endpoint is currently
    // used for automatic verification.
    //

    case "Coopbank":
      return unsupported(bankName);


    // ========================================================
    // UNKNOWN PROVIDER
    // ========================================================

    default:
      return unsupported(
        bankName
      );
  }
}


// ============================================================
// CLASSIFICATION WRAPPER
// ============================================================
//
// Every provider result carries a `classification` object:
//
//   { status, reason, provider, retryable }
//
// where status is one of:
//
//   VALID | NOT_VERIFIED | PROVIDER_UNAVAILABLE
//
// Providers that implement their own provider-specific
// classifiers (e.g. Dashen) supply it themselves.
//
// For the remaining providers we derive a SAFE generic
// classification from the HTTP status:
//
//   - network/infrastructure statuses => PROVIDER_UNAVAILABLE
//   - definitive business rejection   => NOT_VERIFIED
//   - unknown/unclassifiable          => PROVIDER_UNAVAILABLE
//
// We NEVER let an infrastructure failure become NOT_VERIFIED.
// ============================================================

function attachClassification(result, bankName) {
  if (!result) {
    return {
      httpOk: false,

      status: 502,

      classification: unavailable(
        bankName,
        "NO_PROVIDER_RESULT"
      ),

      body: {
        success: false,

        error:
          "The payment provider could not be reached.",
      },
    };
  }

  if (result.classification) {
    return result;
  }

  // Successful provider confirmation.
  if (result.httpOk && result.body?.success !== false) {
    result.classification = {
      status: "VALID",

      provider: bankName,

      retryable: false,
    };

    return result;
  }

  const httpStatus = Number(result.status) || 0;

  result.classification =
    httpStatus >= 400
      ? classifyHttpStatus(httpStatus, bankName)
      : unavailable(bankName, "UNCLASSIFIED_FAILURE");

  console.log(
    `[veritas] ${bankName} classification: ${result.classification.status} (${result.classification.reason})`
  );

  return result;
}

async function verifyReceipt(options) {
  try {
    const result = await dispatchReceipt(options);

    return attachClassification(result, options.bankName);
  } catch (err) {
    // A thrown provider exception is infrastructure failure.
    console.error(
      `[veritas] ${options.bankName} threw:`,
      err?.message
    );

    return {
      httpOk: false,

      status: 502,

      classification: unavailable(
        options.bankName,
        "PROVIDER_EXCEPTION"
      ),

      body: {
        success: false,

        error:
          "The payment provider could not be reached.",
      },
    };
  }
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  verifyReceipt,
};