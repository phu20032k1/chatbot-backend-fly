const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

const auth = require("../middleware/auth");
const LegalDocument = require("../models/LegalDocument");

const router = express.Router();

// -----------------------------
// Helpers
// -----------------------------

function slugify(str) {
  return (str || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

async function ensureUniqueSlug(baseSlug) {
  let slug = baseSlug;
  let i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existed = await LegalDocument.findOne({ slug }).select("_id");
    if (!existed) return slug;
    slug = `${baseSlug}-${i++}`;
  }
}

function safeDate(value) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

function dataUrlToBase64(raw) {
  if (!raw) return "";
  const str = String(raw).trim();
  const idx = str.indexOf("base64,");
  if (idx !== -1) return str.slice(idx + "base64,".length);
  return str;
}

function guessExt(originalName, mimeType) {
  const extFromName = path.extname(originalName || "").toLowerCase();
  if (extFromName) return extFromName;
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return ".docx";
  if (mimeType === "text/plain") return ".txt";
  return "";
}

const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads", "docs");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function saveBase64ToFile({ base64, originalName, mimeType }) {
  const cleanB64 = dataUrlToBase64(base64);
  if (!cleanB64) return null;

  const buffer = Buffer.from(cleanB64, "base64");
  // Giới hạn size file để tránh upload quá lớn (base64 rất nặng)
  // Bạn có thể chỉnh lại nếu cần.
  const MAX_BYTES = 50 * 1024 * 1024; // 50MB
  if (buffer.length > MAX_BYTES) {
    throw new Error("File quá lớn (tối đa 50MB). Hãy nén file hoặc chia nhỏ.");
  }
  const ext = guessExt(originalName, mimeType);
  const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
  const absPath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(absPath, buffer);

  return {
    originalName: originalName || filename,
    mimeType: mimeType || "application/octet-stream",
    size: buffer.length,
    storagePath: path.join("public", "uploads", "docs", filename),
    publicUrl: `/uploads/docs/${filename}`,
    absPath
  };
}

function tryExtractTextFromFile(absPath, mimeType, originalName) {
  try {
    if (!absPath || !fs.existsSync(absPath)) return "";

    // PDF → pdftotext
    if (mimeType === "application/pdf" || (originalName || "").toLowerCase().endsWith(".pdf")) {
      const tmpTxt = path.join(os.tmpdir(), `pdftotext-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
      execFileSync("pdftotext", ["-layout", absPath, tmpTxt], { stdio: "ignore" });
      const text = fs.readFileSync(tmpTxt, "utf8");
      try {
        fs.unlinkSync(tmpTxt);
      } catch {
        // ignore
      }
      return (text || "").trim();
    }

    // DOCX → pandoc (nếu server có)
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      (originalName || "").toLowerCase().endsWith(".docx")
    ) {
      const tmpTxt = path.join(os.tmpdir(), `pandoc-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
      execFileSync("pandoc", [absPath, "-t", "plain", "-o", tmpTxt], { stdio: "ignore" });
      const text = fs.readFileSync(tmpTxt, "utf8");
      try {
        fs.unlinkSync(tmpTxt);
      } catch {
        // ignore
      }
      return (text || "").trim();
    }

    return "";
  } catch (e) {
    console.warn("tryExtractTextFromFile failed:", e?.message || e);
    return "";
  }
}

/**
 * Tạo lược đồ đơn giản từ text: phát hiện Chương/Mục/Điều.
 * Heuristic (đủ dùng) cho phần "Lược đồ".
 */
function buildOutlineFromText(text) {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const root = [];
  let currentChapter = null;
  let currentSection = null;

  const reChapter = /^(CHƯƠNG|CHUONG)\s+([IVXLC0-9]+)\b[:\-\.]?\s*(.*)$/i;
  const reSection = /^(MỤC|MUC)\s+([IVXLC0-9]+)\b[:\-\.]?\s*(.*)$/i;
  const reArticle = /^(ĐIỀU|DIEU)\s+(\d+[A-Z]?)\b[:\-\.]?\s*(.*)$/i;

  function mkNode(label, key) {
    return { label, key, children: [] };
  }

  for (const line of lines) {
    let m;

    m = line.match(reChapter);
    if (m) {
      const roman = m[2];
      const name = m[3] ? ` - ${m[3]}` : "";
      currentChapter = mkNode(`Chương ${roman}${name}`, `chuong_${roman}`);
      root.push(currentChapter);
      currentSection = null;
      continue;
    }

    m = line.match(reSection);
    if (m) {
      const roman = m[2];
      const name = m[3] ? ` - ${m[3]}` : "";
      const node = mkNode(`Mục ${roman}${name}`, `muc_${roman}`);
      if (currentChapter) currentChapter.children.push(node);
      else root.push(node);
      currentSection = node;
      continue;
    }

    m = line.match(reArticle);
    if (m) {
      const num = m[2];
      const name = m[3] ? `: ${m[3]}` : "";
      const node = mkNode(`Điều ${num}${name}`, `dieu_${num}`);
      if (currentSection) currentSection.children.push(node);
      else if (currentChapter) currentChapter.children.push(node);
      else root.push(node);
      continue;
    }
  }

  return root;
}

function deleteIfExists(relStoragePath) {
  if (!relStoragePath) return;
  const abs = path.join(__dirname, "..", relStoragePath);
  if (fs.existsSync(abs)) {
    try {
      fs.unlinkSync(abs);
    } catch (e) {
      console.warn("Cannot delete file:", e?.message || e);
    }
  }
}

// -----------------------------
// PUBLIC APIs
// -----------------------------

/**
 * Danh sách văn bản (public)
 * GET /api/docs?search=&categoryMajor=&status=&from=&to=&page=&limit=
 */
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const search = (req.query.search || "").trim();
    const categoryMajor = (req.query.categoryMajor || "").trim();
    const categoryMinor = (req.query.categoryMinor || "").trim();
    const status = (req.query.status || "").trim();
    const from = safeDate(req.query.from);
    const to = safeDate(req.query.to);

    const query = {};
    if (categoryMajor) query.categoryMajor = categoryMajor;
    if (categoryMinor) query.categoryMinor = categoryMinor;
    if (status) query.tinhTrang = status;
    if (from || to) {
      query.ngayBanHanh = {};
      if (from) query.ngayBanHanh.$gte = from;
      if (to) query.ngayBanHanh.$lte = to;
    }
    if (search) {
      query.$text = { $search: search };
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      LegalDocument.find(query)
        .sort(search ? { score: { $meta: "textScore" }, createdAt: -1 } : { createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          "title slug soHieu loaiVanBan coQuanBanHanh categoryMajor categoryMinor ngayBanHanh ngayHieuLuc tinhTrang trichYeu tags createdAt textContent file"
        )
        .lean(),
      LegalDocument.countDocuments(query)
    ]);

    // Trả thêm textPreview để admin có thể hover xem trước,
    // nhưng không trả toàn bộ textContent để tránh payload quá lớn.
    const data = (items || []).map((it) => {
      const textPreview = (it.textContent || "").slice(0, 600);
      delete it.textContent;
      return { ...it, textPreview };
    });

    res.json({ data, page, limit, total });
  } catch (e) {
    console.error("GET /api/docs error:", e);
    res.status(500).json({ message: "Lỗi server" });
  }
});

/**
 * Sidebar counts (public)
 * GET /api/docs/stats/categories
 */
router.get("/stats/categories", async (req, res) => {
  try {
    const agg = await LegalDocument.aggregate([
      { $group: { _id: "$categoryMajor", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    res.json(
      agg.map((x) => ({
        categoryMajor: x._id || "Khác",
        count: x.count
      }))
    );
  } catch (e) {
    console.error("GET /api/docs/stats/categories error:", e);
    res.status(500).json({ message: "Lỗi server" });
  }
});

/**
 * Chi tiết văn bản theo slug (public)
 */
router.get("/:slug", async (req, res) => {
  try {
    const item = await LegalDocument.findOne({ slug: req.params.slug });
    if (!item) return res.status(404).json({ message: "Không tìm thấy văn bản" });
    res.json(item);
  } catch (e) {
    console.error("GET /api/docs/:slug error:", e);
    res.status(500).json({ message: "Lỗi server" });
  }
});

/**
 * Tải file (public)
 * GET /api/docs/:id/download
 */
router.get("/:id/download", async (req, res) => {
  try {
    const item = await LegalDocument.findById(req.params.id);
    if (!item || !item.file || !item.file.storagePath) {
      return res.status(404).json({ message: "Không tìm thấy file" });
    }

    const absPath = path.join(__dirname, "..", item.file.storagePath);
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ message: "File không tồn tại" });
    }

    res.download(absPath, item.file.originalName || path.basename(absPath));
  } catch (e) {
    console.error("GET /api/docs/:id/download error:", e);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// -----------------------------
// ADMIN APIs (auth)
// -----------------------------

/**
 * Tạo mới văn bản (admin)
 * POST /api/docs
 * body (JSON):
 *  - metadata fields
 *  - fileBase64, fileName, fileMimeType (optional)
 *  - textContent (optional) (dùng nếu file scan không extract được)
 */
router.post("/", auth, async (req, res) => {
  try {
    const {
      title,
      soHieu,
      loaiVanBan,
      coQuanBanHanh,
      categoryMajor,
      categoryMinor,
      ngayBanHanh,
      ngayHieuLuc,
      ngayHetHieuLuc,
      tinhTrang,
      trichYeu,
      tags,
      fileBase64,
      fileName,
      fileMimeType,
      textContent: textContentInput
    } = req.body || {};

    if (!title) return res.status(400).json({ message: "Thiếu tiêu đề" });

    const baseSlug = slugify(soHieu ? `${soHieu}-${title}` : title) || `vb-${Date.now()}`;
    const slug = await ensureUniqueSlug(baseSlug);

    let file = null;
    let extractedText = "";

    if (fileBase64) {
      const saved = saveBase64ToFile({ base64: fileBase64, originalName: fileName, mimeType: fileMimeType });
      if (saved) {
        file = {
          originalName: saved.originalName,
          mimeType: saved.mimeType,
          size: saved.size,
          storagePath: saved.storagePath,
          publicUrl: saved.publicUrl
        };
        extractedText = tryExtractTextFromFile(saved.absPath, saved.mimeType, saved.originalName);
      }
    }

    const finalText = (textContentInput || extractedText || "").trim();
    const outline = buildOutlineFromText(finalText);

    const doc = await LegalDocument.create({
      title: String(title).trim(),
      slug,
      soHieu: (soHieu || "").trim(),
      loaiVanBan: (loaiVanBan || "").trim(),
      coQuanBanHanh: (coQuanBanHanh || "").trim(),
      categoryMajor: (categoryMajor || "Khác").trim(),
      categoryMinor: (categoryMinor || "").trim(),
      ngayBanHanh: safeDate(ngayBanHanh),
      ngayHieuLuc: safeDate(ngayHieuLuc),
      ngayHetHieuLuc: safeDate(ngayHetHieuLuc),
      tinhTrang: (tinhTrang || "Không xác định").trim(),
      trichYeu: (trichYeu || "").trim(),
      tags: normalizeTags(tags),
      textContent: finalText,
      outline,
      file
    });

    res.status(201).json(doc);
  } catch (e) {
    console.error("POST /api/docs error:", e);
    const msg = (e && e.message) || "";
    if (msg && /file|base64|quá lớn|tối đa/i.test(msg)) {
      return res.status(400).json({ message: msg });
    }
    res.status(500).json({ message: "Lỗi server" });
  }
});

/**
 * Sửa văn bản (admin)
 * PUT /api/docs/:id
 */
router.put("/:id", auth, async (req, res) => {
  try {
    const item = await LegalDocument.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Không tìm thấy văn bản" });

    const {
      title,
      soHieu,
      loaiVanBan,
      coQuanBanHanh,
      categoryMajor,
      categoryMinor,
      ngayBanHanh,
      ngayHieuLuc,
      ngayHetHieuLuc,
      tinhTrang,
      trichYeu,
      tags,
      fileBase64,
      fileName,
      fileMimeType,
      textContent: textContentInput,
      regenerateOutline
    } = req.body || {};

    if (title !== undefined) item.title = String(title).trim();
    if (soHieu !== undefined) item.soHieu = String(soHieu).trim();
    if (loaiVanBan !== undefined) item.loaiVanBan = String(loaiVanBan).trim();
    if (coQuanBanHanh !== undefined) item.coQuanBanHanh = String(coQuanBanHanh).trim();
    if (categoryMajor !== undefined) item.categoryMajor = String(categoryMajor).trim() || "Khác";
    if (categoryMinor !== undefined) item.categoryMinor = String(categoryMinor).trim();
    if (ngayBanHanh !== undefined) item.ngayBanHanh = safeDate(ngayBanHanh);
    if (ngayHieuLuc !== undefined) item.ngayHieuLuc = safeDate(ngayHieuLuc);
    if (ngayHetHieuLuc !== undefined) item.ngayHetHieuLuc = safeDate(ngayHetHieuLuc);
    if (tinhTrang !== undefined) item.tinhTrang = String(tinhTrang).trim();
    if (trichYeu !== undefined) item.trichYeu = String(trichYeu).trim();
    if (tags !== undefined) item.tags = normalizeTags(tags);

    // replace file
    if (fileBase64) {
      // delete old
      if (item.file && item.file.storagePath) deleteIfExists(item.file.storagePath);

      const saved = saveBase64ToFile({ base64: fileBase64, originalName: fileName, mimeType: fileMimeType });
      if (saved) {
        item.file = {
          originalName: saved.originalName,
          mimeType: saved.mimeType,
          size: saved.size,
          storagePath: saved.storagePath,
          publicUrl: saved.publicUrl
        };

        const extractedText = tryExtractTextFromFile(saved.absPath, saved.mimeType, saved.originalName);
        if (!textContentInput) {
          item.textContent = (extractedText || "").trim();
        }
      }
    }

    if (textContentInput !== undefined) {
      item.textContent = String(textContentInput || "").trim();
    }

    if (regenerateOutline === true || regenerateOutline === "true" || fileBase64 || textContentInput !== undefined) {
      item.outline = buildOutlineFromText(item.textContent);
    }

    await item.save();
    res.json(item);
  } catch (e) {
    console.error("PUT /api/docs/:id error:", e);
    const msg = (e && e.message) || "";
    if (msg && /file|base64|quá lớn|tối đa/i.test(msg)) {
      return res.status(400).json({ message: msg });
    }
    res.status(500).json({ message: "Lỗi server" });
  }
});

/**
 * Xóa văn bản (admin)
 */
router.delete("/:id", auth, async (req, res) => {
  try {
    const item = await LegalDocument.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Không tìm thấy văn bản" });

    if (item.file && item.file.storagePath) deleteIfExists(item.file.storagePath);
    await item.deleteOne();
    res.json({ message: "Đã xoá" });
  } catch (e) {
    console.error("DELETE /api/docs/:id error:", e);
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;
