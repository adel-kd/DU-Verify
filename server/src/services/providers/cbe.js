// services/providers/cbe.js
//
// Verifies CBE (Commercial Bank of Ethiopia) transactions directly
// against CBE's own public receipt systems.
//
// NEW CBE:
//
//   https://mbreciept.cbe.com.et/v2-XXXXXXXX
//
// The QR code contains the full receipt URL.
//
// The receipt data is retrieved from:
//
//   https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/<TOKEN>
//
// If the direct API call fails, we fall back to a real headless
// browser loading the actual receipt page and observing the same
// network response a human's browser would get. This is a transport
// fallback only — it never fabricates a result. If neither the
// direct call nor Puppeteer can get real data back, verification
// fails honestly.
//
// LEGACY CBE:
//
//   FTXXXXXXXXXX
//
// Uses:
//
//   https://apps.cbe.com.et:100/?id=<REFERENCE><ACCOUNT_SUFFIX>
//
// No third-party verification API is used.

const fetch = require("node-fetch");
const https = require("https");
const dns = require("dns");
const pdfParse = require("pdf-parse");
const puppeteer = require("puppeteer");


// ============================================================
// CBE HTTPS AGENTS
// ============================================================
//
// IMPORTANT:
//
// The new CBE API can timeout when Node resolves the host through
// an unreachable IPv6 route.
//
// We therefore force IPv4 for the new CBE API.
//
// The legacy endpoint keeps its relaxed TLS agent because the old
// CBE certificate has historically required it.
//
// ============================================================

const cbeApiAgent = new https.Agent({
  keepAlive: true,
  family: 4,
  rejectUnauthorized: true,
});

const insecureAgent = new https.Agent({
  keepAlive: true,
  rejectUnauthorized: false,
});


// ============================================================
// CBE NEW RECEIPT
// ============================================================

const NEW_CBE_URL_REGEX =
  /^https?:\/\/mbreciept\.cbe\.com\.et\/([^/?#]+)\/?$/i;

const NEW_CBE_HOST_PATH_REGEX =
  /^mbreciept\.cbe\.com\.et\/([^/?#]+)\/?$/i;

const NEW_CBE_TOKEN_REGEX =
  /^[A-Za-z0-9][A-Za-z0-9-]{5,100}$/;


// ============================================================
// LEGACY CBE
// ============================================================

const LEGACY_CBE_REFERENCE_REGEX =
  /^FT[A-Z0-9]{10}$/i;


// ============================================================
// CBE ENDPOINTS
// ============================================================

const CBE_NEW_API_BASE =
  "https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail";

const CBE_RECEIPT_BASE =
  "https://mbreciept.cbe.com.et";


// ============================================================
// PUBLIC CBE APPLICATION HEADERS
// ============================================================

const CBE_APP_ID =
  process.env.CBE_APP_ID ||
  "d1292e42-7400-49de-a2d3-9731caa4c819";

const CBE_APP_VERSION =
  process.env.CBE_APP_VERSION ||
  "0a01980b-9859-1369-8198-59f403820000";


// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}


function titleCase(str) {
  if (!str) {
    return str;
  }

  return String(str)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}


// ============================================================
// EXTRACT NEW CBE TOKEN
// ============================================================

function extractNewToken(input) {
  if (
    !input ||
    typeof input !== "string"
  ) {
    return null;
  }

  let value =
    input.trim();

  if (!value) {
    return null;
  }


  // Remove accidental quotes.

  value =
    value
      .replace(/^["']|["']$/g, "")
      .trim();


  if (!value) {
    return null;
  }


  // ==========================================================
  // FULL URL
  // ==========================================================

  try {
    const parsed =
      new URL(value);

    const hostname =
      parsed.hostname.toLowerCase();

    if (
      hostname ===
      "mbreciept.cbe.com.et"
    ) {
      const parts =
        parsed.pathname
          .split("/")
          .filter(Boolean);

      if (
        parts.length !== 1
      ) {
        return null;
      }

      const token =
        parts[0].trim();

      if (
        NEW_CBE_TOKEN_REGEX.test(
          token
        )
      ) {
        return token;
      }

      return null;
    }
  } catch {
    // Continue.
  }


  // ==========================================================
  // HOST + PATH
  // ==========================================================

  const hostMatch =
    value.match(
      NEW_CBE_HOST_PATH_REGEX
    );

  if (hostMatch) {
    const token =
      hostMatch[1].trim();

    if (
      NEW_CBE_TOKEN_REGEX.test(
        token
      )
    ) {
      return token;
    }

    return null;
  }


  // ==========================================================
  // RAW V2 TOKEN
  // ==========================================================

  if (
    NEW_CBE_TOKEN_REGEX.test(
      value
    ) &&
    /^v2-/i.test(value)
  ) {
    return value;
  }


  return null;
}


// ============================================================
// CBE API REQUEST
// ============================================================
//
// This is intentionally separated from verifyCBENew().
//
// The important change is:
//
//   family: 4
//
// which prevents Node from getting stuck trying an IPv6 route
// when the hosting environment cannot reach CBE over IPv6.
//

async function requestCBEApi(
  url,
  timeoutMs = 20000
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(() => {
      controller.abort();
    }, timeoutMs);


  try {

    const res =
      await fetch(url, {
        method: "GET",

        agent:
          cbeApiAgent,

        signal:
          controller.signal,

        headers: {
          Accept:
            "application/json, text/plain, */*",

          Origin:
            CBE_RECEIPT_BASE,

          Referer:
            `${CBE_RECEIPT_BASE}/`,

          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/149.0.0.0 Safari/537.36",

          "X-App-ID":
            CBE_APP_ID,

          "X-App-Version":
            CBE_APP_VERSION,

          Connection:
            "keep-alive",
        },
      });


    return res;

  } catch (err) {

    if (
      err.name ===
      "AbortError"
    ) {
      throw new Error(
        `CBE API connection timed out after ${timeoutMs}ms`
      );
    }

    throw err;

  } finally {
    clearTimeout(timeout);
  }
}


// ============================================================
// NORMALIZE RAW CBE JSON INTO OUR RESPONSE SHAPE
// ============================================================
//
// Shared by both the direct-fetch path and the Puppeteer fallback
// path so the returned shape is identical no matter which transport
// actually reached CBE.

function normalizeCBEData(data, token) {

  if (
    !data ||
    typeof data !== "object" ||
    !data.id
  ) {
    return null;
  }


  let amount = null;

  if (
    data.amountCredited !== undefined &&
    data.amountCredited !== null &&
    data.amountCredited !== ""
  ) {
    amount = Number(data.amountCredited);
  }

  if (
    !Number.isFinite(amount) &&
    data.amountDebited !== undefined &&
    data.amountDebited !== null &&
    data.amountDebited !== ""
  ) {
    amount = Number(data.amountDebited);
  }

  if (!Number.isFinite(amount)) {
    amount = null;
  }


  let transactionDate = null;

  if (
    Array.isArray(data.dateTimes) &&
    data.dateTimes.length
  ) {
    transactionDate = data.dateTimes[0];
  }


  let paymentDetails = null;

  if (
    Array.isArray(data.paymentDetails) &&
    data.paymentDetails.length
  ) {
    paymentDetails = data.paymentDetails[0];
  }


  return {
    success: true,

    reference: data.id || null,
    amount,

    currency:
      data.creditCurrency ||
      data.debitCurrency ||
      "ETB",

    payer_name: data.debitAccountHolder || null,
    payer_account: data.debitAccountNo || null,

    receiver_name: data.creditAccountHolder || null,
    receiver_account: data.creditAccountNo || null,

    transaction_date: transactionDate,
    transaction_type: data.transactionType || null,
    payment_details: paymentDetails,

    receipt_token: token,
    receipt_url: `${CBE_RECEIPT_BASE}/${token}`,
  };
}


// ============================================================
// PUPPETEER FALLBACK
// ============================================================
//
// Loads the real receipt page in a real headless browser so the
// site's own JS runs, and listens for the network response the page
// itself makes to mb.cbe.com.et. We read the real JSON body from
// that response — we don't inject, guess, or fabricate anything. If
// the page never makes that call (or it fails), we return null and
// the caller treats it as a genuine failure.

async function fetchViaPuppeteer(token, timeoutMs = 25000) {

  const pageUrl = `${CBE_RECEIPT_BASE}/${token}`;

  let browser;

  try {

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/149.0.0.0 Safari/537.36"
    );

    let captured = null;

    page.on("response", async (response) => {
      const url = response.url();

      if (
        url.includes(
          "/api/v1/transactions/public/transaction-detail/"
        )
      ) {
        try {
          captured = await response.json();
          console.log(
            "[cbe] puppeteer captured transaction-detail response"
          );
        } catch (e) {
          // Not JSON (e.g. an error page) — leave captured null.
        }
      }
    });

    await page.goto(pageUrl, {
      waitUntil: "networkidle2",
      timeout: timeoutMs,
    });

    if (!captured) {
      // Give the SPA a moment in case the API call fires late.
      await sleep(3000);
    }

    await browser.close();
    browser = null;

    return captured;

  } catch (err) {

    console.warn(
      "[cbe] puppeteer fallback failed:",
      err.message
    );

    return null;

  } finally {

    if (browser) {
      await browser.close();
    }
  }
}


// ============================================================
// VERIFY NEW CBE RECEIPT
// ============================================================

async function verifyCBENew(token) {

  if (!token) {
    return {
      httpOk: false,
      status: 400,

      body: {
        success: false,
        error:
          "CBE receipt token is missing.",
      },
    };
  }


  const url =
    `${CBE_NEW_API_BASE}/${encodeURIComponent(token)}`;


  console.log(
    "[cbe] verifying new receipt token:",
    token
  );

  console.log(
    "[cbe] new API:",
    url
  );

  console.log(
    "[cbe] transport: IPv4"
  );


  const maxRetries = 3;

  let lastFailure = null;


  for (
    let attempt = 1;
    attempt <= maxRetries;
    attempt++
  ) {

    try {

      const res =
        await requestCBEApi(
          url,
          20000
        );


      console.log(
        `[cbe] CBE API responded HTTP ${res.status}`
      );


      // ======================================================
      // 404
      // ======================================================

      if (
        res.status === 404
      ) {
        return {
          httpOk: false,
          status: 404,

          body: {
            success: false,
            error:
              "Invalid or expired CBE receipt.",
          },
        };
      }


      // ======================================================
      // RATE LIMIT
      // ======================================================

      if (
        res.status === 429
      ) {

        if (
          attempt < maxRetries
        ) {
          await sleep(
            1500 * attempt
          );

          continue;
        }

        lastFailure = {
          httpOk: false,
          status: 429,

          body: {
            success: false,
            error:
              "CBE receipt service is temporarily rate-limited. Try again.",
          },
        };

        break;
      }


      // ======================================================
      // SERVER ERRORS
      // ======================================================

      if (!res.ok) {

        if (
          attempt < maxRetries &&
          res.status >= 500
        ) {
          await sleep(
            1000 * attempt
          );

          continue;
        }

        lastFailure = {
          httpOk: false,
          status: res.status,

          body: {
            success: false,
            error:
              `CBE receipt service returned HTTP ${res.status}.`,
          },
        };

        break;
      }


      // ======================================================
      // JSON
      // ======================================================

      let data;

      try {

        data =
          await res.json();

      } catch (err) {

        lastFailure = {
          httpOk: false,
          status: 502,

          body: {
            success: false,
            error:
              "CBE returned an invalid receipt response.",
          },
        };

        break;
      }


      // ======================================================
      // RESPONSE VALIDATION
      // ======================================================

      const normalized =
        normalizeCBEData(data, token);


      if (!normalized) {

        lastFailure = {
          httpOk: false,
          status: 422,

          body: {
            success: false,
            error:
              "CBE receipt response did not contain a transaction reference.",
          },
        };

        break;
      }


      console.log(
        "[cbe] NEW receipt verified (direct):",
        {
          reference: normalized.reference,
          amount: normalized.amount,
          transactionDate: normalized.transaction_date,
          payer: normalized.payer_name,
          receiver: normalized.receiver_name,
        }
      );


      return {
        httpOk: true,
        status: 200,
        body: normalized,
      };

    } catch (err) {

      console.warn(
        `[cbe] new receipt attempt ${attempt} failed:`,
        err.message
      );

      lastFailure = {
        httpOk: false,
        status: 502,

        body: {
          success: false,

          error:
            `Could not reach CBE receipt service: ${err.message}`,
        },
      };

      if (
        attempt < maxRetries
      ) {

        await sleep(
          1500 * attempt
        );

        continue;
      }
    }
  }


  // ==============================================================
  // FALLBACK: real browser, in case the direct API path is being
  // blocked/dropped for this environment but the actual site still
  // works for a normal browser.
  // ==============================================================

  console.log(
    "[cbe] direct fetch exhausted, falling back to Puppeteer"
  );

  const puppetData = await fetchViaPuppeteer(token);

  const normalized =
    normalizeCBEData(puppetData, token);


  if (normalized) {

    console.log(
      "[cbe] NEW receipt verified (puppeteer fallback):",
      {
        reference: normalized.reference,
        amount: normalized.amount,
        transactionDate: normalized.transaction_date,
        payer: normalized.payer_name,
        receiver: normalized.receiver_name,
      }
    );

    return {
      httpOk: true,
      status: 200,
      body: normalized,
    };
  }


  // Both direct and Puppeteer failed — return the most informative
  // honest failure we have. We never fabricate a "success" here.

  return (
    lastFailure || {
      httpOk: false,
      status: 502,

      body: {
        success: false,
        error:
          "Could not verify the CBE receipt (direct and browser fallback both failed).",
      },
    }
  );
}


// ============================================================
// VERIFY LEGACY CBE PDF RECEIPT
// ============================================================

async function verifyCBELegacy(
  reference,
  accountSuffix
) {

  if (!accountSuffix) {

    return {
      httpOk: false,
      status: 400,

      body: {
        success: false,
        error:
          "CBE legacy verification needs your business's 8-digit account suffix. Set it once in Settings.",
      },
    };
  }


  const cleanSuffix =
    String(accountSuffix)
      .replace(/\D/g, "")
      .slice(-8);


  if (
    cleanSuffix.length !== 8
  ) {

    return {
      httpOk: false,
      status: 400,

      body: {
        success: false,
        error:
          "CBE account suffix must contain at least 8 digits.",
      },
    };
  }


  const url =
    `https://apps.cbe.com.et:100/?id=${reference}${cleanSuffix}`;


  console.log(
    "[cbe] verifying legacy receipt:",
    reference
  );


  try {

    const controller =
      new AbortController();

    const timeout =
      setTimeout(() => {
        controller.abort();
      }, 20000);


    let res;

    try {

      res =
        await fetch(url, {
          agent:
            insecureAgent,

          signal:
            controller.signal,

          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
              "AppleWebKit/537.36 " +
              "Chrome/149.0.0.0 Safari/537.36",

            Accept:
              "application/pdf",
          },
        });

    } finally {
      clearTimeout(timeout);
    }


    if (!res.ok) {

      return {
        httpOk: false,
        status: res.status,

        body: {
          success: false,
          error:
            `CBE returned HTTP ${res.status}. Check the reference and account suffix.`,
        },
      };
    }


    const buffer =
      await res.buffer();


    const header =
      buffer
        .subarray(0, 5)
        .toString("ascii");


    if (
      !header.includes("%PDF")
    ) {

      return {
        httpOk: false,
        status: 422,

        body: {
          success: false,
          error:
            "CBE did not return a valid receipt PDF.",
        },
      };
    }


    const parsed =
      await pdfParse(
        buffer
      );


    const rawText =
      parsed.text
        .replace(/\s+/g, " ")
        .trim();


    // ========================================================
    // PAYER
    // ========================================================

    const payerName =
      rawText
        .match(
          /Payer\s*:?\s*(.*?)\s+Account/i
        )?.[1]
        ?.trim();


    // ========================================================
    // RECEIVER
    // ========================================================

    const receiverName =
      rawText
        .match(
          /Receiver\s*:?\s*(.*?)\s+Account/i
        )?.[1]
        ?.trim();


    // ========================================================
    // AMOUNT
    // ========================================================

    const amountText =
      rawText
        .match(
          /Transferred Amount\s*:?\s*([\d,]+\.\d{2})\s*ETB/i
        )?.[1];


    // ========================================================
    // REFERENCE
    // ========================================================

    const referenceMatch =
      rawText
        .match(
          /Reference No\.?\s*\(VAT Invoice No\)\s*:?\s*([A-Z0-9]+)/i
        )?.[1]
        ?.trim();


    // ========================================================
    // DATE
    // ========================================================

    const dateRaw =
      rawText
        .match(
          /Payment Date & Time\s*:?\s*([\d\/,: ]+[APM]{2})/i
        )?.[1]
        ?.trim();


    // ========================================================
    // VALIDATION
    // ========================================================

    if (
      !payerName ||
      !amountText ||
      !referenceMatch
    ) {

      return {
        httpOk: false,
        status: 422,

        body: {
          success: false,
          error:
            "Could not read the CBE receipt PDF.",
        },
      };
    }


    const body = {
      success: true,

      reference:
        referenceMatch,

      amount:
        Number(
          amountText.replace(
            /,/g,
            ""
          )
        ),

      currency:
        "ETB",

      payer_name:
        titleCase(
          payerName
        ),

      receiver_name:
        receiverName
          ? titleCase(
              receiverName
            )
          : null,

      transaction_date:
        dateRaw || null,
    };


    return {
      httpOk: true,
      status: 200,
      body,
    };

  } catch (err) {

    return {
      httpOk: false,
      status: 502,

      body: {
        success: false,
        error:
          `Could not reach CBE legacy receipt service: ${err.message}`,
      },
    };
  }
}


// ============================================================
// MAIN CBE VERIFICATION
// ============================================================

async function verifyCBE(
  reference,
  accountSuffix
) {

  if (
    !reference ||
    typeof reference !== "string"
  ) {

    return {
      httpOk: false,
      status: 400,

      body: {
        success: false,
        error:
          "A CBE receipt link or transaction reference is required.",
      },
    };
  }


  const input =
    reference.trim();


  if (!input) {

    return {
      httpOk: false,
      status: 400,

      body: {
        success: false,
        error:
          "A CBE receipt link or transaction reference is required.",
      },
    };
  }


  // ==========================================================
  // NEW RECEIPT
  // ==========================================================

  const token =
    extractNewToken(
      input
    );


  if (token) {

    console.log(
      "[cbe] detected NEW receipt:",
      token
    );

    return verifyCBENew(
      token
    );
  }


  // ==========================================================
  // LEGACY FT
  // ==========================================================

  const ref =
    input
      .replace(
        /\s+/g,
        ""
      )
      .toUpperCase();


  if (
    LEGACY_CBE_REFERENCE_REGEX.test(
      ref
    )
  ) {

    console.log(
      "[cbe] detected LEGACY receipt:",
      ref
    );

    return verifyCBELegacy(
      ref,
      accountSuffix
    );
  }


  // ==========================================================
  // UNKNOWN
  // ==========================================================

  return {
    httpOk: false,
    status: 400,

    body: {
      success: false,
      error:
        "CBE reference must be either a mbreciept.cbe.com.et receipt link/token or a legacy FT reference.",
    },
  };
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  verifyCBE,
  extractNewToken,
};