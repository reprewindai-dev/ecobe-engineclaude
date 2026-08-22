import { PrismaClient } from '@prisma/client'
import { env } from '../config/env'

/**
 * Ensure Neon pooler URLs have pgbouncer=true for Prisma compatibility.
 * Neon's pooler uses PgBouncer under the hood; without this flag Prisma's
 * prepared-statement protocol conflicts with PgBouncer's transaction mode,
 * causing "Connection Closed" errors on idle connections.
 */
function ensureNeonPoolerParams(url: string): string {
  if (!url.includes('pooler') && !url.includes('pgbouncer')) return url
  try {
    const parsed = new URL(url)
    if (!parsed.searchParams.has('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true')
    }
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', '5')
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', '20')
    }
    return parsed.toString()
  } catch {
    return url
  }
}

/**
 * Prisma Client Factory.
 *
 * The engine uses the configured PostgreSQL connection directly. Paid Prisma
 * extensions are intentionally excluded so the canonical runtime has no
 * hidden metering dependency and remains compatible with free PostgreSQL
 * providers and self-hosted deployments.
 */
const createPrismaClient = () => {
  const dbUrl = ensureNeonPoolerParams(env.DATABASE_URL)

  const baseClient = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: dbUrl,
      },
    },
  })

  return baseClient
}

type PrismaClientWithExtensions = ReturnType<typeof createPrismaClient>

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientWithExtensions | undefined
}

export const prisma: PrismaClientWithExtensions = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
