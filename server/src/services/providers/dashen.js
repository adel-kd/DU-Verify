// services/providers/dashen.js
//
// Verifies a Dashen Bank transaction by fetching the official
// Dashen Super App receipt directly from Dashen's receipt service.
//
// No third-party verification API is used.
//
// Dashen receipts can contain:
//
//   Transaction Reference: 641OBTS2518100WH
//   Transfer Reference:    OBTS35546016067047784078
//
// The Transaction Reference is the receipt URL identifier:
//
// https://receipt.dashensuperapp.com/receipt/641OBTS2518100WH
//
// The provider also accepts a full Dashen receipt URL.

const fetch = require("node-fetch");
const https = require("https");
const pdfParse = require("pdf-parse");

const insecureAgent = new https.Agent({
  rejectUnauthorized: false,
});

function titleCase(str) {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function normalizeReference(reference) {
  if (!reference) return null;

  let value = String(reference).trim();

  // Support:
  // https://receipt.dashensuperapp.com/receipt/641OBTS2518100WH

  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);

      const host = url.hostname.toLowerCase();

      if (host === "receipt.dashensuperapp.com") {
        const parts = url.pathname
          .split("/")
          .filter(Boolean);

        const receiptIndex = parts.findIndex(
          (part) => part.toLowerCase() === "receipt"
        );

        if (
          receiptIndex !== -1 &&
          parts[receiptIndex + 1]
        ) {
          return decodeURIComponent(
            parts[receiptIndex + 1]
          ).trim();
        }
      }
    }
  } catch {
    // Treat it as a normal reference below.
  }

  // Also support:
  // receipt.dashensuperapp.com/receipt/641OBTS2518100WH

  const match = value.match(
    /receipt\.dashensuperapp\.com\/receipt\/([^/?#]+)/i
  );

  if (match) {
    return decodeURIComponent(match[1]).trim();
  }

  return value;
}

/**
 * Extract the transaction amount from the Dashen PDF.
 *
 * Supports:
 *
 * Transaction Amount: ETB 1,600.00
 *
 * and the Dashen Super App format:
 *
 * Transaction Details
 * ETB 1,600.0
 */
function extractAmount(text) {
  const transactionAmountPatterns = [
    /Transaction\s*Amount\s*:?\s*(?:ETB|Birr)?\s*([\d,]+(?:\.\d+)?)/i,

    /Transaction\s*Amount\s*(?:ETB|Birr)?\s*([\d,]+(?:\.\d+)?)/i,
  ];

  for (const regex of transactionAmountPatterns) {
    const match = text.match(regex);

    if (match) {
      const amount = Number(
        match[1].replace(/,/g, "")
      );

      if (Number.isFinite(amount)) {
        return amount;
      }
    }
  }

  // Dashen Super App receipt:
  //
  // Transaction Details
  // ETB 1,600.0

  const etbMatches = [
    ...text.matchAll(
      /\bETB\s*([\d,]+(?:\.\d+)?)/gi
    ),
  ];

  for (const match of etbMatches) {
    const amount = Number(
      match[1].replace(/,/g, "")
    );

    if (Number.isFinite(amount)) {
      return amount;
    }
  }

  // Fallback for:
  // Birr 1,600.00

  const birrMatch = text.match(
    /\bBirr\s*([\d,]+(?:\.\d+)?)/i
  );

  if (birrMatch) {
    const amount = Number(
      birrMatch[1].replace(/,/g, "")
    );

    if (Number.isFinite(amount)) {
      return amount;
    }
  }

  return null;
}

/**
 * Extract Dashen transaction date.
 *
 * Dashen receipt example:
 *
 * Transaction Date: Jun 29, 2025, 10:55:59 am
 *
 * pdf-parse may flatten the PDF into:
 *
 * Transaction Date: Jun 29, 2025, 10:55:59 am Transaction Details ETB 1,600.0
 *
 * Therefore we extract the exact date/time pattern instead of
 * trying to capture everything until the next section.
 */
function extractTransactionDate(text) {
  const patterns = [
    // Jun 29, 2025, 10:55:59 am
    /Transaction\s*Date\s*:?\s*([A-Za-z]{3}\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM|am|pm))/i,

    // June 29, 2025, 10:55:59 am
    /Transaction\s*Date\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM|am|pm))/i,

    // Jun 29, 2025 10:55:59 am
    /Transaction\s*Date\s*:?\s*([A-Za-z]{3}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM|am|pm))/i,

    // 29/06/2025 10:55:59
    /Transaction\s*Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\s+\d{1,2}:\d{2}:\d{2})/i,

    // 2025-06-29 10:55:59
    /Transaction\s*Date\s*:?\s*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/i,
  ];

  for (const regex of patterns) {
    const match = text.match(regex);

    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

function extractDashenData(rawText) {
  // Normalize PDF whitespace.
  const text = rawText
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // ---------------------------------------------------------
  // Sender Name
  // ---------------------------------------------------------

  const senderName = text.match(
    /Sender\s*Name\s*:?\s*(.*?)\s+Sender\s*Account\s*Number/i
  )?.[1]?.trim();

  // ---------------------------------------------------------
  // Receiver Name
  // ---------------------------------------------------------

  const receiverName = text.match(
    /Receiver\s*Name\s*:?\s*(.*?)\s+Receiver\s*Account\s*Number/i
  )?.[1]?.trim();

  // ---------------------------------------------------------
  // Transaction Reference
  // ---------------------------------------------------------

  const transactionReference = text.match(
    /Transaction\s*Reference\s*:?\s*([A-Z0-9-]+)/i
  )?.[1]?.trim();

  // ---------------------------------------------------------
  // Transfer Reference
  // ---------------------------------------------------------

  const transferReference = text.match(
    /Transfer\s*Reference\s*:?\s*([A-Z0-9-]+)/i
  )?.[1]?.trim();

  // ---------------------------------------------------------
  // Transaction Date
  // ---------------------------------------------------------

  const transactionDate =
    extractTransactionDate(text);

  // ---------------------------------------------------------
  // Institution
  // ---------------------------------------------------------

  const institutionName = text.match(
    /Institution\s*Name\s*:?\s*(.*?)\s+Transaction\s*Reference/i
  )?.[1]?.trim();

  // ---------------------------------------------------------
  // Service Type
  // ---------------------------------------------------------

  const serviceType = text.match(
    /Service\s*Type\s*:?\s*(.*?)\s+Narrative/i
  )?.[1]?.trim();

  // ---------------------------------------------------------
  // Narrative
  // ---------------------------------------------------------

  const narrative = text.match(
    /Narrative\s*:?\s*(.*?)\s+Receiver\s*Name/i
  )?.[1]?.trim();

  // ---------------------------------------------------------
  // Amount
  // ---------------------------------------------------------

  const amount = extractAmount(text);

  return {
    text,

    senderName:
      senderName || null,

    receiverName:
      receiverName || null,

    transactionReference:
      transactionReference || null,

    transferReference:
      transferReference || null,

    transactionDate,

    institutionName:
      institutionName || null,

    serviceType:
      serviceType || null,

    narrative:
      narrative || null,

    amount,
  };
}

async function verifyDashen(reference) {
  // ---------------------------------------------------------
  // Normalize incoming reference.
  //
  // Supports:
  //
  // 641OBTS2518100WH
  //
  // and:
  //
  // https://receipt.dashensuperapp.com/receipt/641OBTS2518100WH
  // ---------------------------------------------------------

  const normalizedReference =
    normalizeReference(reference);

  if (!normalizedReference) {
    return {
      httpOk: false,
      status: 400,
      body: {
        success: false,
        error:
          "Dashen transaction reference is required.",
      },
    };
  }

  // Prevent invalid values from being sent to Dashen.

  if (!/^[A-Z0-9-]+$/i.test(normalizedReference)) {
    return {
      httpOk: false,
      status: 400,
      body: {
        success: false,
        error:
          "Invalid Dashen transaction reference.",
      },
    };
  }

  // IMPORTANT:
  //
  // Dashen receipt URLs use the Transaction Reference,
  // NOT the Transfer Reference.
  //
  // Correct:
  //
  // 641OBTS2518100WH
  //
  // Incorrect:
  //
  // OBTS35546016067047784078

  const url =
    `https://receipt.dashensuperapp.com/receipt/` +
    encodeURIComponent(normalizedReference);

  console.log(
    `[dashen] verifying receipt: ${normalizedReference}`
  );

  const maxRetries = 3;

  for (
    let attempt = 1;
    attempt <= maxRetries;
    attempt++
  ) {
    try {
      const res = await fetch(url, {
        agent: insecureAgent,

        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/151.0.0.0 Safari/537.36",

          Accept:
            "application/pdf,application/octet-stream,*/*",

          "Accept-Language":
            "en-US,en;q=0.9",

          Referer:
            "https://receipt.dashensuperapp.com/",
        },

        timeout: 25000,
      });

      console.log(
        `[dashen] HTTP ${res.status} for ${normalizedReference}`
      );

      // -------------------------------------------------------
      // HTTP errors
      // -------------------------------------------------------

      if (!res.ok) {
        if (res.status === 404) {
          return {
            httpOk: false,
            status: 404,
            body: {
              success: false,
              error:
                "Dashen receipt not found.",
            },
          };
        }

        // Retry temporary Dashen server errors.

        if (
          (
            res.status === 500 ||
            res.status === 502 ||
            res.status === 503 ||
            res.status === 504
          ) &&
          attempt < maxRetries
        ) {
          console.log(
            `[dashen] temporary HTTP ${res.status}; ` +
            `retrying (${attempt}/${maxRetries})`
          );

          await new Promise(
            (resolve) => setTimeout(resolve, 1500)
          );

          continue;
        }

        return {
          httpOk: false,
          status: res.status,
          body: {
            success: false,
            error:
              `Dashen returned HTTP ${res.status}`,
          },
        };
      }

      // -------------------------------------------------------
      // Response
      // -------------------------------------------------------

      const contentType =
        res.headers.get("content-type") || "";

      console.log(
        `[dashen] content-type: ${contentType}`
      );

      const buffer = await res.buffer();

      if (!buffer || buffer.length === 0) {
        return {
          httpOk: false,
          status: 422,
          body: {
            success: false,
            error:
              "Dashen returned an empty receipt.",
          },
        };
      }

      // -------------------------------------------------------
      // Parse official Dashen PDF
      // -------------------------------------------------------

      let parsed;

      try {
        parsed = await pdfParse(buffer);
      } catch (pdfError) {
        console.error(
          "[dashen] PDF parsing failed:",
          pdfError.message
        );

        return {
          httpOk: false,
          status: 422,
          body: {
            success: false,
            error:
              "Could not parse the Dashen receipt PDF.",
          },
        };
      }

      const rawText = parsed.text || "";

      const data =
        extractDashenData(rawText);

      // -------------------------------------------------------
      // Debug extraction
      // -------------------------------------------------------

      console.log(
        "[dashen] parsed transaction reference:",
        data.transactionReference
      );

      console.log(
        "[dashen] parsed transfer reference:",
        data.transferReference
      );

      console.log(
        "[dashen] parsed amount:",
        data.amount
      );

      console.log(
        "[dashen] parsed date:",
        data.transactionDate
      );

      // -------------------------------------------------------
      // Required fields
      // -------------------------------------------------------

      if (
        !data.transactionReference ||
        data.amount == null
      ) {
        console.error(
          "[dashen] Could not extract required receipt fields."
        );

        console.error(
          "[dashen] PDF text:",
          data.text
        );

        return {
          httpOk: false,
          status: 422,
          body: {
            success: false,
            error:
              "Could not read the transaction reference or amount from the Dashen receipt PDF.",
          },
        };
      }

      // -------------------------------------------------------
      // Verify the returned receipt is the requested receipt
      // -------------------------------------------------------

      if (
        data.transactionReference.toUpperCase() !==
        normalizedReference.toUpperCase()
      ) {
        console.error(
          "[dashen] Receipt reference mismatch:",
          {
            requested:
              normalizedReference,

            returned:
              data.transactionReference,
          }
        );

        return {
          httpOk: false,
          status: 422,
          body: {
            success: false,
            error:
              "Dashen receipt reference does not match the requested transaction.",
          },
        };
      }

      // -------------------------------------------------------
      // Successful verification
      // -------------------------------------------------------

      const body = {
        success: true,

        // Primary Dashen Transaction Reference.
        reference:
          data.transactionReference,

        // Separate Transfer Reference.
        transfer_reference:
          data.transferReference,

        amount:
          data.amount,

        payer_name:
          data.senderName
            ? titleCase(data.senderName)
            : null,

        receiver_name:
          data.receiverName
            ? titleCase(data.receiverName)
            : null,

        // IMPORTANT:
        // This now contains:
        //
        // Jun 29, 2025, 10:55:59 am
        //
        transaction_date:
          data.transactionDate,

        institution_name:
          data.institutionName,

        service_type:
          data.serviceType,

        narrative:
          data.narrative,

        // Official receipt URL that was actually verified.
        receipt_url:
          url,
      };

      console.log(
        "[dashen] verification successful:",
        {
          reference:
            body.reference,

          transfer_reference:
            body.transfer_reference,

          amount:
            body.amount,

          transaction_date:
            body.transaction_date,
        }
      );

      return {
        httpOk: true,
        status: 200,
        body,
      };
    } catch (err) {
      console.error(
        `[dashen] attempt ${attempt}/${maxRetries} failed:`,
        err.message
      );

      if (attempt === maxRetries) {
        return {
          httpOk: false,
          status: 502,
          body: {
            success: false,
            error:
              `Could not reach Dashen: ${err.message}`,
          },
        };
      }

      await new Promise(
        (resolve) => setTimeout(resolve, 1500)
      );
    }
  }
}

module.exports = {
  verifyDashen,
};