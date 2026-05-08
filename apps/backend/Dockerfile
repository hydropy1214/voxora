FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++

# ─── Dependencies ───────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production && cp -r node_modules /tmp/prod_modules
RUN npm ci

# ─── Builder ────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ─── Development ────────────────────────────────────────────────────
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
EXPOSE 3001
CMD ["npm", "run", "start:dev"]

# ─── Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=deps --chown=nestjs:nodejs /tmp/prod_modules ./node_modules

RUN mkdir -p /app/uploads/audio && chown -R nestjs:nodejs /app/uploads

USER nestjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
