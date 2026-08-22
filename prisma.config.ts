import 'dotenv/config'
import { defineConfig } from '@prisma/config'

/**
 * Prisma Config — direct PostgreSQL
 *
 * Runtime:    DATABASE_URL (postgresql://...)
 * Migrations: DIRECT_DATABASE_URL (postgresql://...)
 *
 * If DIRECT_DATABASE_URL is not set, falls back to DATABASE_URL
 * so free-tier and self-hosted PostgreSQL deployments use the same contract.
 */
export default defineConfig({
  datasource: {
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '',
  },
})
