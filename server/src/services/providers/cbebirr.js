// Verifies a CBE Birr wallet transaction by fetching the official PDF
// receipt directly. No third-party API involved. Needs the payer's phone
// number in addition to the receipt/order number.

const fetch = require("node-fetch");
const pdfParse = require("pdf-parse");

async function verifyCBEBirr(receiptNumber, phoneNumber) {
  if (!phoneNumber) {
    return {
      httpOk: false,
      status: 400,
      body: { success: false, error: "CBE Birr verification needs the payer's phone number." },
    };
  }

  const url = `https://cbepay1.cbe.com.et/aureceipt?TID=${encodeURIComponent(receiptNumber)}&PH=${encodeURIComponent(phoneNumber)}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      timeout: 20000,
    });

    if (!res.ok) {
      return { httpOk: false, status: res.status, body: { success: false, error: `CBE Birr returned HTTP ${res.status}` } };
    }

    const buffer = await res.buffer();
    const parsed = await pdfParse(buffer);
    const text = parsed.text;

    const orderId = text.match(/Order ID\s*([A-Z0-9]+)/i)?.[1];
    const receiptMatch = text.match(/([A-Z0-9]{10})(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})([\d.]+)/);
    const receiverName = text.match(/Receiver Name\s*([\s\S]*?)(?=\s*Order ID)/i)?.[1]?.replace(/\n/g, " ").trim();
    const customerName = text.match(/Sub city:[\s\n]+([A-Z\s]+?)[\s\n]+Wereda\/kebele:/i)?.[1]?.trim();

    if (!orderId && !receiptMatch) {
      return { httpOk: false, status: 422, body: { success: false, error: "Could not read the CBE Birr receipt PDF." } };
    }

    const body = {
      success: true,
      reference: receiptMatch?.[1] || orderId,
      amount: receiptMatch ? Number(receiptMatch[3]) : null,
      payer_name: customerName || null,
      receiver_name: receiverName || null,
      transaction_date: receiptMatch?.[2] || null,
    };
    return { httpOk: true, status: 200, body };
  } catch (err) {
    return { httpOk: false, status: 502, body: { success: false, error: `Could not reach CBE Birr: ${err.message}` } };
  }
}

module.exports = { verifyCBEBirr };
