// Extracts transaction data from a receipt / USSD screenshot using
// Google Gemini Vision.
//
// Works with:
// - CBE
// - Telebirr
// - Awash
// - Dashen
// - Bank of Abyssinia
// - Coopbank
// - M-Pesa
//
// IMPORTANT FOR DASHEN:
// Dashen receipts can contain BOTH:
//
//   Transaction Reference: 641OBTS2518100WH
//   Transfer Reference:    OBTS35546016067047784078
//
// The Transaction Reference is the primary receipt identifier.
// The Transfer Reference must NOT be used as the Dashen receipt URL.
//
// This file therefore extracts both fields and performs a deterministic
// post-processing correction if Gemini accidentally puts the Dashen
// Transfer Reference into transactionRef.

const fetch = require("node-fetch");

const GEMINI_MODEL = "gemini-2.5-flash";

const GEMINI_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

const EXTRACTION_PROMPT = `You are analyzing a photo that a cashier uploaded, hoping it is an Ethiopian mobile-banking
or USSD payment confirmation (CBE, Telebirr, Awash, Dashen, Bank of Abyssinia, Coopbank, M-Pesa).

Your job is to classify the image, then extract payment details as aggressively as possible.

GENERAL RULES:
- Be helpful, not overly cautious.
- If you can read most digits of a reference/transaction ID, return it.
- Only set transactionRef to null when no transaction/reference identifier is visible at all.
- If text is slightly blurry but still readable, extract it and set confidence to "medium" or "low".
- Reserve imageQuality "very_blurry" for images where key text is genuinely unreadable.
- Set isTransactionImage to false only when the photo clearly is NOT a payment receipt or USSD screen.
- Look for reference labels such as:
  Transaction ID, Transaction Reference, Reference No, Ref, Receipt No,
  FT Reference, Transfer Reference, Transaction Number, Txn ID,
  or similar Amharic/English USSD text.

VERY IMPORTANT — DASHEN BANK:
Dashen receipts can contain TWO DIFFERENT reference numbers.

Example:

Transaction Reference: 641OBTS2518100WH
Transfer Reference: OBTS35546016067047784078

For Dashen:

1. transactionRef MUST be the value beside "Transaction Reference".
2. transferRef MUST be the value beside "Transfer Reference".
3. NEVER put the Transfer Reference into transactionRef.
4. NEVER treat "Transfer Reference" as the primary Dashen receipt reference.
5. The Dashen receipt URL is built from Transaction Reference, for example:
   https://receipt.dashensuperapp.com/receipt/641OBTS2518100WH
6. If both references are visible, ALWAYS return both.
7. If only the Transfer Reference is visible, return it in transferRef and leave transactionRef null.
8. If only the Transaction Reference is visible, return it in transactionRef.

For the following Dashen pattern:

Transaction Reference: 641OBTS2518100WH
Transfer Reference: OBTS35546016067047784078

the correct JSON values are:

transactionRef = "641OBTS2518100WH"
transferRef = "OBTS35546016067047784078"

Do NOT reverse them.

OTHER BANKS:
- Use the bank's actual transaction/reference identifier as transactionRef.
- If a separate transfer/reference number exists, put it in transferRef.
- Do not invent values.

Respond with ONLY raw JSON, no markdown fences, no commentary:

{
  "isTransactionImage": boolean,
  "imageQuality": "clear" | "slightly_blurry" | "very_blurry" | "unreadable",
  "issue": null | "not_transaction" | "too_blurry" | "no_reference_visible",
  "userMessage": string,

  "transactionRef": string or null,
  "transferRef": string or null,

  "amount": number or null,
  "senderName": string or null,

  "bankNameGuess": "CBE" | "Telebirr" | "Awash" | "Dashen" | "Abyssinia" | "Coopbank" | "MPesa" | "Other" | null,

  "confidence": "high" | "medium" | "low"
}

userMessage must be a short plain-English sentence for the cashier, e.g.:
- "This does not look like a payment receipt or USSD confirmation."
- "The image is too blurry to read the reference number. Please retake the photo."
- "Could not find a transaction reference in this image."
- "Reference extracted with low confidence — verification will still be attempted."
- "Reference extracted successfully."`;

function normalizeRef(raw) {
  if (!raw || typeof raw !== "string") return null;

  const cleaned = raw
    .trim()
    .replace(
      /^(ref(erence)?|txn|transaction|receipt|ft)[:\s#-]*/i,
      ""
    )
    .replace(/[\s\-_.]/g, "")
    .toUpperCase();

  // Ethiopian refs are usually alphanumeric.
  if (!/^[A-Z0-9]{6,32}$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Dashen-specific reference recognition.
 *
 * Dashen Super App receipts commonly have:
 *
 * Transaction Reference:
 *   641OBTS2518100WH
 *
 * Transfer Reference:
 *   OBTS35546016067047784078
 *
 * The transfer reference normally begins with OBTS followed by digits.
 */
function isDashenTransferReference(ref) {
  if (!ref) return false;

  return /^OBTS\d+$/i.test(String(ref).trim());
}

/**
 * Dashen transaction references commonly have a numeric prefix
 * followed by OBTS.
 *
 * Example:
 * 641OBTS2518100WH
 */
function isDashenTransactionReference(ref) {
  if (!ref) return false;

  return /^\d+OBTS[A-Z0-9]+$/i.test(String(ref).trim());
}

/**
 * Repair Gemini's output if it accidentally swaps Dashen's
 * Transaction Reference and Transfer Reference.
 *
 * This is deterministic and does not rely on another AI call.
 */
function repairDashenReferences(parsed) {
  const transactionRef = normalizeRef(parsed.transactionRef);
  const transferRef = normalizeRef(parsed.transferRef);

  if (parsed.bankNameGuess !== "Dashen") {
    return {
      transactionRef,
      transferRef,
    };
  }

  // Correct situation:
  //
  // transactionRef = 641OBTS2518100WH
  // transferRef    = OBTS35546016067047784078
  if (
    isDashenTransactionReference(transactionRef) &&
    isDashenTransferReference(transferRef)
  ) {
    return {
      transactionRef,
      transferRef,
    };
  }

  // Gemini accidentally swapped them:
  //
  // transactionRef = OBTS35546016067047784078
  // transferRef    = 641OBTS2518100WH
  //
  // Fix the swap.
  if (
    isDashenTransferReference(transactionRef) &&
    isDashenTransactionReference(transferRef)
  ) {
    console.log(
      "[ocr] Dashen references appeared swapped; correcting them"
    );

    return {
      transactionRef: transferRef,
      transferRef: transactionRef,
    };
  }

  // Gemini put the Transfer Reference in transactionRef
  // and did not return transferRef.
  //
  // We cannot magically recover the Transaction Reference,
  // so don't pretend the transfer reference is the receipt
  // identifier.
  if (
    isDashenTransferReference(transactionRef) &&
    !transferRef
  ) {
    console.log(
      "[ocr] Dashen OCR returned only a Transfer Reference; transactionRef cleared"
    );

    return {
      transactionRef: null,
      transferRef: transactionRef,
    };
  }

  return {
    transactionRef,
    transferRef,
  };
}

function buildFallbackMessage(parsed) {
  if (parsed.userMessage) {
    return parsed.userMessage;
  }

  if (
    parsed.isTransactionImage === false ||
    parsed.issue === "not_transaction"
  ) {
    return "This does not look like a payment receipt or USSD confirmation.";
  }

  if (
    parsed.imageQuality === "very_blurry" ||
    parsed.imageQuality === "unreadable" ||
    parsed.issue === "too_blurry"
  ) {
    return "The image is too blurry to read the reference number. Please retake the photo.";
  }

  if (!parsed.transactionRef) {
    return "Could not find a transaction reference in this image.";
  }

  if (parsed.confidence === "low") {
    return "Reference extracted with low confidence — verification will still be attempted.";
  }

  return "Reference extracted successfully.";
}

function classifyExtraction(parsed) {
  const message = buildFallbackMessage(parsed);

  const repaired = repairDashenReferences(parsed);

  const ref = repaired.transactionRef;

  if (
    parsed.isTransactionImage === false ||
    parsed.issue === "not_transaction"
  ) {
    return {
      ok: false,
      reason: "NOT_TRANSACTION",
      message,
      parsed: {
        ...parsed,
        transactionRef: ref,
        transferRef: repaired.transferRef,
      },
    };
  }

  const tooBlurry =
    (
      parsed.imageQuality === "very_blurry" ||
      parsed.imageQuality === "unreadable" ||
      parsed.issue === "too_blurry"
    ) &&
    !ref;

  if (tooBlurry) {
    return {
      ok: false,
      reason: "TOO_BLURRY",
      message,
      parsed: {
        ...parsed,
        transactionRef: ref,
        transferRef: repaired.transferRef,
      },
    };
  }

  if (!ref) {
    return {
      ok: false,
      reason: "NO_REFERENCE",
      message,
      parsed: {
        ...parsed,
        transactionRef: null,
        transferRef: repaired.transferRef,
      },
    };
  }

  return {
    ok: true,
    reason: null,
    message,
    parsed: {
      ...parsed,
      transactionRef: ref,
      transferRef: repaired.transferRef,
    },
  };
}

function geminiHttpError(status, bodyText) {
  let apiMessage = "";

  try {
    const parsed = JSON.parse(bodyText);
    apiMessage = parsed?.error?.message || "";
  } catch {
    apiMessage = bodyText.slice(0, 200);
  }

  if (status === 403) {
    return new Error(
      "Receipt scanning is temporarily unavailable. The OCR service key may be invalid or disabled — contact your administrator."
    );
  }

  if (status === 401 || status === 400) {
    return new Error(
      "Receipt scanning is misconfigured. The OCR service key is invalid — contact your administrator."
    );
  }

  if (status === 429) {
    return new Error(
      "Receipt scanning is busy right now. Please wait a moment and try again."
    );
  }

  if (status >= 500) {
    return new Error(
      "The OCR service is down right now. Please try again in a few minutes."
    );
  }

  const err = new Error(
    "Could not analyze this receipt image. Please try again."
  );

  err.cause = apiMessage || bodyText.slice(0, 200);

  return err;
}

async function extractReceiptData(imageBuffer, mimeType) {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set in the environment"
    );
  }

  const response = await fetch(GEMINI_URL(key), {
    method: "POST",

    headers: {
      "content-type": "application/json",
    },

    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: EXTRACTION_PROMPT,
            },
            {
              inline_data: {
                mime_type: mimeType || "image/jpeg",
                data: imageBuffer.toString("base64"),
              },
            },
          ],
        },
      ],

      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");

    throw geminiHttpError(
      response.status,
      text
    );
  }

  const data = await response.json();

  const candidate = data?.candidates?.[0];

  const finishReason = candidate?.finishReason;

  if (
    finishReason &&
    finishReason !== "STOP"
  ) {
    throw new Error(
      `Gemini could not analyze this image (${finishReason}). Try a different photo.`
    );
  }

  const text =
    candidate?.content?.parts?.[0]?.text;

  if (!text) {
    const blockReason =
      data?.promptFeedback?.blockReason;

    if (blockReason) {
      throw new Error(
        `Gemini blocked this image (${blockReason}). Try a clearer receipt photo.`
      );
    }

    throw new Error(
      "Gemini returned no extractable content for this image"
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(
      text
        .replace(/```json|```/g, "")
        .trim()
    );
  } catch {
    throw new Error(
      "Gemini response was not valid JSON"
    );
  }

  // ---------------------------------------------------------
  // Normalize the bank name.
  // ---------------------------------------------------------

  if (
    typeof parsed.bankNameGuess === "string"
  ) {
    const bank = parsed.bankNameGuess
      .trim()
      .toLowerCase();

    const bankMap = {
      cbe: "CBE",
      telebirr: "Telebirr",
      awash: "Awash",
      dashen: "Dashen",
      abyssinia: "Abyssinia",
      coopbank: "Coopbank",
      "coop bank": "Coopbank",
      mpesa: "MPesa",
      "m-pesa": "MPesa",
      other: "Other",
    };

    parsed.bankNameGuess =
      bankMap[bank] ||
      parsed.bankNameGuess;
  }

  const result = classifyExtraction(parsed);

  console.log(
    "[ocr] bank:",
    result.parsed.bankNameGuess
  );

  console.log(
    "[ocr] transaction reference:",
    result.parsed.transactionRef
  );

  console.log(
    "[ocr] transfer reference:",
    result.parsed.transferRef
  );

  return {
    ...result.parsed,

    extractionOk: result.ok,

    failureReason: result.reason,

    userMessage: result.message,
  };
}

module.exports = {
  extractReceiptData,
  normalizeRef,
  isDashenTransferReference,
  isDashenTransactionReference,
};