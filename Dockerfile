FROM node:20-slim

# Chromium dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Skip Puppeteer's Chromium download — use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV OKTYV_MODE=asuriq
ENV OKTYV_DATA_DIR=/tmp/oktyv

WORKDIR /app

# Install production deps only. better-sqlite3 may fail on Linux
# (fine — asuriq mode uses Supabase for cron). @napi-rs/keyring
# also optional (vault not used in asuriq mode).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && \
    npm rebuild better-sqlite3 2>/dev/null || true

# Copy compiled output
COPY dist/ ./dist/

# Create temp directories
RUN mkdir -p /tmp/oktyv/screenshots/temp

EXPOSE 8080
CMD ["node", "dist/index.js"]
