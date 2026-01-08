const mongoose = require("mongoose");

const newsSchema = new mongoose.Schema(
  {
    // Nội dung chính
    title: { type: String, required: true },
    subtitle: { type: String },
    slug: { type: String, required: true, unique: true },
    img: { type: String },
    content: { type: String },

    // SEO mở rộng
    pageTitle: { type: String },
    pageDescription: { type: String },
    pageKeywords: { type: String },
    pageHeading: { type: String },
    ogImage: { type: String },
    canonical: { type: String },

    // Thuộc tính quản lý
    category: { type: String },
    approved: { type: Boolean, default: true },
    scheduledAt: { type: Date },

    // Thời gian
    publishedAt: { type: Date, default: Date.now },
    modifiedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model("News", newsSchema);
