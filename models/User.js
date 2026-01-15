const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true },
    passwordHash: { type: String, required: true },

    // admin | user
    role: { type: String, enum: ["admin", "user"], default: "user" },

    // avatar, cài đặt sau này
    avatarUrl: { type: String },

    // Số điện thoại
    phone: { type: String, trim: true },

    // OTP / xác thực email
    emailVerified: { type: Boolean, default: false },
    emailVerifyCode: { type: String }, // mã OTP
    emailVerifyExpires: { type: Date }, // hết hạn OTP

    // Quên mật khẩu (OTP reset password)
    resetPasswordCode: { type: String },
    resetPasswordExpires: { type: Date },


    // quản lý ai đã đăng nhập
    lastLoginAt: { type: Date }
  },
  { timestamps: true } // tự có createdAt, updatedAt
);

// Tự tạo / đồng bộ tài khoản admin theo ENV
userSchema.statics.ensureAdminUser = async function (email, password) {
  if (!email || !password) return;

  const normalizedEmail = email.toLowerCase();
  let user = await this.findOne({ email: normalizedEmail });

  // Hash mật khẩu mới từ ENV
  const hash = await bcrypt.hash(password, 10);

  if (!user) {
    // Chưa có tài khoản -> tạo mới admin
    await this.create({
      name: "Admin",
      email: normalizedEmail,
      passwordHash: hash,
      role: "admin",
      emailVerified: true // admin mặc định đã verified
    });

    console.log("✔ Admin default created:", normalizedEmail);
    return;
  }

  // Đã có user với email này -> ép thành admin + cập nhật mật khẩu + verify
  let changed = false;
  if (user.role !== "admin") {
    user.role = "admin";
    changed = true;
  }
  if (!user.emailVerified) {
    user.emailVerified = true;
    changed = true;
  }

  // luôn đồng bộ mật khẩu theo ENV để bạn chắc chắn đăng nhập được
  user.passwordHash = hash;
  changed = true;

  if (changed) {
    await user.save();
    console.log("✔ Admin default updated:", normalizedEmail);
  } else {
    console.log("✔ Admin default already up-to-date:", normalizedEmail);
  }
};

userSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model("User", userSchema);
