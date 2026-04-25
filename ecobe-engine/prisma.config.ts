import 'dotenv/config'
import { defineConfig } from '@prisma/config'

function normalizeDatabaseUrl(url: string) {
  try {
    const parsed = new URL(url)

    if (!parsed.port && parsed.hostname.includes(';')) {
      const [hostname, port] = parsed.hostname.split(';')
      if (hostname && /^\d+$/.test(port ?? '')) {
        parsed.hostname = hostname
        parsed.port = port
      }
    }

    return parsed.toString()
  } catch {
    return url.replace(/(@[^/?#:]+);(\d+)(?=\/|\?|#|$)/, '$1:$2')
  }
}

/**
 * Prisma Config — Accelerate-aware
 *
 * Runtime:    DATABASE_URL (prisma://accelerate...) → connection pooling + cache
 * Migrations: DIRECT_DATABASE_URL (postgresql://...) → direct Neon connection
 *
 * If DIRECT_DATABASE_URL is not set, falls back to DATABASE_URL
 * (which works fine when DATABASE_URL is a direct postgres:// string).
 */
export default defineConfig({
  datasource: {
    url: normalizeDatabaseUrl(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || ''),
  },
})
