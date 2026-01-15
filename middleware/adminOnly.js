const adminOnly = (req, res, next) => {
  // req.user được set trong middleware auth (JWT)
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Chỉ admin mới có quyền truy cập." });
  }
  return next();
};

module.exports = adminOnly;
