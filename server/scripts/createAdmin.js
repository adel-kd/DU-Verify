// Creates (or promotes) a super-admin account. There is no public
// admin-signup endpoint on purpose — this must be run directly on the
// server, by someone with shell/DB access, not exposed over HTTP.
//
// Usage:
//   node scripts/createAdmin.js "DU Verify Admin" admin@example.com 0900000000 "a-strong-password"

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../src/models/User");

async function main() {
  const [ownerName, email, phone, password] = process.argv.slice(2);
  if (!ownerName || !email || !phone || !password) {
    console.error('Usage: node scripts/createAdmin.js "Name" email phone password');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) {
    existing.role = "admin";
    existing.isActive = true;
    await existing.save();
    console.log(`Promoted existing account ${existing.email} to admin.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await User.create({
      businessName: "DU Verify (platform admin)",
      ownerName,
      email,
      phone,
      password: passwordHash,
      role: "admin",
    });
    console.log(`Created admin account ${admin.email}.`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
