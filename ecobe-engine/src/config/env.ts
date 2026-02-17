import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Required
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Optional
  ELECTRICITY_MAPS_API_KEY: z.string().optional(),
  ELECTRICITY_MAPS_BASE_URL: z.string().default('https://api.electricitymap.org'),
  DEFAULT_MAX_CARBON_G_PER_KWH: z.string().default('400'),

  // DEKES Integration
  DEKES_API_URL: z.string().optional(),
  DEKES_API_KEY: z.string().optional(),

  // UI (debug)
  UI_ENABLED: z.string().optional(),
  UI_TOKEN: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(JSON.stringify(parsed.error.format(), null, 2))
  process.exit(1)
}

export const env = {
  ...parsed.data,
  DEFAULT_MAX_CARBON_G_PER_KWH: parseInt(parsed.data.DEFAULT_MAX_CARBON_G_PER_KWH),
  PORT: parseInt(parsed.data.PORT),
  UI_ENABLED:
    parsed.data.UI_ENABLED !== undefined
      ? parsed.data.UI_ENABLED === 'true'
      : parsed.data.NODE_ENV !== 'production',
}

export type Env = typeof env
