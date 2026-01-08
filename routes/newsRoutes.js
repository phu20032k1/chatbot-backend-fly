const express = require("express");
const News = require("../models/News");
const auth = require("../middleware/auth");

const router = express.Router();

// ==============================
// PUBLIC: Lấy danh sách tin
// ==============================
router.get("/", async (req, res) => {
  const list = await News.find().sort({ publishedAt: -1 });
  res.json(list);
});

// ==============================
// PUBLIC: Lấy bài theo chuyên mục
// ==============================
router.get("/category/:cat", async (req, res) => {
  try {
    const cat = req.params.cat;
    const list = await News.find({ category: cat }).sort({ publishedAt: -1 });
    res.json(list);
  } catch (e) {
    console.error("Category error:", e);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// ==============================
// PUBLIC: Lấy tin theo slug
// ==============================
router.get("/:slug", async (req, res) => {
  const item = await News.findOne({ slug: req.params.slug });
  if (!item) {
    return res.status(404).json({ message: "Không tìm thấy bài viết" });
  }
  res.json(item);
});

// ==============================
// ADMIN: THÊM BÀI VIẾT
// ==============================
router.post("/", auth, async (req, res) => {
  const {
    title, subtitle, slug, img, content,
    pageTitle, pageDescription, pageKeywords,
    pageHeading, ogImage, canonical,
    category, approved, scheduledAt
  } = req.body;

  if (!title || !slug) {
    return res.status(400).json({ message: "Thiếu dữ liệu" });
  }

  const existed = await News.findOne({ slug });
  if (existed) {
    return res.status(400).json({ message: "Slug đã tồn tại" });
  }

  const now = new Date();

  const news = await News.create({
    title,
    subtitle,
    slug,
    img,
    content,

    // SEO
    pageTitle,
    pageDescription,
    pageKeywords,
    pageHeading,
    ogImage,
    canonical,

    // Quản trị
    category,
    approved: approved !== undefined ? approved : true,
    scheduledAt: scheduledAt || null,

    publishedAt: now,
    modifiedAt: now
  });

  res.status(201).json(news);
});

// ==============================
// ADMIN: SỬA BÀI VIẾT
// ==============================
router.put("/:id", auth, async (req, res) => {
  const item = await News.findById(req.params.id);
  if (!item) {
    return res.status(404).json({ message: "Không tìm thấy bài viết" });
  }

  const {
    title, subtitle, slug, img, content,
    pageTitle, pageDescription, pageKeywords,
    pageHeading, ogImage, canonical,
    category, approved, scheduledAt
  } = req.body;

  // Đổi slug nếu có
  if (slug && slug !== item.slug) {
    const existed = await News.findOne({ slug });
    if (existed) {
      return res.status(400).json({ message: "Slug đã tồn tại" });
    }
    item.slug = slug;
  }

  // Cập nhật thông tin
  if (title) item.title = title;
  item.subtitle = subtitle;
  item.img = img;
  item.content = content;

  if (category !== undefined) item.category = category;
  if (approved !== undefined) item.approved = approved;
  if (scheduledAt !== undefined) item.scheduledAt = scheduledAt;

  // Cập nhật SEO
  item.pageTitle = pageTitle;
  item.pageDescription = pageDescription;
  item.pageKeywords = pageKeywords;
  item.pageHeading = pageHeading;
  item.ogImage = ogImage;
  item.canonical = canonical;

  item.modifiedAt = new Date();

  await item.save();
  res.json(item);
});

// ==============================
// ADMIN: XOÁ BÀI
// ==============================
router.delete("/:id", auth, async (req, res) => {
  const item = await News.findById(req.params.id);
  if (!item) {
    return res.status(404).json({ message: "Không tìm thấy bài" });
  }

  await item.deleteOne();
  res.json({ message: "Đã xoá" });
});

module.exports = router;
