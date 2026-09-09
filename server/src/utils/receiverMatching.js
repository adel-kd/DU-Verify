function normalizeHolderName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAccountDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeComparableAccountDigits(value) {
  return String(value || "")
    .replace(/[Oo]/g, "0")
    .replace(/[Ss]/g, "5")
    .replace(/[IiLl]/g, "1")
    .replace(/[Bb]/g, "8")
    .replace(/\D/g, "");
}

function accountNumbersMatch(expectedValue, receivedValue) {
  const expected = normalizeComparableAccountDigits(expectedValue);
  const received = normalizeComparableAccountDigits(receivedValue);
  if (!expected || !received) return false;
  if (expected === received) return true;

  const hasMask = (value) => /[*xX\u2022\u25cf]/u.test(String(value || ""));
  const maskedOrLastFourOnly =
    hasMask(expectedValue) ||
    hasMask(receivedValue) ||
    (expected.length !== received.length &&
      (expected.length === 4 || received.length === 4));

  // Providers often expose values such as 1****9571. Only use suffix
  // matching when masking is explicit or one side contains exactly four digits.
  return Boolean(
    maskedOrLastFourOnly &&
      expected.length >= 4 &&
      received.length >= 4 &&
      expected.slice(-4) === received.slice(-4)
  );
}

function collapseOcrCharacters(value) {
  return String(value || "")
    .replace(/[0o]/g, "0")
    .replace(/[1il|]/g, "1")
    .replace(/[5s]/g, "5")
    .replace(/[8b]/g, "8");
}

function editDistance(left, right) {
  if (left === right) return 0;
  if (!left.length || !right.length) return Math.max(left.length, right.length);

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function nameTokensMatch(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;

  const collapsedLeft = collapseOcrCharacters(left);
  const collapsedRight = collapseOcrCharacters(right);
  if (collapsedLeft === collapsedRight) return true;

  // Short names are too easy to confuse, so fuzzy edits apply only to
  // tokens of four or more characters.
  if (Math.min(collapsedLeft.length, collapsedRight.length) < 4) return false;

  const tolerance = Math.max(
    1,
    Math.floor(Math.max(collapsedLeft.length, collapsedRight.length) / 4)
  );
  return editDistance(collapsedLeft, collapsedRight) <= tolerance;
}

function holderNamesMatch(expectedValue, receivedValue) {
  const expected = normalizeHolderName(expectedValue);
  const received = normalizeHolderName(receivedValue);
  if (!expected || !received) return { matched: false, similarity: 0 };
  if (expected === received) return { matched: true, similarity: 1 };

  const expectedParts = expected.split(" ");
  const receivedParts = received.split(" ");
  if (expectedParts.length < 2 || receivedParts.length < 2) {
    return { matched: false, similarity: 0 };
  }

  const firstMatches = nameTokensMatch(expectedParts[0], receivedParts[0]);
  const lastMatches = nameTokensMatch(expectedParts.at(-1), receivedParts.at(-1));
  if (!firstMatches || !lastMatches) return { matched: false, similarity: 0 };

  const matchedTokens = expectedParts.filter((token) =>
    receivedParts.some((other) => nameTokensMatch(token, other))
  ).length;
  const similarity = matchedTokens / Math.max(expectedParts.length, receivedParts.length);

  return { matched: true, similarity };
}

function matchReceiverExpectations({
  expectedAccount,
  expectedHolder,
  receivedAccount,
  receivedHolder,
}) {
  const hasAccount = Boolean(normalizeAccountDigits(expectedAccount));
  const hasHolder = Boolean(normalizeHolderName(expectedHolder));
  const accountMatched = hasAccount
    ? accountNumbersMatch(expectedAccount, receivedAccount)
    : null;
  const holderMatched = hasHolder
    ? holderNamesMatch(expectedHolder, receivedHolder).matched
    : null;

  return {
    accountMatched,
    holderMatched,
    receiverMatched: hasAccount || hasHolder
      ? accountMatched === true || holderMatched === true
      : null,
  };
}

module.exports = {
  accountNumbersMatch,
  holderNamesMatch,
  matchReceiverExpectations,
  normalizeAccountDigits,
  normalizeHolderName,
};
