// ================================
// Shared helpers
// ================================

// Dùng local khi chạy trên localhost, còn lại dùng cùng domain (admin.chatiip.com)
const API_BASE = window.location.hostname === "localhost" ? "http://localhost:4000/api" : "/api";

const $ = (id) => document.getElementById(id);

function showToast(message, ok = true) {
  const toast = $("toast");
  toast.textContent = message;
  toast.style.background = ok ? "#16a34a" : "#dc2626";
  toast.style.display = "block";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toast.style.display = "none";
  }, 2200);
}

function formatDateVN(dateLike) {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.textContent || div.innerText || "").trim();
}

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

async function apiJson(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && data.message) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không đọc được file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

// ================================
// Auth + Tabs
// ================================

const loginView = $("loginView");
const cmsView = $("cmsView");
const loginEmail = $("loginEmail");
const loginPassword = $("loginPassword");
const loginBtn = $("loginBtn");
const loginMessage = $("loginMessage");
const logoutBtn = $("logoutBtn");
const sessionInfo = $("sessionInfo");

function showCMS(user) {
  loginView.classList.add("hidden");
  cmsView.classList.remove("hidden");
  sessionInfo.textContent = user?.email ? `Đăng nhập: ${user.email}` : "";
}

function showLogin() {
  cmsView.classList.add("hidden");
  loginView.classList.remove("hidden");
}

async function checkSession() {
  try {
    const me = await apiJson("/auth/me", { method: "GET" });
    showCMS(me.user);
    return true;
  } catch {
    showLogin();
    return false;
  }
}

async function login() {
  loginMessage.textContent = "";
  try {
    await apiJson("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: loginEmail.value.trim(),
        password: loginPassword.value.trim()
      })
    });
    await checkSession();
    await bootAfterLogin();
  } catch (e) {
    loginMessage.textContent = e.message || "Đăng nhập thất bại";
  }
}

loginBtn.addEventListener("click", login);

logoutBtn.addEventListener("click", async () => {
  try {
    await apiJson("/auth/logout", { method: "POST" });
  } catch {
    // ignore
  }
  showLogin();
});

// Tabs
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const tabPanels = {
  news: $("tab-news"),
  docs: $("tab-docs"),
  logs: $("tab-logs")
};

function setActiveTab(name) {
  tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  Object.entries(tabPanels).forEach(([k, el]) => {
    el.style.display = k === name ? "block" : "none";
  });

  // lazy load
  if (name === "news") loadNewsList();
  if (name === "docs") loadDocsList();
  if (name === "logs") loadLogs();
}

tabButtons.forEach((b) => b.addEventListener("click", () => setActiveTab(b.dataset.tab)));

// ================================
// NEWS MANAGEMENT
// ================================

const editingNewsId = $("editingNewsId");
const newsTitle = $("newsTitle");
const newsSlug = $("newsSlug");
const newsSubtitle = $("newsSubtitle");
const newsImg = $("newsImg");
const newsCategory = $("newsCategory");
const newsApproved = $("newsApproved");
const newsScheduledAt = $("newsScheduledAt");

const newsPageTitle = $("newsPageTitle");
const newsPageDescription = $("newsPageDescription");
const newsPageKeywords = $("newsPageKeywords");
const newsOgImage = $("newsOgImage");
const newsCanonical = $("newsCanonical");

const newsSaveBtn = $("newsSaveBtn");
const newsResetBtn = $("newsResetBtn");
const newsReloadBtn = $("newsReloadBtn");
const newsSaveMessage = $("newsSaveMessage");
const newsSearch = $("newsSearch");
const newsList = $("newsList");

let _newsCache = [];

function resetNewsForm() {
  editingNewsId.value = "";
  newsTitle.value = "";
  newsSlug.value = "";
  newsSubtitle.value = "";
  newsImg.value = "";
  newsCategory.value = "";
  newsApproved.value = "true";
  newsScheduledAt.value = "";

  newsPageTitle.value = "";
  newsPageDescription.value = "";
  newsPageKeywords.value = "";
  newsOgImage.value = "";
  newsCanonical.value = "";

  try {
    tinymce.get("newsContent").setContent("");
  } catch {
    $("newsContent").value = "";
  }
}

function fillNewsForm(n) {
  editingNewsId.value = n._id;
  newsTitle.value = n.title || "";
  newsSlug.value = n.slug || "";
  newsSubtitle.value = n.subtitle || "";
  newsImg.value = n.img || "";
  newsCategory.value = n.category || "";
  newsApproved.value = String(n.approved ?? true);
  newsScheduledAt.value = n.scheduledAt ? String(n.scheduledAt).slice(0, 16) : "";

  newsPageTitle.value = n.pageTitle || "";
  newsPageDescription.value = n.pageDescription || "";
  newsPageKeywords.value = n.pageKeywords || "";
  newsOgImage.value = n.ogImage || "";
  newsCanonical.value = n.canonical || "";

  try {
    tinymce.get("newsContent").setContent(n.content || "");
  } catch {
    $("newsContent").value = n.content || "";
  }
}

function renderNewsList(list) {
  const q = (newsSearch.value || "").trim().toLowerCase();
  const filtered = q
    ? list.filter((n) => (n.title || "").toLowerCase().includes(q) || (n.slug || "").toLowerCase().includes(q))
    : list;

  newsList.innerHTML = "";
  if (!filtered.length) {
    newsList.innerHTML = `<div class="muted">Chưa có tin nào.</div>`;
    return;
  }

  filtered.forEach((n) => {
    const preview = (n.subtitle || stripHtml(n.content || "")).slice(0, 280);
    const statusTag = n.approved ? `<span class="tag ok">Đã duyệt</span>` : `<span class="tag warn">Chưa duyệt</span>`;

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-title">
        ${n.title || "(Không tiêu đề)"}
        <span class="tag">${n.slug || ""}</span>
        ${statusTag}
      </div>
      <div class="item-meta">
        Chuyên mục: <b>${n.category || "(trống)"}</b> • Đăng: ${formatDateVN(n.publishedAt)}
      </div>
      <div class="actions">
        <button class="btn-secondary btn-edit">Sửa</button>
        <button class="btn-danger btn-del">Xoá</button>
        <a class="btn-link" href="https://chatiip.com/article.html?slug=${encodeURIComponent(n.slug)}" target="_blank" rel="noopener">Xem bài</a>
      </div>
      <div class="preview-tip">${preview || "(Không có preview)"}</div>
    `;

    div.querySelector(".btn-edit").addEventListener("click", () => {
      fillNewsForm(n);
      showToast("Đang sửa: " + (n.title || ""));
    });

    div.querySelector(".btn-del").addEventListener("click", async () => {
      if (!confirm("Xoá tin này?")) return;
      try {
        await apiJson(`/news/${n._id}`, { method: "DELETE" });
        showToast("Đã xoá tin ✔");
        await loadNewsList(true);
      } catch (e) {
        showToast(e.message || "Lỗi xoá tin", false);
      }
    });

    newsList.appendChild(div);
  });
}

async function loadNewsList(force = false) {
  if (_newsCache.length && !force) {
    renderNewsList(_newsCache);
    return;
  }
  newsList.innerHTML = "<div class=\"muted\">Đang tải...</div>";
  try {
    const data = await apiJson("/news", { method: "GET", credentials: "include" });
    _newsCache = Array.isArray(data) ? data : [];
    renderNewsList(_newsCache);
  } catch (e) {
    newsList.innerHTML = `<div class="muted">Lỗi tải tin: ${e.message}</div>`;
  }
}

newsReloadBtn.addEventListener("click", () => loadNewsList(true));
newsSearch.addEventListener("input", () => renderNewsList(_newsCache));
newsResetBtn.addEventListener("click", resetNewsForm);

newsSaveBtn.addEventListener("click", async () => {
  newsSaveMessage.textContent = "";
  try {
    const id = editingNewsId.value;
    const title = newsTitle.value.trim();
    if (!title) throw new Error("Vui lòng nhập tiêu đề");

    const slug = (newsSlug.value.trim() || slugify(title)).trim();
    const content = (() => {
      try {
        return tinymce.get("newsContent").getContent();
      } catch {
        return $("newsContent").value;
      }
    })();

    const body = {
      title,
      subtitle: newsSubtitle.value.trim(),
      slug,
      img: newsImg.value.trim(),
      content,
      category: newsCategory.value.trim(),
      approved: newsApproved.value === "true",
      scheduledAt: newsScheduledAt.value ? new Date(newsScheduledAt.value).toISOString() : null,
      pageTitle: newsPageTitle.value.trim(),
      pageDescription: newsPageDescription.value.trim(),
      pageKeywords: newsPageKeywords.value.trim(),
      ogImage: newsOgImage.value.trim(),
      canonical: newsCanonical.value.trim()
    };

    if (id) {
      await apiJson(`/news/${id}`, { method: "PUT", body: JSON.stringify(body) });
      showToast("Đã cập nhật tin ✔");
    } else {
      await apiJson(`/news`, { method: "POST", body: JSON.stringify(body) });
      showToast("Đã tạo tin ✔");
    }

    resetNewsForm();
    await loadNewsList(true);
  } catch (e) {
    newsSaveMessage.textContent = e.message || "Lỗi lưu tin";
    showToast(e.message || "Lỗi lưu tin", false);
  }
});

// ================================
// DOCS MANAGEMENT
// ================================

const categoriesMajor = [
  "Bộ máy hành chính",
  "Tài chính nhà nước",
  "Văn hóa - Xã hội",
  "Tài nguyên - Môi trường",
  "Bất động sản",
  "Xây dựng - Đô thị",
  "Thương mại",
  "Thể thao - Y tế",
  "Giáo dục",
  "Thuế - Phí - Lệ phí",
  "Giao thông - Vận tải",
  "Lao động - Tiền lương",
  "Công nghệ thông tin",
  "Đầu tư",
  "Doanh nghiệp",
  "Khác"
];

const editingDocId = $("editingDocId");
const docTitle = $("docTitle");
const docSoHieu = $("docSoHieu");
const docLoaiVanBan = $("docLoaiVanBan");
const docCoQuan = $("docCoQuan");
const docCategoryMajor = $("docCategoryMajor");
const docCategoryMinor = $("docCategoryMinor");
const docNgayBanHanh = $("docNgayBanHanh");
const docNgayHieuLuc = $("docNgayHieuLuc");
const docNgayHetHieuLuc = $("docNgayHetHieuLuc");
const docTinhTrang = $("docTinhTrang");
const docTags = $("docTags");
const docTrichYeu = $("docTrichYeu");
const docFile = $("docFile");
const docTextContent = $("docTextContent");

const docSaveBtn = $("docSaveBtn");
const docResetBtn = $("docResetBtn");
const docRegenerateOutlineBtn = $("docRegenerateOutlineBtn");
const docSaveMessage = $("docSaveMessage");

const docsReloadBtn = $("docsReloadBtn");
const docsSearch = $("docsSearch");
const docsFilterCategory = $("docsFilterCategory");
const docsFilterStatus = $("docsFilterStatus");
const docsStats = $("docsStats");
const docsList = $("docsList");

// Modal
const docModalBackdrop = $("docModalBackdrop");
const docModalCloseBtn = $("docModalCloseBtn");
const docModalTitle = $("docModalTitle");
const docModalMeta = $("docModalMeta");
const docPanelSummary = $("docPanelSummary");
const docPanelContent = $("docPanelContent");
const docPanelOutline = $("docPanelOutline");
const docPanelDownload = $("docPanelDownload");

let _docsCache = [];

function initCategories() {
  // Form select
  docCategoryMajor.innerHTML = categoriesMajor.map((c) => `<option>${c}</option>`).join("");

  // Filter select
  docsFilterCategory.innerHTML =
    `<option value="">Tất cả lĩnh vực</option>` +
    categoriesMajor.map((c) => `<option value="${c}">${c}</option>`).join("");
}

async function refreshCategoryStats() {
  try {
    const stats = await apiJson(`/docs/stats/categories`, { method: "GET" });
    const map = new Map();
    (Array.isArray(stats) ? stats : []).forEach((x) => map.set(x.categoryMajor, x.count));

    docsFilterCategory.innerHTML =
      `<option value="">Tất cả lĩnh vực</option>` +
      categoriesMajor
        .map((c) => {
          const count = map.get(c) || 0;
          const label = count ? `${c} (${count})` : c;
          return `<option value="${c}">${label}</option>`;
        })
        .join("");
  } catch {
    // ignore
  }
}

function resetDocForm() {
  editingDocId.value = "";
  docTitle.value = "";
  docSoHieu.value = "";
  docLoaiVanBan.value = "";
  docCoQuan.value = "";
  docCategoryMajor.value = "Khác";
  docCategoryMinor.value = "";
  docNgayBanHanh.value = "";
  docNgayHieuLuc.value = "";
  docNgayHetHieuLuc.value = "";
  docTinhTrang.value = "Không xác định";
  docTags.value = "";
  docTrichYeu.value = "";
  docFile.value = "";
  docTextContent.value = "";
  docSaveMessage.textContent = "";
}

function toDateInputValue(dateLike) {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fillDocForm(d) {
  editingDocId.value = d._id;
  docTitle.value = d.title || "";
  docSoHieu.value = d.soHieu || "";
  docLoaiVanBan.value = d.loaiVanBan || "";
  docCoQuan.value = d.coQuanBanHanh || "";
  docCategoryMajor.value = d.categoryMajor || "Khác";
  docCategoryMinor.value = d.categoryMinor || "";
  docNgayBanHanh.value = toDateInputValue(d.ngayBanHanh);
  docNgayHieuLuc.value = toDateInputValue(d.ngayHieuLuc);
  docNgayHetHieuLuc.value = toDateInputValue(d.ngayHetHieuLuc);
  docTinhTrang.value = d.tinhTrang || "Không xác định";
  docTags.value = Array.isArray(d.tags) ? d.tags.join(", ") : "";
  docTrichYeu.value = d.trichYeu || "";
  docTextContent.value = d.textContent || "";
  docFile.value = "";
}

function statusTag(status) {
  if (status === "Còn hiệu lực") return `<span class="tag ok">Còn hiệu lực</span>`;
  if (status === "Hết hiệu lực một phần") return `<span class="tag warn">Hết hiệu lực một phần</span>`;
  if (status === "Hết hiệu lực") return `<span class="tag bad">Hết hiệu lực</span>`;
  return `<span class="tag warn">Không xác định</span>`;
}

function renderDocsList(list) {
  docsList.innerHTML = "";
  if (!list.length) {
    docsList.innerHTML = `<div class="muted">Chưa có văn bản nào.</div>`;
    return;
  }

  list.forEach((d) => {
    const previewRaw = (d.trichYeu || "").trim() || (d.textPreview || "").trim();
    const preview = (previewRaw || "(Không có preview)").slice(0, 360);
    const ngay = formatDateVN(d.ngayBanHanh);
    const meta = [
      d.soHieu ? `Số hiệu: <b>${d.soHieu}</b>` : null,
      d.categoryMajor ? `Lĩnh vực: <b>${d.categoryMajor}</b>` : null,
      ngay ? `Ban hành: <b>${ngay}</b>` : null
    ].filter(Boolean).join(" • ");

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-title">
        ${d.title || "(Không tiêu đề)"}
        ${d.soHieu ? `<span class="tag">${d.soHieu}</span>` : ""}
        ${statusTag(d.tinhTrang)}
      </div>
      <div class="item-meta">${meta}</div>
      <div class="actions">
        <button class="btn-secondary btn-view">Xem</button>
        <button class="btn-secondary btn-edit">Sửa</button>
        <button class="btn-danger btn-del">Xoá</button>
      </div>
      <div class="preview-tip">${preview}</div>
    `;

    div.querySelector(".btn-view").addEventListener("click", () => openDocModal(d.slug));
    div.querySelector(".btn-edit").addEventListener("click", () => {
      fillDocForm(d);
      showToast("Đang sửa văn bản ✔");
    });
    div.querySelector(".btn-del").addEventListener("click", async () => {
      if (!confirm("Xoá văn bản này?")) return;
      try {
        await apiJson(`/docs/${d._id}`, { method: "DELETE" });
        showToast("Đã xoá văn bản ✔");
        await loadDocsList(true);
        if (editingDocId.value === d._id) resetDocForm();
      } catch (e) {
        showToast(e.message || "Lỗi xoá", false);
      }
    });

    docsList.appendChild(div);
  });
}

async function loadDocsList(force = false) {
  const params = new URLSearchParams();
  const s = (docsSearch.value || "").trim();
  const cat = (docsFilterCategory.value || "").trim();
  const st = (docsFilterStatus.value || "").trim();
  if (s) params.set("search", s);
  if (cat) params.set("categoryMajor", cat);
  if (st) params.set("status", st);
  params.set("limit", "50");

  docsList.innerHTML = "<div class=\"muted\">Đang tải...</div>";

  try {
    const res = await apiJson(`/docs?${params.toString()}`, { method: "GET" });
    _docsCache = Array.isArray(res?.data) ? res.data : [];
    docsStats.textContent = `Tổng: ${res.total || _docsCache.length} văn bản • Đang hiển thị: ${_docsCache.length}`;
    renderDocsList(_docsCache);
    refreshCategoryStats();
  } catch (e) {
    docsList.innerHTML = `<div class="muted">Lỗi tải văn bản: ${e.message}</div>`;
  }
}

docsReloadBtn.addEventListener("click", () => loadDocsList(true));
docsSearch.addEventListener("input", () => {
  clearTimeout(loadDocsList._t);
  loadDocsList._t = setTimeout(() => loadDocsList(true), 300);
});
docsFilterCategory.addEventListener("change", () => loadDocsList(true));
docsFilterStatus.addEventListener("change", () => loadDocsList(true));
docResetBtn.addEventListener("click", resetDocForm);

docSaveBtn.addEventListener("click", async () => {
  docSaveMessage.textContent = "";

  try {
    const id = editingDocId.value;
    const title = docTitle.value.trim();
    if (!title) throw new Error("Vui lòng nhập tiêu đề văn bản");

    const payload = {
      title,
      soHieu: docSoHieu.value.trim(),
      loaiVanBan: docLoaiVanBan.value.trim(),
      coQuanBanHanh: docCoQuan.value.trim(),
      categoryMajor: docCategoryMajor.value.trim(),
      categoryMinor: docCategoryMinor.value.trim(),
      ngayBanHanh: docNgayBanHanh.value || null,
      ngayHieuLuc: docNgayHieuLuc.value || null,
      ngayHetHieuLuc: docNgayHetHieuLuc.value || null,
      tinhTrang: docTinhTrang.value.trim(),
      trichYeu: docTrichYeu.value.trim(),
      tags: docTags.value.trim(),
      textContent: docTextContent.value.trim()
    };

    const file = docFile.files && docFile.files[0];
    if (file) {
      docSaveMessage.textContent = "Đang đọc file...";
      const dataUrl = await readFileAsDataURL(file);
      payload.fileBase64 = dataUrl;
      payload.fileName = file.name;
      payload.fileMimeType = file.type || "application/octet-stream";
    }

    docSaveMessage.textContent = "Đang lưu...";

    if (id) {
      await apiJson(`/docs/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("Đã cập nhật văn bản ✔");
    } else {
      await apiJson(`/docs`, { method: "POST", body: JSON.stringify(payload) });
      showToast("Đã tạo văn bản ✔");
    }

    resetDocForm();
    await loadDocsList(true);
  } catch (e) {
    docSaveMessage.textContent = e.message || "Lỗi lưu";
    showToast(e.message || "Lỗi lưu", false);
  }
});

docRegenerateOutlineBtn.addEventListener("click", async () => {
  try {
    const id = editingDocId.value;
    if (!id) throw new Error("Bạn cần chọn 1 văn bản (bấm 'Sửa') rồi mới tạo lại lược đồ.");
    await apiJson(`/docs/${id}`, {
      method: "PUT",
      body: JSON.stringify({ regenerateOutline: true, textContent: docTextContent.value.trim() })
    });
    showToast("Đã tạo lại lược đồ ✔");
    await loadDocsList(true);
  } catch (e) {
    showToast(e.message || "Lỗi", false);
  }
});

// ================================
// DOC MODAL (chi tiết với tab Tóm tắt / Nội dung / Lược đồ / Tải về)
// ================================

function openModal() {
  docModalBackdrop.style.display = "flex";
}

function closeModal() {
  docModalBackdrop.style.display = "none";
}

docModalCloseBtn.addEventListener("click", closeModal);
docModalBackdrop.addEventListener("click", (e) => {
  if (e.target === docModalBackdrop) closeModal();
});

function setDocTab(tabKey) {
  Array.from(document.querySelectorAll(".doc-tab")).forEach((t) => {
    t.classList.toggle("active", t.dataset.docTab === tabKey);
  });
  const panels = {
    summary: docPanelSummary,
    content: docPanelContent,
    outline: docPanelOutline,
    download: docPanelDownload
  };
  Object.entries(panels).forEach(([k, el]) => {
    el.classList.toggle("active", k === tabKey);
  });
}

Array.from(document.querySelectorAll(".doc-tab")).forEach((t) => {
  t.addEventListener("click", () => setDocTab(t.dataset.docTab));
});

function renderTree(nodes) {
  if (!Array.isArray(nodes) || !nodes.length) {
    return `<div class="muted">(Chưa có lược đồ)</div>`;
  }
  const renderNode = (n) => {
    const children = n.children && n.children.length ? `<ul>${n.children.map(renderNode).join("")}</ul>` : "";
    return `<li>${n.label || ""}${children}</li>`;
  };
  return `<div class="tree"><ul>${nodes.map(renderNode).join("")}</ul></div>`;
}

async function openDocModal(slug) {
  try {
    docModalTitle.textContent = "Đang tải...";
    docModalMeta.textContent = "";
    docPanelSummary.innerHTML = "";
    docPanelContent.innerHTML = "";
    docPanelOutline.innerHTML = "";
    docPanelDownload.innerHTML = "";
    setDocTab("summary");
    openModal();

    const d = await apiJson(`/docs/${encodeURIComponent(slug)}`, { method: "GET" });

    docModalTitle.textContent = d.title || "Văn bản";
    docModalMeta.innerHTML = [
      d.soHieu ? `Số hiệu: <b>${d.soHieu}</b>` : null,
      d.loaiVanBan ? `Loại: <b>${d.loaiVanBan}</b>` : null,
      d.coQuanBanHanh ? `Cơ quan: <b>${d.coQuanBanHanh}</b>` : null,
      d.categoryMajor ? `Lĩnh vực: <b>${d.categoryMajor}</b>` : null,
      d.ngayBanHanh ? `Ban hành: <b>${formatDateVN(d.ngayBanHanh)}</b>` : null,
      d.ngayHieuLuc ? `Hiệu lực: <b>${formatDateVN(d.ngayHieuLuc)}</b>` : null
    ].filter(Boolean).join(" • ");

    // Summary
    docPanelSummary.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.6">${
      (d.trichYeu || "(Chưa có trích yếu)")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
    }</div>`;

    // Content
    const content = (d.textContent || "").trim();
    docPanelContent.innerHTML = content
      ? `<pre style="white-space: pre-wrap; line-height: 1.6; margin:0">${content
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</pre>`
      : `<div class="muted">(Chưa có nội dung text. Nếu PDF là scan/ảnh, hãy dán nội dung ở admin để hiển thị)</div>`;

    // Outline
    docPanelOutline.innerHTML = renderTree(d.outline);

    // Download
    if (d.file && d.file.publicUrl) {
      docPanelDownload.innerHTML = `
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
          <a class="btn-primary" style="text-decoration:none; display:inline-block" href="${API_BASE}/docs/${d._id}/download" target="_blank" rel="noopener">⬇️ Tải file</a>
          <span class="muted">${d.file.originalName || ""} • ${(d.file.size || 0) / 1024 / 1024 > 0 ? (d.file.size / 1024 / 1024).toFixed(2) : 0} MB</span>
        </div>
      `;
    } else {
      docPanelDownload.innerHTML = `<div class="muted">(Văn bản chưa có file đính kèm)</div>`;
    }
  } catch (e) {
    docModalTitle.textContent = "Lỗi";
    docPanelSummary.innerHTML = `<div class="muted">${e.message || "Không tải được"}</div>`;
  }
}

// ================================
// LOGS
// ================================

const logsReloadBtn = $("logsReloadBtn");
const logsSearch = $("logsSearch");
const logsLimit = $("logsLimit");
const logsList = $("logsList");

async function loadLogs() {
  logsList.innerHTML = "<div class=\"muted\">Đang tải...</div>";
  const params = new URLSearchParams();
  const q = (logsSearch.value || "").trim();
  if (q) params.set("search", q);
  params.set("page", "1");
  params.set("limit", logsLimit.value || "50");

  try {
    const res = await apiJson(`/logs?${params.toString()}`, { method: "GET" });
    const items = Array.isArray(res?.data) ? res.data : [];
    logsList.innerHTML = "";
    if (!items.length) {
      logsList.innerHTML = `<div class="muted">Không có lịch sử.</div>`;
      return;
    }
    items.forEach((x) => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="item-title">${(x.question || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
        <div class="item-meta">${formatDateVN(x.createdAt)} • ${x.ip || ""}</div>
        <div style="margin-top:8px; white-space:pre-wrap; line-height:1.6">${
          (x.answer || "").slice(0, 450).replace(/</g, "&lt;").replace(/>/g, "&gt;")
        }</div>
      `;
      logsList.appendChild(div);
    });
  } catch (e) {
    logsList.innerHTML = `<div class="muted">Lỗi tải lịch sử: ${e.message}</div>`;
  }
}

logsReloadBtn.addEventListener("click", loadLogs);
logsSearch.addEventListener("input", () => {
  // debounced typing
  clearTimeout(loadLogs._t);
  loadLogs._t = setTimeout(loadLogs, 350);
});
logsLimit.addEventListener("change", loadLogs);

// ================================
// Boot
// ================================

async function bootAfterLogin() {
  // init categories once
  initCategories();
  // Default tab: news
  setActiveTab("news");
  // preloads
  await loadNewsList(true);
}

(async function boot() {
  initCategories();
  const ok = await checkSession();
  if (ok) {
    await bootAfterLogin();
  }
})();
