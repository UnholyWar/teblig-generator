const express = require("express");
const multer = require("multer");
const fs = require("fs-extra");
const path = require("path");
const XLSX = require("xlsx");
const puppeteer = require("puppeteer");
const archiver = require("archiver");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));

let progressData = { percent: 0, message: "Hazır", ready: false };

// 📡 Progress endpoint
app.get("/progress", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    const interval = setInterval(() => {
        res.write(`data: ${JSON.stringify(progressData)}\n\n`);
    }, 500);
    req.on("close", () => clearInterval(interval));
});

// 🏠 Ana sayfa
app.get("/", async (req, res) => {
    const templatesPath = path.join(__dirname, "public/templates");
    const files = await fs.readdir(templatesPath);
    const htmlTemplates = files.filter(f => f.endsWith(".html"));

    res.send(`
  <html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <title>Tebliğ Generator</title>
    <style>
      body {
        font-family: Arial;
        padding: 40px;
        background: #f8f9fa;
        display: flex;
        justify-content: center;
      }
      form {
        background: #fff;
        padding: 25px;
        border-radius: 10px;
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
        width: 420px;
        position: relative;
      }
      label {
        display: block;
        margin-top: 15px;
        font-weight: bold;
      }
      input, select {
        width: 100%;
        margin-top: 5px;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 5px;
      }
      button {
        margin-top: 20px;
        width: 100%;
        padding: 10px;
        background: #0d6efd;
        color: #fff;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 16px;
      }
      button:hover { background: #0b5ed7; }

      #progress {
        margin-top: 15px;
        width: 100%;
        height: 20px;
        background: #eee;
        border-radius: 5px;
        overflow: hidden;
        display: none;
      }
      #bar {
        width: 0%;
        height: 100%;
        background: #0d6efd;
        transition: width 0.3s;
      }
      #downloadBtn {
        display: none;
        margin-top: 20px;
        background: #198754;
      }
      #downloadBtn:hover {
        background: #157347;
      }
    </style>
  </head>
  <body>
    <form id="form" enctype="multipart/form-data">
      <h2>📄 Tebliğ Mazbatası Generator</h2>
      <label>Excel Dosyası:</label>
      <input type="file" name="excel" accept=".xlsx" required />

      <label>HTML Şablon Seç:</label>
      <select name="template" required>
        ${htmlTemplates.map(f => `<option value="${f}">${f}</option>`).join("")}
      </select>

      <button type="submit">Oluştur</button>

      <div id="progress"><div id="bar"></div></div>
      <p id="status"></p>

      <button id="downloadBtn" type="button">📦 PDF'leri ZIP olarak indir</button>
    </form>

    <script>
      const form = document.getElementById("form");
      const progress = document.getElementById("progress");
      const bar = document.getElementById("bar");
      const status = document.getElementById("status");
      const downloadBtn = document.getElementById("downloadBtn");

      form.addEventListener("submit", async (e) => {
        e.preventDefault(); // Sayfa yenilenmesin
        progress.style.display = "block";
        bar.style.width = "20%";
        status.textContent = "İşlem başlatıldı...";
        downloadBtn.style.display = "none";

        const formData = new FormData(form);
        await fetch("/generate", {
          method: "POST",
          body: formData
        });
      });

      const source = new EventSource("/progress");
      source.onmessage = (e) => {
        const data = JSON.parse(e.data);
        bar.style.width = data.percent + "%";
        status.textContent = data.message;

        if (data.ready) {
          downloadBtn.style.display = "block";
          status.textContent = "✅ PDF'ler hazır, indirilmeye hazır!";
        }
      };

      downloadBtn.addEventListener("click", () => {
        window.location.href = "/output/result.zip";
        downloadBtn.style.display = "none";
        status.textContent = "📦 ZIP indiriliyor...";
        setTimeout(() => {
          fetch("/cleanup");
          status.textContent = "🧹 Geçici dosyalar temizlendi.";
        }, 15000);
      });
    </script>
  </body>
  </html>
  `);
});

// 📄 PDF oluşturma
app.post("/generate", upload.single("excel"), async (req, res) => {
    try {
        const templateName = req.body.template;
        const templatePath = path.join("public/templates", templateName);
        let htmlTemplate = await fs.readFile(templatePath, "utf8");

        const workbook = XLSX.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);

        const outputDir = path.join(__dirname, "public", "output");
        await fs.ensureDir(outputDir);
        await fs.emptyDir(outputDir);

        const browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });
        const page = await browser.newPage();

        const total = rows.length;
        const pdfFiles = [];

        for (let i = 0; i < total; i++) {
            let html = htmlTemplate;

            // 🧩 Excel değişkenlerini yerleştir
            for (const [key, value] of Object.entries(rows[i])) {
                html = html.replace(new RegExp(`{{${key}}}`, "g"), value || "");
            }

            // 🖼️ Görselleri base64 inline hale getir (background + img)
            html = html.replace(/url\(['"]?(.*?)['"]?\)/g, (match, src) => {
                if (src.startsWith("http") || src.startsWith("data:")) return match;
                try {
                    const imgPath = path.join(__dirname, "public", "templates", src);
                    if (fs.existsSync(imgPath)) {
                        const mime = src.endsWith(".png") ? "image/png" : "image/jpeg";
                        const base64 = fs.readFileSync(imgPath, { encoding: "base64" });
                        return `url('data:${mime};base64,${base64}')`;
                    }
                } catch (err) {
                    console.error("⚠️ Background image yüklenemedi:", src, err.message);
                }
                return match;
            });

            html = html.replace(/<img[^>]+src=['"]([^'"]+)['"][^>]*>/g, (match, src) => {
                if (src.startsWith("http") || src.startsWith("data:")) return match;
                try {
                    const imgPath = path.join(__dirname, "public", "templates", src);
                    if (fs.existsSync(imgPath)) {
                        const mime = src.endsWith(".png") ? "image/png" : "image/jpeg";
                        const base64 = fs.readFileSync(imgPath, { encoding: "base64" });
                        return match.replace(src, `data:${mime};base64,${base64}`);
                    }
                } catch (err) {
                    console.error("⚠️ <img> yüklenemedi:", src, err.message);
                }
                return match;
            });

            const fileName = `${templateName.replace(".html", "")}_${i + 1}.pdf`;
            const outPath = path.join(outputDir, fileName);

            await page.goto("about:blank");
            await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 0 });
            await page.pdf({ path: outPath, format: "A4", printBackground: true });
            pdfFiles.push(outPath);

            const percent = Math.round(((i + 1) / total) * 100);
            progressData = { percent, message: `${i + 1}/${total} tamamlandı`, ready: false };
            console.log(progressData.message);
        }

        await browser.close();

        // 🔹 ZIP oluştur
        const zipPath = path.join(outputDir, "result.zip");
        const output = fs.createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.pipe(output);
        pdfFiles.forEach(f => archive.file(f, { name: path.basename(f) }));
        await archive.finalize();

        progressData = { percent: 100, message: "✅ PDF'ler hazır!", ready: true };
        res.status(200).end();

    } catch (err) {
        console.error("❌ Hata:", err);
        res.status(500).send("Bir hata oluştu: " + err.message);
    }
});

// 🧹 Manuel temizlik endpoint
app.get("/cleanup", async (req, res) => {
    const outputDir = path.join(__dirname, "public", "output");
    await fs.emptyDir(outputDir);
    progressData = { percent: 0, message: "Hazır", ready: false };
    console.log("🧹 output klasörü temizlendi.");
    res.send("Temizlik tamamlandı");
});

// 🚀 Sunucu
app.listen(3000, () => {
    console.log("✅ Tebliğ Generator (Base64 + Manuel Download) çalışıyor: http://localhost:3000");
});
