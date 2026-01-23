const express = require("express");
const { synthesizeToMp3Buffer } = require("../utils/googleTts");
const { detectTtsVoice } = require("../utils/ttsDetect");

const router = express.Router();

// --- Simple in-memory rate limit (best-effort) ---
// This is intentionally lightweight to avoid new dependencies.
// For production at scale, consider Redis-backed rate limiting.
const _hits = new Map();

function nowMs() {
  return Date.now();
}

function getClientIp(req) {
  // trust proxy is enabled in server.js
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  return req.ip || "unknown";
}

function rateLimit(req, res, next) {
  const ip = getClientIp(req);
  const key = `tts:${ip}`;
  const t = nowMs();

  // Windows
  const win1m = 60 * 1000;
  const win1h = 60 * 60 * 1000;

  const rec = _hits.get(key) || { m: [], h: [] };

  // purge old
  rec.m = rec.m.filter(ts => t - ts < win1m);
  rec.h = rec.h.filter(ts => t - ts < win1h);

  // limits
  const limitPerMin = Number(process.env.TTS_RATE_LIMIT_PER_MIN || 10);
  const limitPerHour = Number(process.env.TTS_RATE_LIMIT_PER_HOUR || 60);

  if (rec.m.length >= limitPerMin || rec.h.length >= limitPerHour) {
    return res.status(429).json({
      message: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút."
    });
  }

  rec.m.push(t);
  rec.h.push(t);
  _hits.set(key, rec);
  next();
}

function clampNumber(v, min, max, fallback) {
  const n = Number(v);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// POST /api/tts
// Body: { text, voiceName?, speakingRate?, pitch? }
router.post("/", rateLimit, async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) {
      return res.status(400).json({ message: "Thiếu text." });
    }

    // Hard cap to prevent abuse (bytes, not chars)
    const maxInputBytes = Number(process.env.TTS_MAX_INPUT_BYTES || 20000);
    if (Buffer.byteLength(text, "utf8") > maxInputBytes) {
      return res.status(413).json({
        message: `Text quá dài. Vui lòng rút gọn hoặc chia nhỏ (tối đa ~${maxInputBytes} bytes).`
      });
    }

    const detected = detectTtsVoice(text);

    // Auto-detect language/voice by default; still allows explicit overrides from the request body.
    const languageCode = String(req.body?.languageCode || detected.languageCode || "vi-VN").trim() || (detected.languageCode || "vi-VN");
    let voiceName = String(req.body?.voiceName || detected.voiceName || "vi-VN-Standard-A").trim() || (detected.voiceName || "vi-VN-Standard-A");

    // Safety: default to Standard voices (free tier is larger); allow override only if explicitly allowed.
    const allowWavenet = String(process.env.TTS_ALLOW_WAVENET || "false").toLowerCase() === "true";
    if (!allowWavenet && /wavenet/i.test(voiceName)) {
      voiceName = detected.voiceName || "vi-VN-Standard-A";
    }

    const speakingRate = clampNumber(req.body?.speakingRate, 0.25, 4, 1);
    const pitch = clampNumber(req.body?.pitch, -20, 20, 0);

    const audio = await synthesizeToMp3Buffer({
      text,
      languageCode,
      voiceName,
      speakingRate,
      pitch,
      audioEncoding: "MP3"
    });

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", String(audio.length));
    return res.status(200).send(audio);
  } catch (err) {
    console.error("TTS error:", err);
    const status = err?.status && Number.isFinite(err.status) ? err.status : 500;
    return res.status(status).json({
      message: "Không thể tạo giọng đọc lúc này.",
      detail: process.env.NODE_ENV === "production" ? undefined : String(err?.message || err)
    });
  }
});

module.exports = router;
