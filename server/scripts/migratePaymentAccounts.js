// One-time migration: for every business that had a legacy
// cbeAccountSuffix and/or abyssiniaAccountSuffix set directly on their User
// document, create the equivalent PaymentAccount record so verification
// keeps working without the owner having to re-enter anything.
//
// The old User fields never stored an account number or holder name (only
// the suffix), so accountNumber is filled with a placeholder the owner
// should update in Settings > Payment Accounts, and accountHolderName
// defaults to the business name. Safe to re-run - skipped if a
// PaymentAccount for that business+provider already exists.
//
// Usage:
//   node scripts/migratePaymentAccounts.js
//   node scripts/migratePaymentAccounts.js --dry-run

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");
const PaymentAccount = require("../src/models/PaymentAccount");

const dryRun = process.argv.includes("--dry-run");

async function migrateProvider(user, provider, suffix) {
  if (!suffix) return null;

  const existing = await PaymentAccount.findOne({ businessId: user._id, provider });
  if (existing) return null;

  console.log(
    `${user.businessName} (${user._id}): creating ${provider} PaymentAccount from legacy suffix "${suffix}"`
  );

  if (dryRun) return null;

  return PaymentAccount.create({
    businessId: user._id,
    provider,
    accountNumber: "UPDATE_ME", // owner should fill this in via Settings > Payment Accounts
    accountHolderName: user.businessName,
    accountSuffix: suffix,
    enabled: true,
  });
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.find({
    role: "owner",
    $or: [
      { cbeAccountSuffix: { $exists: true, $ne: "" } },
      { abyssiniaAccountSuffix: { $exists: true, $ne: "" } },
    ],
  });

  console.log(`Found ${users.length} business(es) with a legacy account suffix set.`);

  for (const user of users) {
    await migrateProvider(user, "CBE", user.cbeAccountSuffix);
    await migrateProvider(user, "Abyssinia", user.abyssiniaAccountSuffix);
  }

  console.log(dryRun ? "Dry run complete - no changes written." : "Migration complete.");
  console.log(
    "IMPORTANT: migrated accounts have a placeholder accountNumber (\"UPDATE_ME\") - " +
      "ask each business owner to fill in the real account number in Settings > Payment Accounts."
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
