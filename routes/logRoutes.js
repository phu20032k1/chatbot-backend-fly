const express = require("express");
const ChatLog = require("../models/ChatLog");
const auth = require("../middleware/auth");

const router = express.Router();

/**
 * PUBLIC: Ghi log mỗi lần user hỏi (được gọi từ chatbot FE)
 * Không cần auth, nhưng chỉ chấp nhận JSON đơn giản.
 */
router.post("/", async (req, res) => {
  try {
    const { question, answer, source, sessionId, meta } = req.body || {};

    if (!question) {
      return res.status(400).json({ message: "Thiếu câu hỏi" });
    }

    const ip =
      (req.headers["x-forwarded-for"] &&
        req.headers["x-forwarded-for"].split(",")[0].trim()) ||
      req.ip;

    const log = await ChatLog.create({
      question,
      answer,
      source: source || "chatbot",
      sessionId,
      ip,
      userAgent: req.headers["user-agent"],
      meta: meta || {}
    });

    res.json({ message: "OK", id: log._id });
  } catch (err) {
    console.error("Create chat log error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

/**
 * ADMIN: Lấy danh sách log để xem trong admin
 * Có thể filter theo search, phân trang page/limit
 * /api/logs?search=luong&page=1&limit=50
 */
router.get("/", auth, async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 50);
    const search = (req.query.search || "").trim();

    const query = {};
    if (search) {
      query.$or = [
        { question: new RegExp(search, "i") },
        { answer: new RegExp(search, "i") }
      ];
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      ChatLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ChatLog.countDocuments(query)
    ]);

    res.json({
      data: items,
      page,
      limit,
      total
    });
  } catch (err) {
    console.error("Get chat logs error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;
