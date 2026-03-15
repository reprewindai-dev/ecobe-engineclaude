import { PrismaClient } from '@prisma/client'
import { withOptimize } from '@prisma/extension-optimize'
import { env } from '../config/env'

const createPrismaClient = () => {
  const baseClient = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

  // Only attach Prisma Optimize when API key is available
  if (env.OPTIMIZE_API_KEY) {
    return baseClient.$extends(
      withOptimize({
        apiKey: env.OPTIMIZE_API_KEY,
      })
    )
  }

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
