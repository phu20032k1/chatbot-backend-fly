const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const User = require("../models/User");
const EmailOtp = require("../models/EmailOtp");

const auth = require("../middleware/auth");
const requireAdmin = require("../middleware/requireAdmin");

const { sendOtpEmail } = require("../utils/mailer");

const router = express.Router();

function normalizeEmail(email) {
  return (email || "").toLowerCase().trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function signToken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  // If your frontend + backend are on different domains (Netlify -> Fly),
  // cross-site cookie needs SameSite=None + Secure=true.
  const sameSite = process.env.COOKIE_SAMESITE || (isProd ? "none" : "lax");
  const secure = (process.env.COOKIE_SECURE || "").toLowerCase() === "true" ? true : isProd;

  res.cookie("token", token, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

async function issueOtpForUser(user, { minutes = 5 } = {}) {
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

  await EmailOtp.create({
    userId: user._id,
    purpose: "verify_email",
    otpHash,
    expiresAt
  });

  await sendOtpEmail({ to: user.email, otp, minutes });
}

// ---------------------- Register (send OTP) ----------------------
router.post("/register", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "Email không hợp lệ" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Mật khẩu tối thiểu 6 ký tự" });
    }

    const existed = await User.findOne({ email });
    if (existed && existed.isVerified) {
      return res.status(409).json({ message: "Email này đã được đăng ký" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let user;
    if (!existed) {
      user = await User.create({
        name,
        email,
        passwordHash,
        role: "user",
        isVerified: false,
        status: "active"
      });
    } else {
      // Allow re-register for unverified accounts (update name/password)
      existed.name = name || existed.name;
      existed.passwordHash = passwordHash;
      existed.status = existed.status || "active";
      user = await existed.save();
    }

    await issueOtpForUser(user, { minutes: Number(process.env.OTP_EXPIRE_MINUTES || 5) });

    return res.json({
      message: "Đã gửi OTP tới email. Vui lòng kiểm tra hộp thư (và Spam).",
      next: "verify_otp",
      email: user.email
    });
  } catch (err) {
    console.error(err);
    // If email sending fails, still don't leak details; give a useful error.
    return res.status(500).json({ message: "Không thể gửi OTP. Vui lòng thử lại." });
  }
});

// Resend OTP
router.post("/resend-otp", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "Email không hợp lệ" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    if (user.isVerified) return res.status(400).json({ message: "Tài khoản đã được xác minh" });
    if (user.status === "disabled") return res.status(403).json({ message: "Tài khoản đã bị khóa" });

    await issueOtpForUser(user, { minutes: Number(process.env.OTP_EXPIRE_MINUTES || 5) });
    return res.json({ message: "Đã gửi lại OTP" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Không thể gửi OTP. Vui lòng thử lại." });
  }
});

// Verify OTP (and optionally auto-login)
router.post("/verify-otp", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "Email không hợp lệ" });
    }
    if (!/^[0-9]{6}$/.test(otp)) {
      return res.status(400).json({ message: "OTP phải gồm 6 chữ số" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    if (user.status === "disabled") return res.status(403).json({ message: "Tài khoản đã bị khóa" });

    const now = new Date();
    const candidates = await EmailOtp.find({
      userId: user._id,
      purpose: "verify_email",
      usedAt: null,
      expiresAt: { $gt: now }
    })
      .sort({ createdAt: -1 })
      .limit(5);

    if (!candidates.length) {
      return res.status(400).json({ message: "OTP hết hạn hoặc không tồn tại. Hãy gửi lại OTP." });
    }

    let matched = null;
    for (const doc of candidates) {
      // compare bcrypt hash
      // eslint-disable-next-line no-await-in-loop
      const ok = await bcrypt.compare(otp, doc.otpHash);
      if (ok) {
        matched = doc;
        break;
      }
    }

    if (!matched) {
      return res.status(401).json({ message: "OTP không đúng" });
    }

    matched.usedAt = new Date();
    await matched.save();

    user.isVerified = true;
    await user.save();

    const token = signToken(user);
    setAuthCookie(res, token);

    return res.json({
      message: "Xác minh thành công",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// ---------------------- Login / Logout / Me ----------------------
router.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Sai email hoặc mật khẩu" });
    }
    if (user.status === "disabled") {
      return res.status(403).json({ message: "Tài khoản đã bị khóa" });
    }
    if (user.role !== "admin" && !user.isVerified) {
      return res.status(403).json({ message: "Chưa xác minh email", code: "EMAIL_NOT_VERIFIED" });
    }

    user.lastLoginAt = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();

    const token = signToken(user);
    setAuthCookie(res, token);

    return res.json({
      message: "Đăng nhập thành công",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Đã đăng xuất" });
});

router.get("/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("name email role isVerified status createdAt lastLoginAt loginCount");
  if (!user) return res.status(404).json({ message: "Không tìm thấy tài khoản" });
  return res.json({ user });
});

// ---------------------- Admin: manage accounts ----------------------
router.get("/admin/users", auth, requireAdmin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const q = String(req.query.q || "").trim();

  const filter = q
    ? {
        $or: [
          { email: { $regex: q, $options: "i" } },
          { name: { $regex: q, $options: "i" } }
        ]
      }
    : {};

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("name email role isVerified status createdAt lastLoginAt loginCount")
  ]);

  res.json({
    page,
    limit,
    total,
    users
  });
});

router.put("/admin/users/:id", auth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const patch = {};

  if (typeof req.body.role === "string") patch.role = req.body.role;
  if (typeof req.body.status === "string") patch.status = req.body.status;
  if (typeof req.body.isVerified === "boolean") patch.isVerified = req.body.isVerified;
  if (typeof req.body.name === "string") patch.name = req.body.name;

  const user = await User.findByIdAndUpdate(id, patch, { new: true }).select(
    "name email role isVerified status createdAt lastLoginAt loginCount"
  );
  if (!user) return res.status(404).json({ message: "Không tìm thấy tài khoản" });
  return res.json({ message: "Đã cập nhật", user });
});

router.get("/admin/stats", auth, requireAdmin, async (req, res) => {
  const [total, verified, disabled] = await Promise.all([
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "user", isVerified: true }),
    User.countDocuments({ role: "user", status: "disabled" })
  ]);
  return res.json({ totalUsers: total, verifiedUsers: verified, disabledUsers: disabled });
});

module.exports = router;
