const jwt = require("jsonwebtoken");

function auth(req, res, next) {
  const token =
    req.cookies.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (!token) {
    return res.status(401).json({ message: "Không có quyền truy cập" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ message: "Token không hợp lệ" });
  }
}

module.exports = auth;
