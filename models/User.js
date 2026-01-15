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

// Tự tạo admin nếu chưa có
userSchema.statics.createAdminIfNotExists = async function (email, password) {
  if (!email || !password) return;

  const existed = await this.findOne({ email: email.toLowerCase() });
  if (existed) return;

  const hash = await bcrypt.hash(password, 10);
  await this.create({
    name: "Admin",
    email: email.toLowerCase(),
    passwordHash: hash,
    role: "admin",
    emailVerified: true // admin mặc định đã verified
  });

  console.log("✔ Admin default created:", email);
};

userSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model("User", userSchema);
