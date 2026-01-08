const mongoose = require("mongoose");

const chatLogSchema = new mongoose.Schema(
  {
    // Nội dung chính
    question: { type: String, required: true },
    answer: { type: String },

    // Thông tin thêm
    source: { type: String, default: "chatbot" }, // ví dụ: "chatbot-main"
    sessionId: { type: String },                  // nếu sau này bạn muốn gắn session
    ip: { type: String },
    userAgent: { type: String },
    meta: { type: Object },                       // tuỳ ý thêm (url, lang, v.v.)
  },
  { timestamps: true } // có createdAt, updatedAt
);

module.exports = mongoose.model("ChatLog", chatLogSchema);
