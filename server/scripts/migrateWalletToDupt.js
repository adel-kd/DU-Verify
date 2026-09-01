// One-time migration: converts every business's legacy ETB walletBalance
// into the new duptBalance field at the existing custom top-up rate
// (ETB 2 = 1 DU PT), and writes a matching BillingLedger entry so the
// conversion itself is auditable rather than a silent balance jump.
//
// Safe to run multiple times: any user already migrated (flagged via
// walletMigratedAt) is skipped.
//
// Usage:
//   node scripts/migrateWalletToDupt.js
//   node scripts/migrateWalletToDupt.js --dry-run

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");
const BillingLedger = require("../src/models/BillingLedger");

const ETB_PER_DUPT = 2;
const dryRun = process.argv.includes("--dry-run");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.find({ walletMigratedAt: { $exists: false } });
  console.log(`Found ${users.length} user(s) not yet migrated.`);

  for (const user of users) {
    const converted = Math.floor((user.walletBalance || 0) / ETB_PER_DUPT);
    const balanceBefore = user.duptBalance || 0;
    const balanceAfter = balanceBefore + converted;

    console.log(
      `${user.businessName} (${user._id}): ${user.walletBalance} ETB -> +${converted} DU PT ` +
        `(${balanceBefore} -> ${balanceAfter})`
    );

    if (dryRun) continue;

    user.duptBalance = balanceAfter;
    user.walletMigratedAt = new Date();
    await user.save();

    await BillingLedger.create({
      businessId: user._id,
      userId: null,
      type: "ADMIN_CREDIT",
      duptAmount: converted,
      etbAmount: user.walletBalance,
      balanceBefore,
      balanceAfter,
      provider: "migration",
      reason: "Automatic migration of legacy ETB walletBalance to DU PT (ETB 2 = 1 DU PT)",
      status: "success",
    });
  }

  console.log(dryRun ? "Dry run complete - no changes written." : "Migration complete.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
