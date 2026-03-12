import { PrismaClient } from '@prisma/client'
import { withOptimize } from '@prisma/extension-optimize'
import { env } from '../config/env'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prismaBase = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

export const prisma =
  globalForPrisma.prisma ??
  prismaBase.$extends(
    withOptimize({
      apiKey: env.OPTIMIZE_API_KEY,
    })
  )

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
