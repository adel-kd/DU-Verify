const assert = require('node:assert/strict');
const {
  accountNumbersMatch,
  holderNamesMatch,
  matchReceiverExpectations,
} = require('../src/utils/receiverMatching');

assert.equal(
  holderNamesMatch('ADEL KEDIR MOHAMMED ABDU ABRAR', 'Adel Abrar').matched,
  true,
  'first and last names should match a longer full name'
);
assert.equal(
  holderNamesMatch('ADEL KEDIR ABRAR', 'Adil Abrar').matched,
  true,
  'safe OCR and spelling variation should match'
);
assert.equal(
  holderNamesMatch('ALI KEDIR', 'ABE KEDIR').matched,
  false,
  'unrelated short first names must remain strict'
);

assert.deepEqual(
  matchReceiverExpectations({
    expectedAccount: '1000 1234 5678',
    expectedHolder: 'Wrong Holder',
    receivedAccount: '100012345678',
    receivedHolder: 'DU Verifay',
  }),
  { accountMatched: true, holderMatched: false, receiverMatched: true },
  'an account-number match is sufficient'
);

assert.deepEqual(
  matchReceiverExpectations({
    expectedAccount: '999999999999',
    expectedHolder: 'ADEL KEDIR MOHAMMED ABDU ABRAR',
    receivedAccount: '100012345678',
    receivedHolder: 'Adel Abrar',
  }),
  { accountMatched: false, holderMatched: true, receiverMatched: true },
  'a holder-name match is sufficient'
);

assert.equal(
  matchReceiverExpectations({
    expectedAccount: '999999999999',
    expectedHolder: 'Someone Else',
    receivedAccount: '100012345678',
    receivedHolder: 'DU Verifay',
  }).receiverMatched,
  false,
  'the receiver must fail when neither field matches'
);

assert.equal(
  accountNumbersMatch('100012349571', '1****9571'),
  true,
  'a visibly masked account should match by its final four digits'
);
assert.equal(
  accountNumbersMatch('100012349571', '9571'),
  true,
  'a provider response containing only four digits should match the suffix'
);
assert.equal(
  accountNumbersMatch('100012349571', '1****1234'),
  false,
  'a wrong masked suffix must not match'
);
assert.equal(
  accountNumbersMatch('100012349571', '999912349571'),
  false,
  'two full account numbers must remain exact even when their suffixes match'
);
assert.equal(
  accountNumbersMatch('Account # 100012349571', 'Account # 999912349571'),
  false,
  'an account label must not be mistaken for a masking marker'
);
assert.equal(
  accountNumbersMatch('100012349571', '***571'),
  false,
  'fewer than four visible digits are not sufficient'
);
assert.equal(
  matchReceiverExpectations({
    expectedAccount: '100012349571',
    expectedHolder: 'ADEL KEDIR ABRAR',
    receivedAccount: '1****1234',
    receivedHolder: 'Adel Abrar',
  }).receiverMatched,
  true,
  'holder name remains a fallback when the masked suffix does not match'
);

console.log('Receiver matching tests passed.');
