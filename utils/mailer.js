const nodemailer = require("nodemailer");

function createTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "Missing GMAIL_USER or GMAIL_APP_PASSWORD in env. Create an App Password in Google Account Security and set both variables."
    );
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass }
  });
}

async function sendOtpEmail({ to, otp, minutes = 5 }) {
  const fromName = process.env.MAIL_FROM_NAME || "ChatIIP";
  const fromEmail = process.env.MAIL_FROM_EMAIL || process.env.GMAIL_USER;

  const transporter = createTransport();

  const subject = "Mã xác minh (OTP) - ChatIIP";
  const text = `Mã OTP của bạn là: ${otp}. Mã có hiệu lực trong ${minutes} phút.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6">
      <h2 style="margin:0 0 12px 0">ChatIIP - Xác minh email</h2>
      <p>Mã OTP của bạn:</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:6px;padding:10px 14px;border:1px solid #ddd;display:inline-block;border-radius:10px">
        ${otp}
      </div>
      <p style="margin-top:14px">Mã có hiệu lực trong <b>${minutes} phút</b>. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    text,
    html
  });
}

module.exports = { sendOtpEmail };
