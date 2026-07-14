FROM node:20-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && \
    npm rebuild better-sqlite3 2>/dev/null || true
COPY src/ ./src/
COPY tsconfig.json ./
RUN npx tsc && \
    node --input-type=commonjs -e "const{cpSync,readdirSync,statSync,mkdirSync}=require('fs');const p=require('path');function walk(d,r=[]){readdirSync(d).forEach(f=>{const fp=p.join(d,f);statSync(fp).isDirectory()?walk(fp,r):fp.match(/\.(sql|html|css|txt)$/)&&r.push(fp)});return r}walk('src').forEach(f=>{const d=f.replace(/^src/,'dist');mkdirSync(p.dirname(d),{recursive:true});cpSync(f,d);console.log('asset:',f)})"

# ── Production image ──────────────────────────────────────────────────────
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

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV OKTYV_MODE=asuriq
ENV OKTYV_DATA_DIR=/tmp/oktyv

WORKDIR /app

# Production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && \
    npm rebuild better-sqlite3 2>/dev/null || true

# Copy compiled output from builder
COPY --from=builder /app/dist/ ./dist/

RUN mkdir -p /tmp/oktyv/screenshots/temp

EXPOSE 8080
CMD ["node", "dist/index.js"]
