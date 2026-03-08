import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof buildPrismaClient> | undefined
}

function buildPrismaClient() {
  const dbUrl = process.env.DATABASE_URL ?? ''
  const isAccelerateUrl = dbUrl.startsWith('prisma://')

  const clientOptions: Record<string, unknown> = {
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  }

  // When DATABASE_URL is a prisma:// Accelerate proxy URL, pass it as accelerateUrl
  // so the client routes queries through Accelerate's edge network.
  // For standard postgres:// URLs, PrismaClient reads the connection from prisma.config.ts.
  if (isAccelerateUrl) {
    clientOptions.accelerateUrl = dbUrl
  }

  return new PrismaClient(clientOptions as any).$extends(withAccelerate())
}

export const prisma = globalForPrisma.prisma ?? buildPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
