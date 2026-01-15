const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");
const sendMail = require("../utils/sendMail");

const router = express.Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 ngày
};

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

function toPublicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}


function generateTempPassword(length = 10) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%";
  let pwd = "";
  for (let i = 0; i < length; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}


// ================== ĐĂNG KÝ: GỬI OTP ==================
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập đầy đủ email và mật khẩu." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existed = await User.findOne({ email: normalizedEmail });
    if (existed) {
      return res
        .status(400)
        .json({ message: "Email này đã được sử dụng. Hãy đăng nhập." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 số

    const user = await User.create({
      name: name?.trim(),
      email: normalizedEmail,
      phone: phone ? phone.toString().trim() : undefined,
      passwordHash,
      role: "user",
      emailVerified: false,
      emailVerifyCode: otp,
      emailVerifyExpires: new Date(Date.now() + 15 * 60 * 1000) // 15 phút
    });

    try {
      await sendMail({
        to: normalizedEmail,
        subject: "Mã xác nhận đăng ký ChatIIP",
        html: `
          <p>Xin chào ${user.name || "bạn"},</p>
          <p>Mã xác nhận (OTP) của bạn là:</p>
          <p style="font-size:24px;font-weight:bold;">${otp}</p>
          <p>Mã có hiệu lực trong 15 phút.</p>
        `
      });
    } catch (e) {
      console.error("Send OTP mail error:", e);
      return res.status(500).json({
        message:
          "Tạo tài khoản thành công nhưng không gửi được email OTP. Kiểm tra lại cấu hình email."
      });
    }

    res.status(201).json({
      message: "Đăng ký thành công. Vui lòng kiểm tra email để lấy mã OTP.",
      email: normalizedEmail
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// ================== XÁC THỰC EMAIL BẰNG OTP ==================
router.post("/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res
        .status(400)
        .json({ message: "Thiếu email hoặc mã xác nhận." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản." });
    }

    if (user.emailVerified) {
      return res
        .status(400)
        .json({ message: "Email này đã được xác thực trước đó." });
    }

    if (
      !user.emailVerifyCode ||
      !user.emailVerifyExpires ||
      user.emailVerifyCode !== code ||
      user.emailVerifyExpires.getTime() < Date.now()
    ) {
      return res
        .status(400)
        .json({ message: "Mã xác nhận không đúng hoặc đã hết hạn." });
    }

    user.emailVerified = true;
    user.emailVerifyCode = undefined;
    user.emailVerifyExpires = undefined;
    await user.save();

    const token = signToken(user);
    res.cookie("token", token, COOKIE_OPTIONS);

    res.json({
      message: "Xác thực email thành công.",
      user: toPublicUser(user)
    });
  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// ================== ĐĂNG NHẬP ==================
router.post("/login", async (req, res) => {
  try {
    const { email, password, adminLogin } = req.body || {};

    const normalizedEmail = (email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập đầy đủ email và mật khẩu." });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: "Sai email hoặc mật khẩu" });
    }

    const ok = await user.comparePassword(password);
    if (!ok) {
      return res.status(401).json({ message: "Sai email hoặc mật khẩu" });
    }

    // Nếu request đăng nhập từ trang ADMIN, bắt buộc tài khoản phải có role = admin
    if (adminLogin && user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Tài khoản này không có quyền đăng nhập admin." });
    }

    if (!user.emailVerified) {
      return res
        .status(403)
        .json({ message: "Tài khoản chưa xác thực email." });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);
    res.cookie("token", token, COOKIE_OPTIONS);

    res.json({
      message: "Đăng nhập thành công",
      user: toPublicUser(user)
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// ================== ĐĂNG XUẤT ==================
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Đã đăng xuất" });
});


// ================== QUÊN MẬT KHẨU: GỬI OTP ==================
router.post("/request-password-reset", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ message: "Vui lòng nhập email." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Trả về message chung để tránh lộ email tồn tại hay không
    if (!user) {
      return res.json({
        message: "Nếu email tồn tại, mã đặt lại mật khẩu đã được gửi."
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 phút

    user.resetPasswordCode = otp;
    user.resetPasswordExpires = expires;
    await user.save();

    try {
      await sendMail({
        to: user.email,
        subject: "Mã OTP đặt lại mật khẩu - ChatIIP",
        text: `Mã OTP đặt lại mật khẩu của bạn là: ${otp}. Mã có hiệu lực trong 10 phút.`,
        html: `
          <p>Xin chào ${user.name || "bạn"},</p>
          <p>Mã OTP đặt lại mật khẩu của bạn là: <b>${otp}</b></p>
          <p>Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, có thể bỏ qua email này.</p>
        `
      });
    } catch (mailErr) {
      console.error("Send reset password email error:", mailErr);
    }

    const isDevLike =
      process.env.NODE_ENV !== "production" || !process.env.SMTP_USER;

    const response = {
      message: "Nếu email tồn tại, mã đặt lại mật khẩu đã được gửi."
    };

    // Trong môi trường dev / chưa cấu hình SMTP, trả OTP để bạn test nhanh
    if (isDevLike) {
      response.debugCode = otp;
    }

    res.json(response);
  } catch (err) {
    console.error("Request password reset error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// ================== QUÊN MẬT KHẨU: XÁC NHẬN OTP + ĐỔI MẬT KHẨU ==================
router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body || {};
    if (!email || !code || !newPassword) {
      return res
        .status(400)
        .json({ message: "Thiếu email, mã OTP hoặc mật khẩu mới." });
    }

    if (String(newPassword).length < 6) {
      return res
        .status(400)
        .json({ message: "Mật khẩu mới tối thiểu 6 ký tự." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.resetPasswordCode || !user.resetPasswordExpires) {
      return res
        .status(400)
        .json({ message: "Mã OTP không hợp lệ hoặc đã hết hạn." });
    }

    if (
      user.resetPasswordCode !== String(code).trim() ||
      user.resetPasswordExpires.getTime() < Date.now()
    ) {
      return res
        .status(400)
        .json({ message: "Mã OTP không đúng hoặc đã hết hạn." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({
      message: "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại."
    });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});


// ================== LẤY THÔNG TIN TÀI KHOẢN HIỆN TẠI ==================
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản." });
    }
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// ================== LẤY THÔNG TIN ADMIN (ME) ==================
router.get("/admin/me", auth, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản." });
    }
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error("Admin me error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// ================== CẬP NHẬT HỒ SƠ (TÊN, AVATAR) ==================
router.put("/me", auth, async (req, res) => {
  try {
    const { name, avatarUrl } = req.body || {};
    const update = {};
    if (typeof name === "string") update.name = name.trim();
    if (typeof avatarUrl === "string") update.avatarUrl = avatarUrl.trim();

    const user = await User.findByIdAndUpdate(req.user.id, update, {
      new: true
    });
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản." });
    }

    res.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// ================== DANH SÁCH USER CHO ADMIN ==================
router.get("/users", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Không có quyền truy cập." });
    }

    const users = await User.find()
      .sort({ createdAt: -1 })
      .select("-passwordHash -emailVerifyCode -emailVerifyExpires");

    res.json({ users });
  } catch (err) {
    console.error("List users error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// ================== ADMIN: XÓA TÀI KHOẢN ==================
router.delete("/users/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Không có quyền truy cập." });
    }

    const userId = req.params.id;
    if (!userId) {
      return res.status(400).json({ message: "Thiếu ID người dùng." });
    }

    // Không cho tự xóa chính mình
    if (String(userId) === String(req.user.id)) {
      return res
        .status(400)
        .json({ message: "Không thể tự xóa tài khoản của chính bạn." });
    }

    const deleted = await User.findByIdAndDelete(userId);
    if (!deleted) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản." });
    }

    res.json({ message: "Đã xóa tài khoản thành công." });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// ================== ADMIN: RESET MẬT KHẨU TÀI KHOẢN ==================
router.post("/users/:id/reset-password", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Không có quyền truy cập." });
    }

    const userId = req.params.id;
    if (!userId) {
      return res.status(400).json({ message: "Thiếu ID người dùng." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản." });
    }

    const tempPassword = generateTempPassword(10);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    user.passwordHash = passwordHash;
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    try {
      if (user.email && process.env.SMTP_USER) {
        await sendMail({
          to: user.email,
          subject: "Mật khẩu tài khoản ChatIIP của bạn đã được reset",
          html: `
            <p>Xin chào ${user.name || "bạn"},</p>
            <p>Mật khẩu mới tạm thời của bạn là: <b>${tempPassword}</b></p>
            <p>Vui lòng đăng nhập và đổi lại mật khẩu ngay sau khi sử dụng.</p>
          `
        });
      }
    } catch (mailErr) {
      console.error("Send reset password for user error:", mailErr);
    }

    res.json({
      message: "Đã reset mật khẩu tài khoản thành công.",
      tempPassword,
      user: toPublicUser(user)
    });
  } catch (err) {
    console.error("Admin reset user password error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});


module.exports = router;
