const { extractReceiptData } = require("./ocr");
const { decodeQrFromImage } = require("./qrDecode");
const { verifyReceipt } = require("./veritas");

function normalizeAccount(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(expectedValue, receivedValue) {
  const expected = normalizeName(expectedValue);
  const received = normalizeName(receivedValue);
  if (!expected || !received) return false;
  if (expected === received) return true;

  const expectedParts = expected.split(" ");
  const receivedParts = received.split(" ");
  if (expectedParts.length < 2 || receivedParts.length < 2) return false;

  return (
    expectedParts[0] === receivedParts[0] &&
    expectedParts.at(-1) === receivedParts.at(-1)
  );
}

function accountsMatch(expectedValue, receivedValue) {
  const expected = normalizeAccount(expectedValue);
  const received = normalizeAccount(receivedValue);
  return Boolean(expected && received && expected === received);
}

function accountSuffix(provider, accountNumber) {
  const digits = normalizeAccount(accountNumber);
  if (provider === "CBE") return digits.slice(-8);
  if (provider === "Abyssinia") return digits.slice(-5);
  return undefined;
}

function firstPresent(values) {
  return values.find(
    (value) => value !== undefined && value !== null && String(value).trim() !== ""
  );
}

function numberFrom(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function providerDetails(body) {
  const data = body?.data || body?.result || {};

  return {
    amount: numberFrom(
      firstPresent([
        body?.amount,
        body?.totalAmount,
        body?.transactionAmount,
        data.amount,
        data.totalAmount,
        data.transactionAmount,
      ])
    ),
    receiverName:
      firstPresent([
        body?.receiver_name,
        body?.receiverName,
        body?.receiver,
        body?.recipientName,
        body?.recipient_name,
        data.receiver_name,
        data.receiverName,
        data.receiver,
        data.recipientName,
        data.recipient_name,
      ]) || null,
    receiverAccount:
      firstPresent([
        body?.accountNumber,
        body?.account_number,
        body?.receiverAccountNumber,
        body?.receiver_account_number,
        body?.destinationAccount,
        body?.destination_account,
        body?.creditAccount,
        body?.credit_account,
        body?.toAccount,
        body?.to_account,
        body?.recipientAccount,
        body?.recipient_account,
        data.accountNumber,
        data.account_number,
        data.receiverAccountNumber,
        data.receiver_account_number,
        data.destinationAccount,
        data.destination_account,
        data.creditAccount,
        data.credit_account,
        data.toAccount,
        data.to_account,
        data.recipientAccount,
        data.recipient_account,
      ]) || null,
  };
}

function pendingReason(checks) {
  if (!checks.referencePresent) return "The transaction reference could not be read.";
  if (!checks.bankMatchesReceipt) return "The receipt provider does not match the selected account.";
  if (!checks.providerConfirmed) return "The provider could not conclusively confirm the transaction.";
  if (!checks.amountAvailable) return "The confirmed transaction amount was not available.";
  if (!checks.amountMatches) return "The confirmed amount does not match the purchase total.";
  if (!checks.receiverAvailable) return "The confirmed receiver details were not available.";
  if (!checks.receiverMatches) return "The confirmed receiver does not match the selected platform account.";
  return "Automatic verification was inconclusive.";
}

async function verifyDirectPayment({ file, account, expectedAmount }) {
  let extracted = null;
  let extractionError = "";
  let qrReference = null;

  if (account.provider === "CBE" && file.mimetype.startsWith("image/")) {
    try {
      const decoded = await decodeQrFromImage(file.buffer);
      qrReference = String(
        typeof decoded === "string"
          ? decoded
          : decoded?.url || decoded?.text || decoded?.data || decoded?.rawValue || ""
      ).trim();
    } catch (error) {
      extractionError = error.message;
    }
  }

  try {
    extracted = await extractReceiptData(file.buffer, file.mimetype);
  } catch (error) {
    extractionError = error.message;
  }

  const reference = String(qrReference || extracted?.transactionRef || "").trim();
  const guessedProvider = extracted?.bankNameGuess || null;
  const bankMatchesReceipt = !guessedProvider || guessedProvider === account.provider;

  let verificationResult = null;
  if (reference && bankMatchesReceipt) {
    verificationResult = await verifyReceipt({
      bankName: account.provider,
      reference,
      qrReference: account.provider === "CBE" ? qrReference : null,
      accountSuffix: accountSuffix(account.provider, account.accountNumber),
      paymentAccounts: [
        {
          accountNumber: account.accountNumber,
          accountHolderName: account.accountHolderName,
          accountSuffix: accountSuffix(account.provider, account.accountNumber),
        },
      ],
    });
  }

  const confirmed = Boolean(
    verificationResult?.httpOk &&
      verificationResult?.body?.success !== false &&
      verificationResult?.classification?.status === "VALID"
  );
  const details = confirmed ? providerDetails(verificationResult.body) : providerDetails(null);
  const expected = Number(expectedAmount);
  const amountAvailable = Number.isFinite(details.amount);
  const amountMatches =
    amountAvailable && Number.isFinite(expected)
      ? Math.abs(details.amount - expected) <= 0.01
      : false;
  const receiverAvailable = Boolean(details.receiverAccount || details.receiverName);
  const accountNumberMatch = accountsMatch(account.accountNumber, details.receiverAccount);
  const accountHolderMatch = namesMatch(account.accountHolderName, details.receiverName);
  const receiverMatches = accountNumberMatch || accountHolderMatch;

  const checks = {
    referencePresent: Boolean(reference),
    bankMatchesReceipt,
    providerConfirmed: confirmed,
    providerStatus: verificationResult?.classification?.status || "NOT_ATTEMPTED",
    providerReason:
      verificationResult?.classification?.reason ||
      verificationResult?.body?.error ||
      extractionError ||
      "",
    amountAvailable,
    amountMatches,
    expectedAmount: expected,
    confirmedAmount: details.amount,
    receiverAvailable,
    receiverMatches,
    accountNumberMatch,
    accountHolderMatch,
    extractionConfidence: extracted?.confidence || null,
    extractionIssue: extracted?.failureReason || extractionError || null,
  };

  const automaticApproved = Boolean(
    checks.referencePresent &&
      checks.bankMatchesReceipt &&
      checks.providerConfirmed &&
      checks.amountMatches &&
      checks.receiverMatches
  );

  return {
    automaticApproved,
    pendingReason: automaticApproved ? "" : pendingReason(checks),
    reference: reference || null,
    extractedAmount: extracted?.amount ?? null,
    senderName: extracted?.senderName || null,
    receiverName: details.receiverName,
    receiverAccount: details.receiverAccount,
    checks,
  };
}

module.exports = {
  verifyDirectPayment,
};
