const express = require("express");
const auth = require("../middleware/auth");
const ChatSession = require("../models/ChatSession");

const router = express.Router();

// GET /api/chat/sessions
// Lấy danh sách lịch sử chat (metadata) của user hiện tại
router.get("/sessions", auth, async (req, res) => {
  try {
    const list = await ChatSession.find({ userId: req.user.id, deleted: false })
      .sort({ pinned: -1, updatedAt: -1 })
      .lean();

    res.json({ sessions: list });
  } catch (err) {
    console.error("List chat sessions error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// PUT /api/chat/sessions/:sessionId
// Upsert + update metadata cho sessionId
router.put("/sessions/:sessionId", auth, async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || "").trim();
    if (!sessionId) {
      return res.status(400).json({ message: "Thiếu sessionId." });
    }

    const {
      title,
      preview,
      pinned,
      archived,
      deleted,
      createdAt
    } = req.body || {};

    const patch = {};
    if (typeof title === "string") patch.title = title.trim() || "Đoạn chat";
    if (typeof preview === "string") patch.preview = preview;
    if (typeof pinned === "boolean") patch.pinned = pinned;
    if (typeof archived === "boolean") patch.archived = archived;
    if (typeof deleted === "boolean") patch.deleted = deleted;

    // Luôn bump updatedAt để hỗ trợ autosave/keepalive từ frontend (findOneAndUpdate không tự động cập nhật timestamps).
    patch.updatedAt = new Date();

    // only set createdAt on first insert if provided
    const setOnInsert = {
      userId: req.user.id,
      sessionId
    };
    if (createdAt) {
      const ts = Number(createdAt);
      if (!Number.isNaN(ts) && ts > 0) {
        setOnInsert.createdAt = new Date(ts);
      }
    }

    const doc = await ChatSession.findOneAndUpdate(
      { userId: req.user.id, sessionId },
      { $set: patch, $setOnInsert: setOnInsert },
      { new: true, upsert: true }
    );

    res.json({ session: doc });
  } catch (err) {
    // duplicate key / validation
    console.error("Upsert chat session error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;
