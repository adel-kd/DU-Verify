// services/providers/abyssinia.js
//
// Bank of Abyssinia transaction verifier
//
// Accepted inputs:
//
// 1. Short transaction reference:
//    FT26227Z491M
//
// 2. Full lookup ID:
//    FT26227Z491M02196
//
// 3. Full receipt URL:
//    https://cs.bankofabyssinia.com/slip/?trx=FT26227Z491M02196
//
// BOA lookup:
//
//   short reference + 5-digit OWNER account suffix
//
//   FT26227Z491M + 02196
//   = FT26227Z491M02196
//
// IMPORTANT:
//
// The receipt itself displays:
//
//   Transaction Reference: FT26227Z491M
//
// The 02196 suffix is used for the BOA lookup,
// but is NOT part of the displayed transaction reference.
//
// OWNER ACCOUNT:
//
// The configured accountSuffix belongs to the receiving
// merchant/owner account.
//
// It is ALWAYS authoritative.
//
// We NEVER allow a submitted lookup ID to replace the
// configured owner suffix.
//
// If a full lookup ID is supplied, its suffix must match
// the configured owner suffix. Otherwise the transaction
// is rejected.
//
// RECEIVER:
//
// BOA receipts may not contain a receiver/beneficiary name.
//
// If BOA provides a receiver name:
//
//   To: ABEBE KEBEDE
//
// If BOA does NOT provide a receiver name:
//
//   To: You
//
// "You" is a display fallback only. The transaction's
// association with the owner is established by successfully
// looking it up using the configured owner account suffix.
//
// TIME:
//
// BOA receipt times are treated as Ethiopia local time:
//
//   Africa/Addis_Ababa
//   UTC+03:00
//
// Example:
//
//   BOA:
//   15/08/26 09:46
//
//   Returned:
//
//   2026-08-15T09:46:00+03:00
//
// This prevents JavaScript/frontend code from accidentally
// treating the BOA receipt time as UTC.
//

const fetch = require("node-fetch");

const BOA_BASE =
  "https://cs.bankofabyssinia.com";

const BOA_TIMEZONE =
  "Africa/Addis_Ababa";

const BOA_TIMEZONE_OFFSET =
  "+03:00";


// ============================================================
// TEXT HELPERS
// ============================================================

function cleanText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim() || null;
}


// ============================================================
// INPUT NORMALIZATION
// ============================================================
//
// The configured owner suffix is ALWAYS authoritative.
//
// Short reference:
//
//   FT26227Z491M
//
// becomes:
//
//   FT26227Z491M02196
//
// Full lookup ID:
//
//   FT26227Z491M02196
//
// is accepted only if:
//
//   02196 === configured owner suffix
//
// A submitted suffix can NEVER override the configured
// receiving account.
//

function normalizeInput(
  input,
  configuredSuffix
) {

  if (!input) {
    return {
      error:
        "No Bank of Abyssinia transaction reference supplied.",
    };
  }

  // ----------------------------------------------------------
  // OWNER ACCOUNT SUFFIX IS REQUIRED
  // ----------------------------------------------------------

  if (
    configuredSuffix === null ||
    configuredSuffix === undefined ||
    String(configuredSuffix).trim() === ""
  ) {
    return {
      error:
        "Abyssinia verification requires the owner's 5-digit account suffix.",
    };
  }

  const ownerSuffix =
    String(
      configuredSuffix
    ).trim();

  if (
    !/^\d{5}$/.test(
      ownerSuffix
    )
  ) {
    return {
      error:
        "Abyssinia owner account suffix must be exactly 5 digits.",
    };
  }

  let value =
    String(input).trim();

  console.log("");

  console.log(
    "========================================"
  );

  console.log(
    "[BOA] INPUT NORMALIZATION"
  );

  console.log(
    "========================================"
  );

  console.log(
    "[BOA] Raw input:",
    value
  );

  console.log(
    "[BOA] Owner account suffix:",
    ownerSuffix
  );

  // ----------------------------------------------------------
  // FULL URL
  // ----------------------------------------------------------

  if (
    value.startsWith("http://") ||
    value.startsWith("https://")
  ) {

    console.log(
      "[BOA] Input is a URL"
    );

    try {

      const parsed =
        new URL(value);

      console.log(
        "[BOA] Host:",
        parsed.hostname
      );

      console.log(
        "[BOA] Path:",
        parsed.pathname
      );

      const trx =
        parsed.searchParams.get(
          "trx"
        );

      console.log(
        "[BOA] URL trx:",
        trx
      );

      if (!trx) {
        return {
          error:
            "BOA receipt URL does not contain a trx parameter.",
        };
      }

      value =
        trx.trim();

    } catch (err) {

      console.error(
        "[BOA] Invalid URL:",
        err.message
      );

      return {
        error:
          "Invalid Bank of Abyssinia receipt URL.",
      };
    }
  }

  // ----------------------------------------------------------
  // FULL LOOKUP ID
  //
  // Example:
  //
  // FT26227Z491M02196
  //
  // The final 5 digits are ONLY checked against the owner
  // suffix. They are never trusted as the account to query.
  // ----------------------------------------------------------

  const combinedMatch =
    value.match(
      /^(.+M)(\d{5})$/i
    );

  if (combinedMatch) {

    const reference =
      combinedMatch[1];

    const submittedSuffix =
      combinedMatch[2];

    console.log(
      "[BOA] Detected full lookup ID"
    );

    console.log(
      "[BOA] Reference:",
      reference
    );

    console.log(
      "[BOA] Submitted lookup suffix:",
      submittedSuffix
    );

    console.log(
      "[BOA] Owner configured suffix:",
      ownerSuffix
    );

    // --------------------------------------------------------
    // SECURITY CHECK
    //
    // Never allow a submitted lookup ID to point to another
    // account.
    // --------------------------------------------------------

    if (
      submittedSuffix !==
      ownerSuffix
    ) {

      console.warn(
        "[BOA] Lookup suffix does not match owner account."
      );

      console.warn(
        "[BOA] Owner suffix:",
        ownerSuffix
      );

      console.warn(
        "[BOA] Submitted suffix:",
        submittedSuffix
      );

      return {
        error:
          "This receipt does not belong to the configured Bank of Abyssinia receiving account.",
      };
    }

    // --------------------------------------------------------
    // OWNER SUFFIX CONFIRMED
    //
    // Even after matching, use the configured suffix.
    // Never use submittedSuffix directly.
    // --------------------------------------------------------

    const lookupId =
      `${reference}${ownerSuffix}`;

    console.log(
      "[BOA] Owner suffix confirmed."
    );

    console.log(
      "[BOA] Using owner lookup ID:",
      lookupId
    );

    return {
      reference,

      accountSuffix:
        ownerSuffix,

      lookupId,
    };
  }

  // ----------------------------------------------------------
  // SHORT REFERENCE
  //
  // Example:
  //
  // FT26227Z491M
  //
  // Always append the configured OWNER suffix.
  // ----------------------------------------------------------

  const reference =
    value;

  const lookupId =
    `${reference}${ownerSuffix}`;

  console.log(
    "[BOA] Short reference detected"
  );

  console.log(
    "[BOA] Reference:",
    reference
  );

  console.log(
    "[BOA] Using owner suffix:",
    ownerSuffix
  );

  console.log(
    "[BOA] Lookup ID:",
    lookupId
  );

  return {
    reference,

    accountSuffix:
      ownerSuffix,

    lookupId,
  };
}


// ============================================================
// FIELD LOOKUP
// ============================================================

function getField(
  object,
  names
) {

  if (
    !object ||
    typeof object !== "object"
  ) {
    return null;
  }

  const keys =
    Object.keys(object);

  for (
    const requested of names
  ) {

    // --------------------------------------------------------
    // Exact match
    // --------------------------------------------------------

    if (
      Object.prototype.hasOwnProperty.call(
        object,
        requested
      )
    ) {

      const value =
        object[requested];

      if (
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
      ) {
        return value;
      }
    }

    // --------------------------------------------------------
    // Case-insensitive match
    // --------------------------------------------------------

    const found =
      keys.find(
        key =>
          key.toLowerCase() ===
          requested.toLowerCase()
      );

    if (found) {

      const value =
        object[found];

      if (
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
      ) {
        return value;
      }
    }
  }

  return null;
}


// ============================================================
// AMOUNT
// ============================================================

function parseAmount(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  const cleaned =
    String(value)
      .replace(/ETB/gi, "")
      .replace(/,/g, "")
      .replace(/[^\d.-]/g, "");

  if (!cleaned) {
    return null;
  }

  const amount =
    Number(cleaned);

  return Number.isFinite(amount)
    ? amount
    : null;
}


// ============================================================
// BOA DATE NORMALIZATION
// ============================================================
//
// BOA normally gives:
//
//   15/08/26 09:46
//
// We interpret this as:
//
//   15 August 2026
//   09:46 Ethiopia time
//
// Ethiopia is UTC+03:00.
//
// Result:
//
//   2026-08-15T09:46:00+03:00
//
// IMPORTANT:
//
// Do NOT use:
//
//   new Date("15/08/26 09:46")
//
// because that format is ambiguous.
//
// We explicitly attach +03:00.
//

function normalizeBoaDate(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    cleanText(value);

  if (!text) {
    return null;
  }

  console.log(
    "[BOA] Normalizing transaction date:",
    text
  );

  // ----------------------------------------------------------
  // DD/MM/YY HH:mm
  //
  // Example:
  //
  // 15/08/26 09:46
  // ----------------------------------------------------------

  const match =
    text.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

  if (match) {

    const day =
      String(match[1])
        .padStart(2, "0");

    const month =
      String(match[2])
        .padStart(2, "0");

    let year =
      match[3];

    let hour =
      match[4] || "00";

    const minute =
      match[5] || "00";

    const second =
      match[6] || "00";

    hour =
      String(hour)
        .padStart(2, "0");

    if (
      year.length === 2
    ) {
      year =
        `20${year}`;
    }

    const iso =
      `${year}-${month}-${day}` +
      `T${hour}:${minute}:${second}` +
      BOA_TIMEZONE_OFFSET;

    console.log(
      "[BOA] BOA local time:",
      `${year}-${month}-${day} ${hour}:${minute}:${second}`
    );

    console.log(
      "[BOA] Timezone:",
      BOA_TIMEZONE
    );

    console.log(
      "[BOA] Timezone offset:",
      BOA_TIMEZONE_OFFSET
    );

    console.log(
      "[BOA] Normalized ISO:",
      iso
    );

    return iso;
  }

  // ----------------------------------------------------------
  // ALREADY ISO WITH TIMEZONE
  //
  // Example:
  //
  // 2026-08-15T09:46:00+03:00
  // ----------------------------------------------------------

  const isoWithTimezone =
    text.match(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
    );

  if (isoWithTimezone) {

    console.log(
      "[BOA] Input already contains timezone."
    );

    console.log(
      "[BOA] Preserving:",
      text
    );

    return text;
  }

  // ----------------------------------------------------------
  // ISO WITHOUT TIMEZONE
  //
  // Example:
  //
  // 2026-08-15T09:46:00
  //
  // Treat as BOA local time.
  // ----------------------------------------------------------

  const isoWithoutTimezone =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/
    );

  if (isoWithoutTimezone) {

    const year =
      isoWithoutTimezone[1];

    const month =
      isoWithoutTimezone[2];

    const day =
      isoWithoutTimezone[3];

    const hour =
      isoWithoutTimezone[4];

    const minute =
      isoWithoutTimezone[5];

    const second =
      isoWithoutTimezone[6] ||
      "00";

    const iso =
      `${year}-${month}-${day}` +
      `T${hour}:${minute}:${second}` +
      BOA_TIMEZONE_OFFSET;

    console.log(
      "[BOA] ISO without timezone detected."
    );

    console.log(
      "[BOA] Treating it as Ethiopia local time."
    );

    console.log(
      "[BOA] Normalized ISO:",
      iso
    );

    return iso;
  }

  // ----------------------------------------------------------
  // FALLBACK
  //
  // Do NOT call toISOString() here.
  //
  // Doing so could silently convert an unknown BOA value
  // through the server's timezone.
  // ----------------------------------------------------------

  console.warn(
    "[BOA] Could not safely normalize date:",
    text
  );

  console.warn(
    "[BOA] Preserving original BOA date value."
  );

  return text;
}


// ============================================================
// BOA LOCAL DISPLAY FORMAT
// ============================================================
//
// Converts:
//
//   2026-08-15T09:46:00+03:00
//
// into:
//
//   15/08/2026, 09:46:00
//
// This is optional frontend-friendly data.
//
// transactionTime remains the canonical timestamp.
//

function formatBoaLocalDate(
  isoValue
) {

  if (!isoValue) {
    return null;
  }

  const parsed =
    new Date(
      isoValue
    );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return isoValue;
  }

  const formatter =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone:
          BOA_TIMEZONE,

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",

        hour12:
          false,
      }
    );

  return formatter.format(
    parsed
  );
}


// ============================================================
// MAIN VERIFIER
// ============================================================

async function verifyAbyssinia(
  input,
  accountSuffix
) {

  console.log("");

  console.log(
    "========================================"
  );

  console.log(
    "[BOA] START VERIFICATION"
  );

  console.log(
    "========================================"
  );

  console.log(
    "[BOA] Input:",
    input
  );

  console.log(
    "[BOA] Configured owner suffix:",
    accountSuffix || "(none)"
  );

  // ----------------------------------------------------------
  // NORMALIZE
  // ----------------------------------------------------------

  const normalized =
    normalizeInput(
      input,
      accountSuffix
    );

  if (
    normalized.error
  ) {

    console.error(
      "[BOA] NORMALIZATION ERROR:",
      normalized.error
    );

    return {

      httpOk:
        false,

      status:
        400,

      body: {

        success:
          false,

        error:
          normalized.error,
      },
    };
  }

  const {
    reference,
    accountSuffix: suffix,
    lookupId,
  } = normalized;

  console.log("");

  console.log(
    "[BOA] NORMALIZED"
  );

  console.log(
    "[BOA] Transaction reference:",
    reference
  );

  console.log(
    "[BOA] Owner account suffix:",
    suffix
  );

  console.log(
    "[BOA] Lookup ID:",
    lookupId
  );

  // ----------------------------------------------------------
  // API URL
  // ----------------------------------------------------------

  const apiUrl =
    `${BOA_BASE}/api/onlineSlip/getDetails/?id=` +
    encodeURIComponent(
      lookupId
    );

  console.log("");

  console.log(
    "[BOA] API URL:"
  );

  console.log(
    apiUrl
  );

  // ----------------------------------------------------------
  // REQUEST
  // ----------------------------------------------------------

  try {

    const started =
      Date.now();

    console.log(
      "[BOA] Sending request..."
    );

    const res =
      await fetch(
        apiUrl,
        {
          method:
            "GET",

          headers: {

            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
              "AppleWebKit/537.36 (KHTML, like Gecko) " +
              "Chrome/131.0.0.0 Safari/537.36",

            Accept:
              "application/json, text/plain, */*",

            "Accept-Language":
              "en-US,en;q=0.9",

            Referer:
              `${BOA_BASE}/slip/?trx=` +
              encodeURIComponent(
                lookupId
              ),
          },

          timeout:
            20000,
        }
      );

    console.log(
      `[BOA] Request completed in ${
        Date.now() - started
      }ms`
    );

    console.log(
      "[BOA] HTTP:",
      res.status,
      res.statusText
    );

    console.log(
      "[BOA] Content-Type:",
      res.headers.get(
        "content-type"
      )
    );

    const rawBody =
      await res.text();

    console.log(
      "[BOA] Response length:",
      rawBody.length
    );

    console.log(
      "[BOA] Response:"
    );

    console.log(
      rawBody.substring(
        0,
        5000
      )
    );

    // --------------------------------------------------------
    // HTTP ERROR
    // --------------------------------------------------------

    if (
      !res.ok
    ) {

      console.error(
        `[BOA] HTTP ERROR ${res.status}`
      );

      return {

        httpOk:
          false,

        status:
          res.status,

        body: {

          success:
            false,

          error:
            `Abyssinia returned HTTP ${res.status}`,
        },
      };
    }

    // --------------------------------------------------------
    // JSON
    // --------------------------------------------------------

    let json;

    try {

      json =
        JSON.parse(
          rawBody
        );

    } catch (err) {

      console.error(
        "[BOA] Response is not JSON:",
        err.message
      );

      return {

        httpOk:
          false,

        status:
          502,

        body: {

          success:
            false,

          error:
            "Bank of Abyssinia returned an unexpected response.",
        },
      };
    }

    console.log("");

    console.log(
      "[BOA] PARSED JSON:"
    );

    console.log(
      JSON.stringify(
        json,
        null,
        2
      )
    );

    // --------------------------------------------------------
    // RESPONSE BODY
    // --------------------------------------------------------

    const header =
      json?.header || {};

    const transactions =
      Array.isArray(
        json?.body
      )
        ? json.body
        : [];

    console.log(
      "[BOA] Header:",
      header
    );

    console.log(
      "[BOA] Transactions:",
      transactions.length
    );

    // --------------------------------------------------------
    // NO TRANSACTION
    // --------------------------------------------------------

    if (
      transactions.length === 0
    ) {

      console.error(
        "[BOA] No transaction returned."
      );

      return {

        httpOk:
          false,

        status:
          404,

        body: {

          success:
            false,

          error:
            "Receipt not found or could not be processed.",

          lookup_id:
            lookupId,
        },
      };
    }

    // --------------------------------------------------------
    // PROVIDER STATUS
    // --------------------------------------------------------

    if (
      header.status &&
      String(
        header.status
      ).toLowerCase() !==
        "success"
    ) {

      console.error(
        "[BOA] Provider status:",
        header.status
      );

      return {

        httpOk:
          false,

        status:
          404,

        body: {

          success:
            false,

          error:
            "Bank of Abyssinia did not confirm this transaction.",
        },
      };
    }

    // --------------------------------------------------------
    // TRANSACTION
    // --------------------------------------------------------

    const transaction =
      transactions[0];

    console.log("");

    console.log(
      "[BOA] TRANSACTION OBJECT:"
    );

    console.log(
      JSON.stringify(
        transaction,
        null,
        2
      )
    );

    // ========================================================
    // REFERENCE
    // ========================================================

    const returnedReference =
      getField(
        transaction,
        [
          "Transaction Reference",
          "Transaction Ref",
          "Transaction ID",
          "Payment Reference",
          "Reference",
        ]
      );

    // ========================================================
    // AMOUNT
    // ========================================================

    const transferredAmount =
      getField(
        transaction,
        [
          "Transferred Amount",
          "Transfer Amount",
          "Transaction Amount",
          "Amount",
        ]
      );

    const amount =
      parseAmount(
        transferredAmount
      );

    // ========================================================
    // SENDER
    // ========================================================

    const payerName =
      getField(
        transaction,
        [
          "Payer's Name",
          "Payer Name",
          "Source Account Name",
          "Sender Name",
          "Debited Account Name",
        ]
      );

    // ========================================================
    // RECEIVER
    // ========================================================
    //
    // BOA may or may not expose a receiver name.
    //
    // If BOA gives us one:
    //
    //   To: ABEBE KEBEDE
    //
    // If BOA does not:
    //
    //   To: You
    //
    // The "You" value is ONLY a display fallback.
    //
    // The actual transaction association comes from the
    // successful BOA lookup using the configured owner suffix.
    // ========================================================

    const receiptReceiverName =
      getField(
        transaction,
        [
          "Receiver's Name",
          "Receiver Name",
          "Beneficiary Name",
          "Beneficiary",
          "Recipient Name",
          "Recipient",
          "Credited Account Name",
          "Receiver",
          "To",
        ]
      );

    const cleanedReceiverName =
      cleanText(
        receiptReceiverName
      );

    const receiverIsOwnerFallback =
      !cleanedReceiverName;

    const receiverName =
      cleanedReceiverName ||
      "You";

    // ========================================================
    // DATE / TIME
    // ========================================================

    const rawTransactionDate =
      getField(
        transaction,
        [
          "Transaction Date",
          "Transaction Date & Time",
          "Payment Date",
          "Date",
          "Date & Time",
          "Transaction Time",
        ]
      );

    console.log("");

    console.log(
      "[BOA] Raw transaction date:",
      rawTransactionDate
    );

    const transactionTime =
      normalizeBoaDate(
        rawTransactionDate
      );

    const transactionTimeLocal =
      formatBoaLocalDate(
        transactionTime
      );

    // ========================================================
    // TRANSACTION TYPE
    // ========================================================

    const transactionType =
      getField(
        transaction,
        [
          "Transaction Type",
          "Type",
        ]
      );

    // ========================================================
    // SOURCE ACCOUNT
    // ========================================================

    const sourceAccount =
      getField(
        transaction,
        [
          "Source Account",
          "Source Account Number",
          "Source Account No",
        ]
      );

    // ========================================================
    // PHONE
    // ========================================================

    const phoneNumber =
      getField(
        transaction,
        [
          "Phone Number",
          "Phone",
          "Mobile Number",
        ]
      );

    // ========================================================
    // SERVICE CHARGE
    // ========================================================

    const serviceCharge =
      getField(
        transaction,
        [
          "Service Charge",
        ]
      );

    // ========================================================
    // VAT
    // ========================================================

    const vat =
      getField(
        transaction,
        [
          "VAT",
          "Vat",
          "VAT (15%)",
        ]
      );

    // ========================================================
    // TOTAL
    // ========================================================

    const totalAmount =
      getField(
        transaction,
        [
          "Total Amount",
          "Total Amount including VAT",
        ]
      );

    // ========================================================
    // LOG EVERYTHING
    // ========================================================

    console.log("");

    console.log(
      "========================================"
    );

    console.log(
      "[BOA] EXTRACTED VALUES"
    );

    console.log(
      "========================================"
    );

    console.log(
      "[BOA] Reference:",
      returnedReference
    );

    console.log(
      "[BOA] Amount:",
      amount
    );

    console.log(
      "[BOA] Payer:",
      payerName
    );

    console.log(
      "[BOA] Receipt receiver:",
      cleanedReceiverName
    );

    console.log(
      "[BOA] Display receiver:",
      receiverName
    );

    console.log(
      "[BOA] Receiver fallback:",
      receiverIsOwnerFallback
    );

    console.log(
      "[BOA] Raw transaction date:",
      rawTransactionDate
    );

    console.log(
      "[BOA] Transaction time ISO:",
      transactionTime
    );

    console.log(
      "[BOA] Transaction time local:",
      transactionTimeLocal
    );

    console.log(
      "[BOA] Transaction type:",
      transactionType
    );

    console.log(
      "[BOA] Source account:",
      sourceAccount
    );

    console.log(
      "[BOA] Phone:",
      phoneNumber
    );

    console.log(
      "[BOA] Service charge:",
      serviceCharge
    );

    console.log(
      "[BOA] VAT:",
      vat
    );

    console.log(
      "[BOA] Total amount:",
      totalAmount
    );

    // ========================================================
    // VALIDATE AMOUNT
    // ========================================================

    if (
      amount === null ||
      !Number.isFinite(
        amount
      )
    ) {

      console.error(
        "[BOA] Amount could not be determined."
      );

      return {

        httpOk:
          false,

        status:
          422,

        body: {

          success:
            false,

          error:
            "Missing or invalid transaction amount in Abyssinia response.",
        },
      };
    }

    // ========================================================
    // VALIDATE REFERENCE
    // ========================================================

    const finalReference =
      cleanText(
        returnedReference
      ) ||
      reference;

    // ========================================================
    // FINAL RESULT
    // ========================================================
    //
    // Example when receiver is NOT available:
    //
    // {
    //   "payer_name": "FUAD AKMEL NUR",
    //   "receiver_name": "You",
    //   "receiverName": "You",
    //   "receiver_is_owner_fallback": true
    // }
    //
    // Example when receiver IS available:
    //
    // {
    //   "payer_name": "FUAD AKMEL NUR",
    //   "receiver_name": "ABEBE KEBEDE",
    //   "receiverName": "ABEBE KEBEDE",
    //   "receiver_is_owner_fallback": false
    // }
    //
    // ========================================================

    const body = {

      success:
        true,

      // ------------------------------------------------------
      // CANONICAL PROVIDER FIELDS
      // ------------------------------------------------------

      reference:
        finalReference,

      amount,

      payer_name:
        cleanText(
          payerName
        ),

      receiver_name:
        receiverName,

      transaction_date:
        transactionTime,

      transaction_type:
        cleanText(
          transactionType
        ),

      source_account:
        cleanText(
          sourceAccount
        ),

      phone_number:
        cleanText(
          phoneNumber
        ),

      service_charge:
        parseAmount(
          serviceCharge
        ),

      vat:
        parseAmount(
          vat
        ),

      total_amount:
        parseAmount(
          totalAmount
        ),

      // ------------------------------------------------------
      // OWNER / LOOKUP INFORMATION
      // ------------------------------------------------------

      account_suffix:
        suffix,

      lookup_id:
        lookupId,

      verification_url:
        `${BOA_BASE}/slip/?trx=` +
        encodeURIComponent(
          lookupId
        ),

      // ------------------------------------------------------
      // NORMALIZED ALIASES
      // ------------------------------------------------------

      senderName:
        cleanText(
          payerName
        ),

      receiverName:
        receiverName,

      // ------------------------------------------------------
      // RECEIVER METADATA
      // ------------------------------------------------------
      //
      // true:
      //   BOA did not provide receiver name and "You" is used.
      //
      // false:
      //   BOA provided an actual receiver name.
      //

      receiver_is_owner_fallback:
        receiverIsOwnerFallback,

      // ------------------------------------------------------
      // TIME
      // ------------------------------------------------------
      //
      // Canonical timezone-aware timestamp:
      //
      // 2026-08-15T09:46:00+03:00
      //

      transactionTime:
        transactionTime,

      paidAt:
        transactionTime,

      // ------------------------------------------------------
      // FRONTEND DISPLAY TIME
      //
      // Example:
      //
      // 15/08/2026, 09:46:00
      // ------------------------------------------------------

      transactionTimeLocal:
        transactionTimeLocal,

      // ------------------------------------------------------
      // TIMEZONE METADATA
      // ------------------------------------------------------

      transactionTimezone:
        BOA_TIMEZONE,

      transactionTimezoneOffset:
        BOA_TIMEZONE_OFFSET,
    };

    // ========================================================
    // SUCCESS LOG
    // ========================================================

    console.log("");

    console.log(
      "========================================"
    );

    console.log(
      "[BOA] VERIFICATION SUCCESS"
    );

    console.log(
      "========================================"
    );

    console.log(
      JSON.stringify(
        body,
        null,
        2
      )
    );

    return {

      httpOk:
        true,

      status:
        200,

      body,
    };

  } catch (err) {

    // ========================================================
    // REQUEST EXCEPTION
    // ========================================================

    console.error("");

    console.error(
      "========================================"
    );

    console.error(
      "[BOA] REQUEST EXCEPTION"
    );

    console.error(
      "========================================"
    );

    console.error(
      "[BOA] Error name:",
      err.name
    );

    console.error(
      "[BOA] Error message:",
      err.message
    );

    console.error(
      "[BOA] Error code:",
      err.code
    );

    console.error(
      "[BOA] Full error:",
      err
    );

    return {

      httpOk:
        false,

      status:
        502,

      body: {

        success:
          false,

        error:
          `Could not reach Abyssinia: ${err.message}`,
      },
    };
  }
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {
  verifyAbyssinia,
};


