# ==========================================================
# Backend API & Worker - Production Dockerfile
# ==========================================================

# Stage 1: Dependencies and Prisma client generation
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json* ./
RUN \
  if [ -f package-lock.json ]; then npm ci; \
  else npm install; \
  fi

# Copy Prisma schema and generate engine
COPY prisma ./prisma/
RUN npx prisma generate

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat curl

ENV NODE_ENV=production
ENV PORT=5000

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy installed node_modules with pregenerated Prisma client
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json

# Copy application source code
COPY --chown=nodejs:nodejs src ./src

USER nodejs

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

CMD ["node", "src/server.js"]

