const mongoose = require("mongoose");

// Lưu metadata lịch sử chat theo user để đồng bộ đa thiết bị.
// Nội dung tin nhắn hiện tại đang được lưu ở service chat (session_id) bên ngoài;
// backend này chỉ giữ: title/preview/pin/archive + timestamps.

const chatSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionId: { type: String, required: true, index: true },

    title: { type: String, default: "Đoạn chat" },
    preview: { type: String, default: "" },

    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Mỗi user có thể có nhiều session, nhưng (userId, sessionId) là duy nhất
chatSessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

module.exports = mongoose.model("ChatSession", chatSessionSchema);
