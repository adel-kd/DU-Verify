const express = require("express");
const PlatformSettings = require("../models/PlatformSettings");

const router = express.Router();

// Public copy used by the footer and legal pages. Billing/provider controls
// remain behind authenticated admin and owner routes.
router.get("/content", async (_req, res) => {
  try {
    const settings = await PlatformSettings.getOrCreate();
    return res.json({ content: settings.siteContent });
  } catch (error) {
    console.error("[platform] content error:", error);
    return res.status(500).json({ error: "Could not load platform content" });
  }
});

module.exports = router;
