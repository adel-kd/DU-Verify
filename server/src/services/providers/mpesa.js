// Verifies an M-Pesa (Safaricom Ethiopia) transaction directly via their
// public receipt endpoint. No third-party API involved.
//
// IMPORTANT: Safaricom's receipt endpoint only accepts requests from
// Ethiopia/Kenya IP ranges. If this server is hosted outside that region,
// this call will typically fail with a timeout or connection error — that's
// a hosting/network limitation, not a bug in this code. See README for
// self-hosting notes if you hit this consistently.

const fetch = require("node-fetch");
const pdfParse = require("pdf-parse");

function titleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

async function verifyMpesa(transactionId) {
  const url = `https://m-pesabusiness.safaricom.et/api/receipt/getReceipt?trxNo=${encodeURIComponent(transactionId)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "application/json, text/plain, */*",
        Referer: "https://m-pesabusiness.safaricom.et/",
      },
      timeout: 30000,
    });

    if (!res.ok) {
      return { httpOk: false, status: res.status, body: { success: false, error: `M-Pesa returned HTTP ${res.status}. This endpoint often requires an Ethiopia/Kenya-based server.` } };
    }

    const data = await res.json();
    if (data.responseCode !== "0" || !data.base64Data) {
      return { httpOk: false, status: 422, body: { success: false, error: data.responseDescription || "M-Pesa could not confirm this transaction." } };
    }

    const buffer = Buffer.from(data.base64Data, "base64");
    const parsed = await pdfParse(buffer);
    const rawText = parsed.text.replace(/\s+/g, " ").trim();

    const payerName = rawText.match(/PAYER NAME\s+(.*?)\s+(?:PAYER PHONE|00\d+|\+251|የከፋይ ስም)/i)?.[1]?.trim();
    const receiptNo = rawText.match(/RECEIPT NO.*?([A-Z0-9]{10,})(?:202\d)/i)?.[1]?.trim();
    const amountMatch = rawText.match(/TOTAL\s+([\d,]+\.\d{2})/i)?.[1];
    const dateMatch = rawText.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/)?.[1];
    const receiverName = rawText.match(/RECEIVER NAME.*?(?:የተቀባዩ ቢዝነስ ስም)?\s+([A-Za-z\s]+?)\s+\//i)?.[1]?.trim();

    const body = {
      success: true,
      reference: receiptNo || transactionId,
      amount: amountMatch ? Number(amountMatch.replace(/,/g, "")) : null,
      payer_name: payerName ? titleCase(payerName.replace(/\d+.*/, "").trim()) : null,
      receiver_name: receiverName ? titleCase(receiverName) : null,
      transaction_date: dateMatch || null,
    };
    return { httpOk: true, status: 200, body };
  } catch (err) {
    return {
      httpOk: false,
      status: 502,
      body: { success: false, error: `Could not reach M-Pesa: ${err.message} (often caused by hosting outside Ethiopia/Kenya).` },
    };
  }
}

module.exports = { verifyMpesa };
