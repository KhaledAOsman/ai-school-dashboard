# WhatsApp bridge service - needs a Chromium runtime for Puppeteer
# (whatsapp-web.js drives an actual headless browser).
FROM node:20-slim

# Chromium + its runtime dependencies for Puppeteer headless mode.
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

# Session data (so re-linking the QR code isn't needed on every restart)
# is written here - mounted as a named volume in docker-compose.
RUN mkdir -p /app/wwebjs_auth

EXPOSE 3001

CMD ["node", "server.js"]
