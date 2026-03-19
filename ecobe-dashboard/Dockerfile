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
# ECOBE_API_URL must be set at build time for next.config.js rewrites
ARG ECOBE_API_URL="https://ecobe-engineclaude-production.up.railway.app"
ENV ECOBE_API_URL=${ECOBE_API_URL}
# NEXT_PUBLIC_ prefix makes this available to client-side code (baked at build time)
ARG NEXT_PUBLIC_ECOBE_API_URL="https://ecobe-engineclaude-production.up.railway.app/api/v1"
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

RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
