FROM node:24-slim

ENV NODE_ENV=production \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Shared libraries Chrome needs, plus fonts. The fonts are functional, not cosmetic: every endpoint
# renders text into a PNG, and without them Chrome silently draws tofu boxes rather than failing.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        fonts-liberation \
        fonts-noto-color-emoji \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libglib2.0-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libx11-6 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies before source, so editing a template or index.ts does not re-download Chrome.
# Puppeteer's postinstall fetches a version-matched Chrome into PUPPETEER_CACHE_DIR here, baking it
# into this layer so the container never downloads a browser at boot.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# None of these three are in the build context, so they must be created, not just chowned.
# data/ holds only metadata.json, which updateMetaData() rewrites at startup; shipping the committed
# copy would bust this layer's cache hourly for a file that is immediately overwritten.
# cacheDir is not volume-backed and puppeteer.launch() writes to it before app.listen() runs, so a
# missing or root-owned directory is a boot failure rather than a degraded request.
# CharIcons is normally bind-mounted, which masks this directory and takes the host's ownership.
# It is created anyway so the image still runs standalone, without the mount.
RUN mkdir -p /app/public/CharIcons /app/cacheDir /app/data \
    && chown -R node:node /app/public/CharIcons /app/cacheDir /app/data

USER node

# No --env-file: Compose supplies the environment.
CMD ["node", "index.ts"]
