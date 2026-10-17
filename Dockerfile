
FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend


COPY frontend/package*.json ./
RUN npm ci || npm install

COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app


ENV NODE_ENV=production
ENV PORT=5000

COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev || npm install --omit=dev


COPY backend/ /app/backend/


COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist

RUN mkdir -p /app/backend/storage/sites /app/backend/storage/backups

EXPOSE 5000


HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

CMD ["node", "server.js"]
