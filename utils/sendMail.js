const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true", // TLS = false, SSL = true
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendMail({ to, subject, text, html }) {
  if (!process.env.SMTP_USER) {
    console.warn("⚠ SMTP_USER chưa cấu hình, bỏ qua gửi email.");
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"ChatIIP" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html: html || text
  });
}

module.exports = sendMail;

