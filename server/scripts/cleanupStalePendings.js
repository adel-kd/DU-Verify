// One-off cleanup: delete PendingRegistration records whose 24h TTL has
// already passed (e.g. abandoned sign-ups from when OTP emails failed).
require("dotenv").config();
const mongoose = require("mongoose");
const PendingRegistration = require("../src/models/PendingRegistration");

mongoose
  .connect(process.env.MONGODB_URI || process.env.MONGO_URI)
  .then(async () => {
    const r = await PendingRegistration.deleteMany({
      expiresAt: { $lt: new Date() },
    });
    console.log("stale pendings deleted:", r.deletedCount);
    console.log("pendings remaining:", await PendingRegistration.countDocuments());
    await mongoose.disconnect();
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
