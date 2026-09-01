const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid or disabled account" });
    }

    // For staff, the "business" they operate under is businessId; for an
    // owner it's their own id. This keeps every downstream query scoped
    // to the correct business regardless of who is logged in.
    req.user = user;
    req.businessId = user.role === "owner" ? user._id : user.businessId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { requireAuth };
