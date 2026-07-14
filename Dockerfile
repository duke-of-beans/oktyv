FROM node:20-slim AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

FROM node:20-slim
RUN apt-get update && apt-get install -y chromium fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libnss3 libxcomposite1 libxdamage1 libxrandr2 xdg-utils --no-install-recommends && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV OKTYV_MODE=asuriq
ENV OKTYV_DATA_DIR=/tmp/oktyv
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts 2>/dev/null || true
COPY --from=builder /build/dist/ ./dist/
RUN mkdir -p /tmp/oktyv/screenshots/temp
EXPOSE 8080
CMD ["node, dist/index.js]