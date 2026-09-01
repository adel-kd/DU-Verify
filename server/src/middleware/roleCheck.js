function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== "owner") {
    return res.status(403).json({ error: "Owner access required" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

module.exports = { requireOwner, requireAdmin };
