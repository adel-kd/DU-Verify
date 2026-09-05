require("dotenv").config();
const express = require("express");
const cors = require("cors");
const passport = require("passport");
const { connectDB } = require("./config/db");

const authRoutes = require("./routes/auth");
const staffRoutes = require("./routes/staff");
const verifyRoutes = require("./routes/verify");
const billingRoutes = require("./routes/billing");
const adminRoutes = require("./routes/admin");
const announcementsRoutes = require("./routes/announcements");
const paymentAccountsRoutes = require("./routes/paymentAccounts");
const platformRoutes = require("./routes/platform");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

function normalizeOrigin(value) {
  try {
    return new URL(String(value || "").trim()).origin;
  } catch {
    return null;
  }
}

const allowedOrigins = new Set(
  [
    process.env.FRONTEND_URL,
    ...(process.env.FRONTEND_URLS || "").split(","),
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
  ]
    .map(normalizeOrigin)
    .filter(Boolean)
);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
      return callback(null, true);
    }

    const error = new Error("Origin is not allowed");
    error.code = "CORS_ORIGIN_DENIED";
    return callback(error);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "ngrok-skip-browser-warning",
  ],
};

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (req.secure && process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
});

app.use(cors(corsOptions));

// Handle preflight requests
app.options(/.*/, cors(corsOptions));

// Required for Google OAuth
app.use(passport.initialize());

// Capture raw body for Chapa webhook while keeping normal JSON parsing
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ===============================
// ROUTES
// ===============================
app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/verify", verifyRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/announcements", announcementsRoutes);
app.use("/api/payment-accounts", paymentAccountsRoutes);
app.use("/api/platform", platformRoutes);

// ===============================
// HEALTH CHECK
// ===============================
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "Digital Verification",
  });
});

app.use((err, req, res, next) => {
  if (err?.code === "CORS_ORIGIN_DENIED") {
    return res.status(403).json({ error: "Origin is not allowed" });
  }

  return next(err);
});

// ===============================
// SERVER
// ===============================
const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `[server] Digital Verification API listening on port ${PORT}`
      );
    });
  })
  .catch((err) => {
    console.error(
      "[server] Failed to connect to MongoDB:",
      err.message
    );
    process.exit(1);
  });
