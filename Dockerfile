# Multi-stage Dockerfile for AlloDeploy Website & Edge Deployment Manager

# ==========================================
# Stage 1: Build Frontend Single Page App
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend

# Install frontend dependencies
COPY frontend/package*.json ./
RUN npm ci || npm install

# Build client distribution
COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Production Engine Runner
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Install backend production dependencies
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev || npm install --omit=dev

# Copy backend source code
COPY backend/ /app/backend/

# Copy compiled frontend assets from frontend-builder
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist

# Ensure persistent storage directories exist
RUN mkdir -p /app/backend/storage/sites /app/backend/storage/backups

# Expose web and edge server port
EXPOSE 5000

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Start AlloDeploy backend engine
CMD ["node", "server.js"]
