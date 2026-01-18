require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const path = require("path");

const User = require("./models/User");
const logRoutes = require("./routes/logRoutes");

const app = express();

// Reverse-proxy friendly (Fly.io / Cloudflare / Nginx...)
// Giúp Express lấy đúng req.ip / x-forwarded-for, và cookie secure hoạt động đúng nếu bạn dùng.
app.set("trust proxy", 1);

// JSON body
// - tăng limit để admin có thể upload file dạng base64 (không dùng multipart)
// - nếu bạn muốn giới hạn chặt hơn, có thể tách riêng endpoint upload.
app.use(express.json({ limit: "100mb" }));
app.use(cookieParser());

// CORS (đặt trước routes)
app.use(
  cors({
    origin: [
      "https://chatiip.com",
      "https://admin.chatiip.com",
      "http://localhost:3000",
      "http://127.0.0.1:5501",
      "http://127.0.0.1:5500",
      "http://localhost:5500"
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// API routes
app.use("/api/logs", logRoutes);




// ⭐ Nếu truy cập admin.chatiip.com → load admin panel luôn
app.use((req, res, next) => {
  const host = req.headers.host;

  if (host && host.startsWith("admin.chatiip.com")) {
    return express.static(path.join(__dirname, "public/admin"))(req, res, next);
  }

  next();
});

// ⭐ STATIC FILES

app.use("/admin", express.static(path.join(__dirname, "public/admin"), { redirect: false }));

// Public uploads (PDF, ...)
app.use("/uploads", express.static(path.join(__dirname, "public/uploads"), { fallthrough: true }));

// Quan trọng: trả về file admin khi truy cập /admin
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin", "index.html"));
});


// ⭐ API
const authRoutes = require("./routes/authRoutes");
const newsRoutes = require("./routes/newsRoutes");
const documentRoutes = require("./routes/documentRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/docs", documentRoutes);
const News = require("./models/News");

// SITEMAP.XML
app.get("/sitemap.xml", async (req, res) => {
  const list = await News.find().sort({ publishedAt: -1 });

  const pages = list.map(item => `
    <url>
      <loc>https://chatiip.com/article.html?slug=${item.slug}</loc>
      <lastmod>${new Date(item.modifiedAt).toISOString()}</lastmod>
      <changefreq>daily</changefreq>
      <priority>0.8</priority>
    </url>
  `).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
      <loc>https://chatiip.com/</loc>
      <changefreq>daily</changefreq>
      <priority>1.0</priority>
    </url>
    <url>
      <loc>https://chatiip.com/news.html</loc>
      <changefreq>daily</changefreq>
      <priority>0.9</priority>
    </url>
    ${pages}
  </urlset>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);
});


// ⭐ CONNECT MONGODB
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✔ MongoDB connected");

    await User.ensureAdminUser(
      process.env.ADMIN_DEFAULT_EMAIL,
      process.env.ADMIN_DEFAULT_PASSWORD
    );
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

// ⭐ START SERVER
const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});



app.get("/rss.xml", async (req, res) => {
  const list = await News.find().sort({ publishedAt: -1 }).limit(50);

  const rssItems = list.map(item => `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>https://chatiip.com/article.html?slug=${item.slug}</link>
      <guid>https://chatiip.com/article.html?slug=${item.slug}</guid>
      <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>
      <description><![CDATA[${item.subtitle || ""}]]></description>
    </item>
  `).join("");

  const xml = `
  <rss version="2.0">
    <channel>
      <title>ChatIIP News</title>
      <link>https://chatiip.com</link>
      <description>Tin tức từ ChatIIP</description>
      ${rssItems}
    </channel>
  </rss>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);
});
