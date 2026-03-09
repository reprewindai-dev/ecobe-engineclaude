import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    // Use DIRECT_URL when DATABASE_URL is a prisma:// Accelerate proxy — migrations must hit Postgres directly.
    // In dev, both are typically the same postgres:// URL.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
})
