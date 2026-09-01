const axios = require("axios");
const cheerio = require("cheerio");

const AWASH_BASE_URL =
  "https://awashpay.awashbank.com:8225";

const REQUEST_TIMEOUT = 15000;

/*
 * Maximum number of official receipt URLs we will test.
 *
 * We deliberately keep this bounded so a bad OCR result
 * cannot create an unlimited number of bank requests.
 */
const MAX_REFERENCE_VARIANTS = 64;

/*
 * Awash references commonly have:
 *
 * 10 characters
 * +
 * "-"
 * +
 * 6 characters
 *
 * Example:
 *
 * 2KG7WQVRMK-5JUUCM
 *
 * OCR may remove the internal hyphen:
 *
 * 2KG7WQVRMK5JUUCM
 *
 * Therefore the separator position is known and should
 * be repaired BEFORE generating OCR character variants.
 */
const AWASH_SEPARATOR_POSITION = 10;

/*
 * Common OCR / visual confusions.
 *
 * We do not blindly replace characters.
 * We generate candidates and let the official Awash
 * receipt endpoint confirm which candidate is real.
 */
const CONFUSABLE_GROUPS = [
  ["0", "O", "Q"],
  ["1", "I", "L"],
  ["2", "Z"],
  ["5", "S"],
  ["6", "G"],
  ["8", "B"],
];

/*
 * Build fast lookup table.
 */
const CONFUSABLE_LOOKUP = new Map();

for (const group of CONFUSABLE_GROUPS) {
  for (const char of group) {
    CONFUSABLE_LOOKUP.set(char, group);
  }
}

/**
 * Escape text for RegExp.
 */
function escapeRegex(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

/**
 * Normalize an Awash reference.
 *
 * Supported input:
 *
 * 2KG7WQVRMK-5JUUCM
 *
 * 2KG7WQVRMK5JUUCM
 *
 * -2KG7WQVRMK-5JUUCM
 *
 * https://awashpay.awashbank.com:8225/-2KG7WQVRMK-5JUUCM
 */
function normalizeReference(value) {
  if (value == null) {
    return "";
  }

  let text =
    String(value)
      .trim()
      .toUpperCase();

  /*
   * If a complete Awash URL was supplied,
   * extract its pathname.
   */
  if (
    text.includes(
      "AWASHPAY.AWASHBANK.COM"
    )
  ) {
    try {
      const url =
        new URL(value);

      text =
        url.pathname
          .replace(/^\/+/, "")
          .trim()
          .toUpperCase();
    } catch {
      /*
       * Continue with normal cleanup.
       */
    }
  }

  /*
   * Remove leading "/" and "-" used by the
   * Awash receipt URL.
   *
   * Example:
   *
   * /-2KG7WQVRMK-5JUUCM
   *
   * becomes:
   *
   * 2KG7WQVRMK-5JUUCM
   */
  text =
    text.replace(
      /^[-/]+/,
      ""
    );

  /*
   * Remove whitespace.
   */
  text =
    text.replace(
      /\s+/g,
      ""
    );

  /*
   * Keep only characters that can reasonably
   * belong to the reference.
   */
  text =
    text.replace(
      /[^A-Z0-9-]/g,
      ""
    );

  return text;
}

/**
 * Add candidate without exceeding the limit.
 */
function addVariant(
  variants,
  candidate
) {
  if (!candidate) {
    return;
  }

  if (
    variants.size >=
    MAX_REFERENCE_VARIANTS
  ) {
    return;
  }

  variants.add(candidate);
}

/**
 * Generate OCR-safe Awash reference candidates.
 *
 * IMPORTANT CHANGE:
 *
 * Structural separator candidates are generated FIRST.
 *
 * This means:
 *
 * OCR:
 *   2KG55BYTHJ5HKM2M
 *
 * immediately produces:
 *
 *   2KG55BYTHJ-5HKM2M
 *
 * BEFORE spending the candidate limit on:
 *
 *   5 <-> S
 *   G <-> 6
 *   B <-> 8
 *   etc.
 *
 * This fixes the problem where the correct hyphenated
 * reference was never reached because 64 OCR candidates
 * had already been generated.
 */
function generateReferenceVariants(
  reference
) {
  const normalized =
    normalizeReference(
      reference
    );

  if (!normalized) {
    return [];
  }

  const variants =
    new Set();

  /*
   * --------------------------------------------------
   * 1. ORIGINAL
   * --------------------------------------------------
   */
  addVariant(
    variants,
    normalized
  );

  /*
   * --------------------------------------------------
   * 2. STRUCTURAL SEPARATOR REPAIR
   * --------------------------------------------------
   *
   * If reference has 16 alphanumeric characters:
   *
   * 1234567890123456
   *
   * test:
   *
   * 1234567890-123456
   */
  const alphaNumeric =
    normalized.replace(
      /-/g,
      ""
    );

  if (
    /^[A-Z0-9]{16}$/i.test(
      alphaNumeric
    )
  ) {
    const repaired =
      `${alphaNumeric.slice(
        0,
        AWASH_SEPARATOR_POSITION
      )}-${alphaNumeric.slice(
        AWASH_SEPARATOR_POSITION
      )}`;

    /*
     * This is deliberately added immediately
     * after the original candidate.
     */
    addVariant(
      variants,
      repaired
    );
  }

  /*
   * --------------------------------------------------
   * 3. REMOVE INTERNAL HYPHEN
   * --------------------------------------------------
   *
   * Protect against OCR inserting a hyphen where
   * the official endpoint expects no hyphen.
   */
  if (
    normalized.includes("-")
  ) {
    addVariant(
      variants,
      normalized.replace(
        /-/g,
        ""
      )
    );
  }

  /*
   * --------------------------------------------------
   * 4. OCR CHARACTER VARIANTS
   * --------------------------------------------------
   *
   * Generate character substitutions only AFTER
   * structural variants are guaranteed to exist.
   */
  function walk(
    index,
    current
  ) {
    if (
      variants.size >=
      MAX_REFERENCE_VARIANTS
    ) {
      return;
    }

    if (
      index >=
      normalized.length
    ) {
      addVariant(
        variants,
        current
      );

      return;
    }

    const char =
      normalized[index];

    /*
     * Hyphen is structural.
     *
     * Never treat it as an OCR character.
     */
    if (
      char === "-"
    ) {
      walk(
        index + 1,
        current + "-"
      );

      return;
    }

    /*
     * Always keep original character.
     */
    walk(
      index + 1,
      current + char
    );

    if (
      variants.size >=
      MAX_REFERENCE_VARIANTS
    ) {
      return;
    }

    /*
     * Generate visually-confusable characters.
     */
    const alternatives =
      CONFUSABLE_LOOKUP.get(
        char
      );

    if (!alternatives) {
      return;
    }

    for (
      const alternative of alternatives
    ) {
      if (
        alternative === char
      ) {
        continue;
      }

      if (
        variants.size >=
        MAX_REFERENCE_VARIANTS
      ) {
        return;
      }

      walk(
        index + 1,
        current +
        alternative
      );
    }
  }

  walk(
    0,
    ""
  );

  /*
   * --------------------------------------------------
   * 5. ADD STRUCTURAL VARIANTS FOR OCR-CORRECTED
   *    CANDIDATES
   * --------------------------------------------------
   *
   * Example:
   *
   * 2KG55BYTHJ5HKM2M
   *
   * may generate:
   *
   * 2KGS5BYTHJ5HKM2M
   *
   * If that candidate is exactly 16 characters,
   * also test:
   *
   * 2KGS5BYTHJ-5HKM2M
   *
   * However, the candidate limit remains enforced.
   */
  const snapshot =
    [...variants];

  for (
    const candidate of snapshot
  ) {
    if (
      variants.size >=
      MAX_REFERENCE_VARIANTS
    ) {
      break;
    }

    const withoutHyphen =
      candidate.replace(
        /-/g,
        ""
      );

    if (
      /^[A-Z0-9]{16}$/i.test(
        withoutHyphen
      )
    ) {
      const repaired =
        `${withoutHyphen.slice(
          0,
          AWASH_SEPARATOR_POSITION
        )}-${withoutHyphen.slice(
          AWASH_SEPARATOR_POSITION
        )}`;

      addVariant(
        variants,
        repaired
      );
    }
  }

  /*
   * Return bounded candidate list.
   */
  return [
    ...variants,
  ].slice(
    0,
    MAX_REFERENCE_VARIANTS
  );
}

/**
 * Extract a field from flattened Awash receipt text.
 */
function extractField(
  bodyText,
  label,
  allLabels
) {
  const escapedLabels =
    allLabels.map(
      escapeRegex
    );

  const regex =
    new RegExp(
      `${escapeRegex(
        label
      )}\\s*:\\s*(.*?)` +
      `(?=\\s+(?:${escapedLabels.join(
        "|"
      )})\\s*:|$)`,
      "i"
    );

  const match =
    bodyText.match(
      regex
    );

  if (!match) {
    return null;
  }

  const value =
    match[1]
      ?.replace(
        /\s+/g,
        " "
      )
      .trim();

  return (
    value || null
  );
}

/**
 * Parse official Awash receipt.
 */
function parseAwashReceipt(
  html
) {
  if (!html) {
    return null;
  }

  const $ =
    cheerio.load(
      html
    );

  const bodyText =
    $("body")
      .text()
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  if (!bodyText) {
    return null;
  }

  const labels = [
    "Company Name",
    "Share company TIN No",
    "VAT Reg No",
    "VAT Reg Date",
    "PO Box",
    "Tel",
    "Customer Name",
    "Account No",
    "City",
    "TIN (TAX ID)",
    "Branch",
    "Transaction Time",
    "Transaction Type",
    "Amount",
    "Charge",
    "VAT",
    "EDRRF",
    "Sender Name",
    "Sender Account",
    "Beneficiary name",
    "Beneficiary Account",
    "Beneficiary Bank",
    "Reason",
    "Transaction ID",
  ];

  const amountText =
    extractField(
      bodyText,
      "Amount",
      labels
    );

  const transactionTime =
    extractField(
      bodyText,
      "Transaction Time",
      labels
    );

  const transactionType =
    extractField(
      bodyText,
      "Transaction Type",
      labels
    );

  const senderName =
    extractField(
      bodyText,
      "Sender Name",
      labels
    );

  const senderAccount =
    extractField(
      bodyText,
      "Sender Account",
      labels
    );

  const receiverName =
    extractField(
      bodyText,
      "Beneficiary name",
      labels
    );

  const receiverAccount =
    extractField(
      bodyText,
      "Beneficiary Account",
      labels
    );

  const receiverBank =
    extractField(
      bodyText,
      "Beneficiary Bank",
      labels
    );

  const reason =
    extractField(
      bodyText,
      "Reason",
      labels
    );

  const transactionId =
    extractField(
      bodyText,
      "Transaction ID",
      labels
    );

  const customerName =
    extractField(
      bodyText,
      "Customer Name",
      labels
    );

  const branch =
    extractField(
      bodyText,
      "Branch",
      labels
    );

  /*
   * Parse amount.
   */
  let amount = null;

  if (amountText) {
    const amountMatch =
      amountText.match(
        /[\d,]+(?:\.\d+)?/
      );

    if (amountMatch) {
      const parsed =
        Number(
          amountMatch[0].replace(
            /,/g,
            ""
          )
        );

      if (
        Number.isFinite(
          parsed
        )
      ) {
        amount =
          parsed;
      }
    }
  }

  /*
   * A page is considered a valid receipt only
   * if meaningful transaction information exists.
   */
  const hasReceiptData =
    Boolean(
      amount !== null ||
      transactionTime ||
      transactionId ||
      senderName ||
      receiverName
    );

  if (!hasReceiptData) {
    return null;
  }

  return {
    amount,

    transactionTime,

    transactionType,

    senderName,

    senderAccount,

    receiverName,

    receiverAccount,

    receiverBank,

    reason,

    transactionId,

    customerName,

    branch,
  };
}

/**
 * Fetch one official Awash receipt.
 */
async function fetchAwashReceipt(
  receiptUrl
) {
  console.log(
    `[awash] checking official receipt: ${receiptUrl}`
  );

  try {
    const response =
      await axios.get(
        receiptUrl,
        {
          timeout:
            REQUEST_TIMEOUT,

          maxRedirects:
            5,

          /*
           * We want to inspect 403/404 ourselves.
           */
          validateStatus:
            () => true,

          headers: {
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149 Safari/537.36",

            "Accept-Language":
              "en-US,en;q=0.9",

            Connection:
              "keep-alive",
          },
        }
      );

    /*
     * HTTP failure.
     */
    if (
      response.status < 200 ||
      response.status >= 300
    ) {
      console.warn(
        `[awash] receipt unavailable: ${receiptUrl} (${response.status})`
      );

      return null;
    }

    const html =
      String(
        response.data || ""
      );

    if (!html) {
      console.warn(
        `[awash] empty receipt response: ${receiptUrl}`
      );

      return null;
    }

    const parsed =
      parseAwashReceipt(
        html
      );

    if (!parsed) {
      console.warn(
        `[awash] page loaded but no valid receipt data: ${receiptUrl}`
      );

      return null;
    }

    console.log(
      `[awash] official receipt confirmed: ${receiptUrl}`
    );

    return {
      receiptUrl,

      data:
        parsed,
    };
  } catch (err) {
    console.warn(
      `[awash] request failed: ${receiptUrl} - ${err.message}`
    );

    return null;
  }
}

/**
 * Build Awash receipt URLs.
 *
 * Awash may expose:
 *
 * /-REFERENCE
 *
 * or:
 *
 * /REFERENCE
 */
function buildAwashReceiptUrls(
  candidate
) {
  const encoded =
    encodeURIComponent(
      candidate
    );

  return [
    `${AWASH_BASE_URL}/-${encoded}`,

    `${AWASH_BASE_URL}/${encoded}`,
  ];
}

/**
 * Verify Awash transaction.
 *
 * The official receipt endpoint is the authority.
 *
 * We NEVER mark a transaction verified merely
 * because OCR produced a plausible reference.
 */
async function verifyAwash(
  reference
) {
  try {
    if (!reference) {
      return {
        httpOk:
          false,

        status:
          400,

        body: {
          success:
            false,

          error:
            "Awash transaction reference is required.",
        },
      };
    }

    const normalized =
      normalizeReference(
        reference
      );

    if (!normalized) {
      return {
        httpOk:
          false,

        status:
          400,

        body: {
          success:
            false,

          error:
            "Invalid Awash transaction reference.",
        },
      };
    }

    /*
     * Generate candidates.
     */
    const referenceCandidates =
      generateReferenceVariants(
        normalized
      );

    if (
      referenceCandidates.length === 0
    ) {
      return {
        httpOk:
          false,

        status:
          400,

        body: {
          success:
            false,

          error:
            "Unable to generate a valid Awash reference candidate.",
        },
      };
    }

    console.log(
      `[awash] OCR reference: ${normalized}`
    );

    console.log(
      `[awash] testing ${referenceCandidates.length} candidate reference(s)`
    );

    /*
     * Print candidates in debug mode.
     *
     * This makes it immediately obvious that:
     *
     * 2KG55BYTHJ-5HKM2M
     *
     * is being tested.
     */
    console.log(
      "[awash] candidates:",
      referenceCandidates
    );

    /*
     * Test each reference.
     */
    for (
      let index = 0;
      index <
      referenceCandidates.length;
      index++
    ) {
      const candidate =
        referenceCandidates[
        index
        ];

      if (
        index === 0
      ) {
        console.log(
          `[awash] trying original reference: ${candidate}`
        );
      } else {
        console.log(
          `[awash] trying candidate ${index + 1}/${referenceCandidates.length}: ${candidate}`
        );
      }

      const urls =
        buildAwashReceiptUrls(
          candidate
        );

      /*
       * Try:
       *
       * /-REFERENCE
       *
       * then:
       *
       * /REFERENCE
       */
      for (
        const receiptUrl of urls
      ) {
        const result =
          await fetchAwashReceipt(
            receiptUrl
          );

        /*
         * No official receipt.
         */
        if (
          !result ||
          !result.data
        ) {
          continue;
        }

        const data =
          result.data;

        /*
         * Official Awash receipt confirmed.
         */
        console.log(
          "[awash] TRANSACTION CONFIRMED"
        );

        console.log(
          `[awash] OCR reference: ${normalized}`
        );

        console.log(
          `[awash] matched reference: ${candidate}`
        );

        console.log(
          `[awash] receipt URL: ${result.receiptUrl}`
        );

        /*
         * Return normalized provider response.
         */
        return {
          httpOk:
            true,

          status:
            200,

          body: {
            success:
              true,

            /*
             * Reference that actually worked.
             */
            reference:
              candidate,

            /*
             * Original OCR reference.
             */
            ocr_reference:
              normalized,

            /*
             * True if OCR correction was required.
             */
            ocr_corrected:
              candidate !==
              normalized,

            /*
             * Exact official Awash URL.
             */
            receiptUrl:
              result.receiptUrl,

            /*
             * Official transaction ID.
             */
            transactionId:
              data.transactionId,

            /*
             * Payment amount.
             */
            amount:
              data.amount,

            /*
             * Payment time.
             */
            transactionDate:
              data.transactionTime,

            transactionTime:
              data.transactionTime,

            paidAt:
              data.transactionTime,

            /*
             * Sender data.
             *
             * These remain available internally for
             * your verification/matching layer.
             *
             * They do NOT need to be shown to the waiter.
             */
            senderName:
              data.senderName,

            senderAccount:
              data.senderAccount,

            /*
             * Receiver data.
             *
             * These are also kept internally for
             * account/name verification.
             */
            receiverName:
              data.receiverName,

            receiverAccount:
              data.receiverAccount,

            receiverBank:
              data.receiverBank,

            /*
             * Additional internal transaction data.
             */
            transactionType:
              data.transactionType,

            reason:
              data.reason,

            customerName:
              data.customerName,

            branch:
              data.branch,
          },
        };
      }
    }

    /*
     * Nothing returned a real official receipt.
     */
    console.log(
      `[awash] no official receipt matched the OCR reference or generated candidates`
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
          "Awash could not confirm this transaction using the official receipt service.",

        ocr_reference:
          normalized,
      },
    };
  } catch (err) {
    console.error(
      "[awash] verification failed:",
      err.message
    );

    if (err.stack) {
      console.error(
        err.stack
      );
    }

    return {
      httpOk:
        false,

      status:
        502,

      body: {
        success:
          false,

        error:
          "Unable to connect to the Awash receipt service.",

        detail:
          err.message,
      },
    };
  }
}

module.exports = {
  verifyAwash,
};