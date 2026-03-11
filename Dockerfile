# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check for https://github.com/nodejs/docker-node/pull/1454
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
# Install ALL dependencies (including @prisma/client)
RUN npm ci

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client FIRST
RUN npx prisma generate

# Build TypeScript (typescript and prisma are available)
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Create non-root user with proper home directory
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --ingroup nodejs ecobe

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
# Copy generated Prisma client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

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
