FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ECOBE_API_URL: Server-side rewrite URL (used by next.config.js rewrites)
# Provide at build time for deployment. Default to localhost for development.
# ECOBE engine URL — used by next.config.js rewrites at build time
# Railway env var overrides this default
ARG ECOBE_API_URL="https://ecobe-engineclaude-production.up.railway.app"
ENV ECOBE_API_URL=${ECOBE_API_URL}
# Client-side API URL — uses server-side rewrite proxy (relative path)
ARG NEXT_PUBLIC_ECOBE_API_URL="/api/ecobe"
ENV NEXT_PUBLIC_ECOBE_API_URL=${NEXT_PUBLIC_ECOBE_API_URL}
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone output includes server + minimal node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

RUN chown -R nextjs:nodejs /app
USER nextjs

# Railway sets PORT dynamically at runtime
EXPOSE 3000

ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
