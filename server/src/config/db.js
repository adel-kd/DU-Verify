const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not set in the environment");
  }
  await mongoose.connect(uri);
  console.log("[db] connected to MongoDB");
}

module.exports = { connectDB };
