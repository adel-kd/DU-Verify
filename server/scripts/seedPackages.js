// Seeds the three default discounted DU PT packages. Safe to re-run -
// upserts by `key` rather than inserting duplicates.
//
// Usage:
//   node scripts/seedPackages.js

require("dotenv").config();
const mongoose = require("mongoose");
const Package = require("../src/models/Package");

const PACKAGES = [
  { key: "starter", name: "Starter", duptAmount: 500, priceETB: 900, sortOrder: 1 },
  { key: "business", name: "Business", duptAmount: 2000, priceETB: 3400, sortOrder: 2 },
  { key: "enterprise", name: "Enterprise", duptAmount: 10000, priceETB: 15000, sortOrder: 3 },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  for (const pkg of PACKAGES) {
    const result = await Package.findOneAndUpdate(
      { key: pkg.key },
      { ...pkg, updatedAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`Upserted package: ${result.name} (${result.duptAmount} DU PT / ETB ${result.priceETB})`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
