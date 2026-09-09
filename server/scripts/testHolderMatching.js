// scripts/testHolderMatching.js
//
// Manual test harness for the OCR-tolerant holder matching and
// cross-provider account selection implemented in
// src/routes/verify.js.
//
// Covers positive OCR-tolerance cases AND negative
// security-boundary cases proving the matcher is not permissive.
//
// Run: node scripts/testHolderMatching.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(
  path.join(__dirname, "../src/routes/verify.js"),
  "utf8"
);

// Extract the pure helper functions (no Express/Mongo dependencies).
const start = source.indexOf("function normalizeAccountNumber");
const end = source.indexOf("/* ============================================================\n   POST /api/verify");

if (start === -1 || end === -1) {
  console.error("Could not locate helper functions in verify.js");
  process.exit(1);
}

const { holderNamesMatch } = require('../src/utils/receiverMatching');
const sandbox = { console, ocrTolerantNamesMatch: holderNamesMatch };
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end), sandbox);

const {
  matchAgainstPaymentAccounts,
  ocrTolerantNamesMatch,
  accountNumbersMatch,
  paymentAccountsForProvider,
} = sandbox;

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}  (expected ${expected}, got ${actual})`
  );
}

/* ============================================================
   FIXTURES
============================================================ */

const adminAccounts = [
  {
    provider: "Awash",
    accountNumber: "014251781921700",
    accountHolderName: "ADEL KEDIR ABRAR",
  },
  {
    provider: "CBE",
    accountNumber: "1000123456789",
    accountHolderName: "MOHAMMED ALI",
  },
];

const awashOnly = [adminAccounts[0]];
const cbeOnly = [adminAccounts[1]];

function matched(accounts, account, holder, provider) {
  return matchAgainstPaymentAccounts(
    accounts,
    account,
    holder,
    provider
  ).matched;
}

/* ============================================================
   POSITIVE CASES (1-15)
============================================================ */

console.log("\n--- POSITIVE ---");

check("01 exact name + exact account", matched(awashOnly, "014251781921700", "ADEL KEDIR ABRAR", "Awash"), true);
check("02 exact name + missing account", matched(awashOnly, null, "ADEL KEDIR ABRAR", "Awash"), true);
check("03 missing name + exact account", matched(awashOnly, "014251781921700", null, "Awash"), true);
check("04 ADEL vs ADIL", ocrTolerantNamesMatch("ADEL KEDIR ABRAR", "ADIL KEDIR ABRAR").matched, true);
check("05 0/O in name (ABR0R)", ocrTolerantNamesMatch("ADEL KEDIR ABRAR", "ADEL KEDIR ABR0R").matched, true);
check("06 5/S in name (KE5DIR)", ocrTolerantNamesMatch("ADEL KEDIR ABRAR", "ADEL KE5DIR ABRAR").matched, true);
check("07 1/I in name (KED1R)", ocrTolerantNamesMatch("ADEL KEDIR ABRAR", "ADEL KED1R ABRAR").matched, true);
check("08 8/B in name (ABRAR -> ABR4R-style via A8RAR)", ocrTolerantNamesMatch("ABRAHAM BONE", "A8RAHAM 8ONE").matched, true);
check("09 lowercase vs uppercase", matched(awashOnly, null, "adel kedir abrar", "Awash"), true);
check("10 extra spaces", matched(awashOnly, null, "ADEL   KEDIR  ABRAR", "Awash"), true);
check("11 punctuation/hyphen differences", ocrTolerantNamesMatch("ADEL KEDIR ABRAR", "Adel Kedir-Abrar.").matched, true);
check("12 missing middle name", matched(awashOnly, null, "ADEL ABRAR", "Awash"), true);
check("13 first+last when admin has first+middle+last (extra middle on receipt)", ocrTolerantNamesMatch("ADEL ABRAR", "ADEL KEDIR ABRAR").matched, true);
check("13b first+last when the configured legal name has five parts", ocrTolerantNamesMatch("ADEL KEDIR MOHAMMED ABDU ABRAR", "ADEL ABRAR").matched, true);
check("14 formatted account spaces", matched(awashOnly, "01425 1781921700", null, "Awash"), true);
check("15 safe OCR account substitution (O->0)", accountNumbersMatch("12340678", "1234O678"), true);

/* ============================================================
   NEGATIVE / SECURITY BOUNDARY CASES (16-25)
============================================================ */

console.log("\n--- NEGATIVE / SECURITY ---");

check("16 completely different holder", matched(awashOnly, null, "SARA BEKELE GEBRE", "Awash"), false);
check("17 unrelated names with similar length", ocrTolerantNamesMatch("ADEL KEDIR", "ABEBE TESFAYE").matched, false);
check("18 short-name fuzzy false positive (ALI vs ABE)", ocrTolerantNamesMatch("ALI", "ABE").matched, false);
check("19 account with one genuinely changed digit", accountNumbersMatch("12345678", "12349678"), false);
check("20 account with multiple changed digits", accountNumbersMatch("12345678", "12349679"), false);
check("21 wrong account + unrelated name", matched(awashOnly, "999999999999999", "MOHAMMED ALI", "Awash"), false);
check("22 both identity fields missing", matched(awashOnly, null, null, "Awash"), false);
check("23 Awash receipt paid to CBE account", matched(cbeOnly, "1000123456789", "MOHAMMED ALI", "Awash"), true);
check("24 cross-provider receipt with wrong receiver", matched(cbeOnly, null, "ADIL KEDIR ABRAR", "Awash"), false);
check("25 intentionally similar but different names", ocrTolerantNamesMatch("ADEL KEDIR ABRAR", "ADELIE KEDIR ABARA").matched, false);
check("26 Telebirr receipt paid to Awash account", matched(awashOnly, "014251781921700", "ADEL KEDIR ABRAR", "Telebirr"), true);
check("27 Awash receipt paid to CBE account by holder", matched(cbeOnly, null, "MOHAMMED ALI", "Awash"), true);
check("28 matcher continues until a later configured account matches", matched(adminAccounts, "1000123456789", null, "Telebirr"), true);
check("29 no configured account matches the confirmed receiver", matched(adminAccounts, "7777777777777", "SARA BEKELE", "Telebirr"), false);

/* ============================================================
   CONFIGURED RECEIPT PROVIDERS
============================================================ */

console.log("\n--- CONFIGURED PROVIDERS ---");

check("configured CBE provider has one eligible account", paymentAccountsForProvider(adminAccounts, "CBE").length, 1);
check("unconfigured Telebirr provider has no eligible account", paymentAccountsForProvider(adminAccounts, "Telebirr").length, 0);

/* ============================================================
   OR-LOGIC TRUTH TABLE
============================================================ */

console.log("\n--- OR LOGIC (nameMatch || accountMatch) ---");

check("name MATCH + account MATCH => MATCH", matched(awashOnly, "014251781921700", "ADEL KEDIR ABRAR", "Awash"), true);
check("name MATCH + account MISSING => MATCH", matched(awashOnly, null, "ADEL KEDIR ABRAR", "Awash"), true);
check("name MISSING + account MATCH => MATCH", matched(awashOnly, "014251781921700", null, "Awash"), true);
check("strong fuzzy name + wrong account => MATCH", matched(awashOnly, "999999999999999", "ADIL KEDIR ABRAR", "Awash"), true);
check("wrong name + exact account => MATCH", matched(awashOnly, "014251781921700", "SOMEONE ELSE", "Awash"), true);
check("wrong name + wrong account => MISMATCH", matched(awashOnly, "999999999999999", "SOMEONE ELSE", "Awash"), false);

/* ============================================================
   ACCOUNT STRICTNESS DIRECT CHECKS
============================================================ */

console.log("\n--- ACCOUNT STRICTNESS ---");

check("dash-formatted account equals plain", accountNumbersMatch("1234-5678-9012", "123456789012"), true);
check("spaced account equals plain", accountNumbersMatch("1234 5678 9012", "123456789012"), true);
check("no unrestricted fuzzy on digits", accountNumbersMatch("12345678", "12345679"), false);
check("length difference is a mismatch", accountNumbersMatch("12345678", "1234567"), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
