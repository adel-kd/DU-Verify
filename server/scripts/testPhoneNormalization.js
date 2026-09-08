const assert = require("assert");
const {
  normalizeEthiopianPhone,
  phoneVariants,
} = require("../src/utils/phone");

const canonical = "+251911234567";

for (const input of [
  "0911234567",
  "251911234567",
  "+251911234567",
  "911234567",
  "+251 911 234 567",
  "0911-234-567",
]) {
  assert.strictEqual(normalizeEthiopianPhone(input), canonical, input);
}

for (const expected of [canonical, "251911234567", "0911234567", "911234567"]) {
  assert(phoneVariants("0911234567").includes(expected), expected);
}

for (const invalid of ["", "0811234567", "09112345", "not-a-phone"]) {
  assert.strictEqual(normalizeEthiopianPhone(invalid), null, invalid);
}

console.log("Ethiopian phone normalization tests passed.");
