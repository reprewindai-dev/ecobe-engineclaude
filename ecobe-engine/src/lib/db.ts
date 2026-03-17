import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { withOptimize } from '@prisma/extension-optimize'
import { env } from '../config/env'

/**
 * Prisma Client Factory — Accelerate + Optimize
 *
 * Extension chain order matters (Prisma docs):
 *   1. Optimize (query monitoring / insights)  — applied first
 *   2. Accelerate (connection pooling + cache)  — applied last (takes precedence)
 *
 * Runtime queries flow through Accelerate's global pool via prisma:// URL.
 * Migrations / introspection use DIRECT_DATABASE_URL via prisma.config.ts.
 */
const createPrismaClient = () => {
  const baseClient = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

  // Build the extension chain: Optimize → Accelerate
  // Both are optional — the engine boots cleanly without either.
  let client: any = baseClient

  // 1. Optimize (query monitoring) — only when API key is present
  if (env.OPTIMIZE_API_KEY) {
    client = client.$extends(
      withOptimize({
        apiKey: env.OPTIMIZE_API_KEY,
      })
    )
  }

  // 2. Accelerate (connection pooling + global cache) — only when using prisma:// or prisma+postgres:// URL
  if (env.DATABASE_URL.startsWith('prisma://') || env.DATABASE_URL.startsWith('prisma+postgres://')) {
    client = client.$extends(withAccelerate())
  }

  return client
}

type PrismaClientWithExtensions = ReturnType<typeof createPrismaClient>

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientWithExtensions | undefined
}

export const prisma: PrismaClientWithExtensions = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
