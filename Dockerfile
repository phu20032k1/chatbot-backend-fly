# Fly.io-friendly Dockerfile for Express + MongoDB
# Includes tools used by documentRoutes (pdftotext, pandoc)

FROM node:20-bookworm-slim

# System deps for: pdftotext (poppler-utils) + pandoc
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils pandoc \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better build cache)
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund

# App source
COPY . .

ENV NODE_ENV=production

# Fly will route to internal_port (set in fly.toml). We default to 8080 in server.js.
EXPOSE 8080

CMD ["npm", "start"]


