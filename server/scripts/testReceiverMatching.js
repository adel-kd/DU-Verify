const assert = require('node:assert/strict');
const {
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

console.log('Receiver matching tests passed.');
