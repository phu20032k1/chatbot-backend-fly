const mongoose = require("mongoose");

/**
 * LegalDocument
 * - Lưu metadata + file văn bản pháp luật (PDF/DOCX/...) để tra cứu
 * - textContent: nội dung text đã trích xuất (nếu có)
 * - outline: lược đồ/ cấu trúc (JSON) để hiển thị dạng cây
 */

const fileSchema = new mongoose.Schema(
  {
    originalName: { type: String },
    mimeType: { type: String },
    size: { type: Number },
    storagePath: { type: String }, // đường dẫn lưu trên server (vd: public/uploads/docs/xxx.pdf)
    publicUrl: { type: String } // url public (vd: /uploads/docs/xxx.pdf)
  },
  { _id: false }
);

const outlineNodeSchema = new mongoose.Schema(
  {
    label: { type: String },
    key: { type: String },
    children: { type: [Object], default: [] }
  },
  { _id: false }
);

const legalDocumentSchema = new mongoose.Schema(
  {
    // Hiển thị
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },

    // Thông tin văn bản
    soHieu: { type: String },
    loaiVanBan: { type: String },
    coQuanBanHanh: { type: String },

    // Phân loại (mục lớn / mục con)
    categoryMajor: { type: String, default: "Khác" },
    categoryMinor: { type: String, default: "" },

    // Thời gian
    ngayBanHanh: { type: Date },
    ngayHieuLuc: { type: Date },
    ngayHetHieuLuc: { type: Date },

    // Trạng thái
    tinhTrang: {
      type: String,
      enum: ["Còn hiệu lực", "Hết hiệu lực", "Hết hiệu lực một phần", "Không xác định"],
      default: "Không xác định"
    },

    // Trích yếu / mô tả / từ khóa
    trichYeu: { type: String, default: "" },
    tags: { type: [String], default: [] },

    // Dữ liệu trích xuất
    textContent: { type: String, default: "" },
    outline: { type: [outlineNodeSchema], default: [] },

    // File
    file: { type: fileSchema, default: null }
  },
  { timestamps: true }
);

legalDocumentSchema.index({ title: "text", soHieu: "text", trichYeu: "text", textContent: "text" });

module.exports = mongoose.model("LegalDocument", legalDocumentSchema);
