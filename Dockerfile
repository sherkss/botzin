# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24-slim AS builder
WORKDIR /app

COPY package*.json .npmrc ./
# Dev deps needed to compile (typescript, vite, tsx types).
# ignore-scripts is safe here: sharp/onnxruntime are not used by config-server.
RUN npm ci --ignore-scripts

# Prisma generates its client into node_modules — must run before tsc.
COPY prisma/ ./prisma/
RUN npx prisma generate

# Build frontend (outputs to /app/public).
COPY frontend/ ./frontend/
RUN npm run frontend:build

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc -p tsconfig.json

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:24-slim AS runner
WORKDIR /app

COPY package*.json .npmrc ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY public/ ./public/
COPY database/ ./database/
COPY docker/entrypoint.sh /entrypoint.sh

# Storage dir for video uploads (typically overridden by a named volume).
RUN mkdir -p storage/learning-sources/videos && chmod +x /entrypoint.sh

EXPOSE 4580

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/web/config-server.js"]
