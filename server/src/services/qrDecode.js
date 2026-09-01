// Decodes a QR code from an uploaded receipt image, if present.
//
// CBE's newer receipt template embeds a QR code that encodes the direct
// mbreciept.cbe.com.et/<token> URL — the same token used by the "new"
// verification mechanism in providers/cbe.js. Scanning it directly is more
// reliable than depending on OCR to transcribe a long token string
// correctly, and it needs no account suffix at all.

const Jimp = require("jimp");
const jsQR = require("jsqr");

async function decodeQrFromImage(buffer) {
  try {
    const image = await Jimp.read(buffer);
    const { data, width, height } = image.bitmap;
    const code = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width, height);
    return code ? code.data.trim() : null;
  } catch (err) {
    // Not a decodable image, or no QR present — not an error condition,
    // just means we fall back to whatever OCR extracted.
    return null;
  }
}

module.exports = { decodeQrFromImage };
