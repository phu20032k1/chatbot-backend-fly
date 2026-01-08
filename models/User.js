const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: "admin" }
});

// tự tạo admin nếu chưa có
userSchema.statics.createAdminIfNotExists = async function (email, password) {
  const existed = await this.findOne({ email });
  if (existed) return;

  const hash = await bcrypt.hash(password, 10);
  await this.create({
    email,
    passwordHash: hash,
    role: "admin"
  });

  console.log("✔ Admin default created:", email);
};

userSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model("User", userSchema);
