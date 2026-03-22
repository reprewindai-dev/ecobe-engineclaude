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
ARG ECOBE_API_URL="http://localhost:3000"
ENV ECOBE_API_URL=${ECOBE_API_URL}
# NEXT_PUBLIC_ECOBE_API_URL: Client-side API URL (baked into build)
# Default to relative path to use server-side rewrite proxy.
# Override with full URL for direct client-to-engine calls if needed.
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

RUN chown -R nextjs:nodejs /app
USER nextjs

# Next.js server listens on port 3000 by default
EXPOSE 3000

ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
