require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");

  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.collection("users");

  // Legacy records stored `email: null`. A sparse index still indexes null,
  // so only one phone-only staff account could exist.
  const result = await users.updateMany({ email: null }, { $unset: { email: "" } });
  const indexes = await users.indexes();
  const emailIndex = indexes.find((index) => index.name === "email_1");

  if (emailIndex && (!emailIndex.unique || !emailIndex.sparse)) {
    await users.dropIndex(emailIndex.name);
  }
  await users.createIndex({ email: 1 }, { name: "email_1", unique: true, sparse: true });

  console.log(`[repair-staff-email-index] unset email on ${result.modifiedCount} account(s); email_1 is unique+sparse`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[repair-staff-email-index] failed:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
