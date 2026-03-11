# Use Node.js 22 Alpine for smaller image size (required by Prisma Accelerate)
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check for https://github.com/nodejs/docker-node/pull/1454
RUN apk add --no-cache libc6-compat
WORKDIR /app/ecobe-engine

# Copy package files scoped to the engine workspace
COPY ecobe-engine/package.json ./package.json
COPY ecobe-engine/package-lock.json* ./package-lock.json
# Install ALL dependencies (including @prisma/client) within the engine workspace
RUN npm ci

# Build the application
FROM base AS builder
WORKDIR /app/ecobe-engine
COPY --from=deps /app/ecobe-engine/node_modules ./node_modules
COPY ecobe-engine ./

# Generate Prisma client FIRST
RUN npx prisma generate

# Build TypeScript (typescript and prisma are available)
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app/ecobe-engine

ENV NODE_ENV production

# Create non-root user with proper home directory
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --ingroup nodejs ecobe

# Copy built application
COPY --from=builder /app/ecobe-engine/dist ./dist
COPY --from=builder /app/ecobe-engine/node_modules ./node_modules
COPY --from=builder /app/ecobe-engine/package.json ./package.json
COPY --from=builder /app/ecobe-engine/prisma ./prisma
# Copy generated Prisma client
COPY --from=builder /app/ecobe-engine/node_modules/.prisma ./node_modules/.prisma

# DO NOT copy .env files in production - use Back4App environment variables

# Set proper permissions
RUN chown -R ecobe:nodejs /app
USER ecobe

# Expose port
EXPOSE 3000

# Health check with proper error handling
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.setTimeout(5000, () => process.exit(1));"

# Start the application DIRECTLY (no npm scripts that might fail)
CMD ["node", "dist/server.js"]
