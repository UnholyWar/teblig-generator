# ----------------------------------------------------
# 🧱 Aşama 1: Puppeteer uyumlu Node.js tabanlı ortam
# ----------------------------------------------------
FROM node:20-slim

# Puppeteer bağımlılıkları (Chrome için gerekli)
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# ----------------------------------------------------
# 📦 Çalışma dizini
# ----------------------------------------------------
WORKDIR /app

# ----------------------------------------------------
# 📁 Dosyaları kopyala
# ----------------------------------------------------
COPY package*.json ./
RUN npm install

COPY . .

# ----------------------------------------------------
# 🌍 Ortam değişkenleri
# ----------------------------------------------------
ENV PORT=3000
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# ----------------------------------------------------
# 🔥 Uygulama portunu aç
# ----------------------------------------------------
EXPOSE 3000

# ----------------------------------------------------
# 🚀 Çalıştırma komutu
# ----------------------------------------------------
CMD ["node", "server.js"]
