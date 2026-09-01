require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./config/db");

const authRoutes = require("./routes/auth");
const staffRoutes = require("./routes/staff");
const verifyRoutes = require("./routes/verify");
const billingRoutes = require("./routes/billing");
const adminRoutes = require("./routes/admin");
const paymentAccountsRoutes = require("./routes/paymentAccounts");

const app = express();

app.use(cors());
// verify: captures the raw request body bytes onto req.rawBody alongside
// the normally-parsed req.body. Needed by the Chapa webhook handler, which
// must HMAC the exact bytes Chapa sent (JSON.stringify(req.body) can
// reorder/reformat keys and produce a signature mismatch). Every other
// route is unaffected - req.body still works exactly as before.
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/verify", verifyRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payment-accounts", paymentAccountsRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true, app: "Digital Verification" }));

const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`[server] Digital Verification API listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error("[server] Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
