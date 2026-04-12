# Canonical engine deploy wrapper.
# Build and run only from ecobe-engine/ so root deploys cannot drift from the
# doctrine-complete engine source of truth.
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app/ecobe-engine
COPY ecobe-engine/package.json ./package.json
COPY ecobe-engine/package-lock.json* ./package-lock.json
RUN npm install --legacy-peer-deps

FROM base AS builder
WORKDIR /app/ecobe-engine
ARG BUILDTIME_DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
ENV DATABASE_URL=${BUILDTIME_DATABASE_URL}
ENV DIRECT_DATABASE_URL=${BUILDTIME_DATABASE_URL}
COPY --from=deps /app/ecobe-engine/node_modules ./node_modules
COPY ecobe-engine/ ./
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app/ecobe-engine
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs ecobe

COPY --from=builder /app/ecobe-engine/dist ./dist
COPY --from=builder /app/ecobe-engine/node_modules ./node_modules
COPY --from=builder /app/ecobe-engine/package.json ./package.json
COPY --from=builder /app/ecobe-engine/prisma ./prisma
COPY --from=builder /app/ecobe-engine/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/ecobe-engine/scripts ./scripts
COPY --from=builder /app/ecobe-engine/data ./data
COPY --from=builder /app/ecobe-engine/node_modules/.prisma ./node_modules/.prisma

RUN chown -R ecobe:nodejs /app
USER ecobe

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.setTimeout(5000, () => process.exit(1));"

CMD ["sh", "-c", "node -e \"if(!process.env.DATABASE_URL){console.error('Missing DATABASE_URL');process.exit(1)}; if(!process.env.DIRECT_DATABASE_URL){console.error('Missing DIRECT_DATABASE_URL');process.exit(1)}\" && npx prisma migrate deploy && node dist/server.js"]
