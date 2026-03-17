import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Required
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_DATABASE_URL: z.string().optional(), // Direct Neon URL for migrations (bypasses Accelerate)
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Optional
  ELECTRICITY_MAPS_API_KEY: z.string().optional(),
  ELECTRICITY_MAPS_BASE_URL: z.string().default('https://api.electricitymap.org'),
  DEFAULT_MAX_CARBON_G_PER_KWH: z.string().default('400'),
  
  // WattTime
  WATTTIME_USERNAME: z.string().optional(),
  WATTTIME_PASSWORD: z.string().optional(),
  WATTTIME_BASE_URL: z.string().optional(),
  
  // Ember
  EMBER_API_KEY: z.string().optional(),
  EMBER_BASE_URL: z.string().default('https://api.ember-energy.org'),
  
  // EIA
  EIA_API_KEY: z.string().optional(),
  EIA_BASE_URL: z.string().default('https://api.eia.gov'),
  WATTTIME_API_KEY: z.string().optional(),

  // GridStatus.io (curated EIA-930 data with real fuel mix)
  GRIDSTATUS_API_KEY: z.string().optional(),

  // Grid Signal Cache
  GRID_SIGNAL_CACHE_TTL: z.string().default('900'),
  GRID_FEATURE_CACHE_TTL: z.string().default('3600'),

  // Ingestion
  EIA_INGESTION_SCHEDULE: z.string().default('0 */15 * * * *'),
  EIA_BACKFILL_ENABLED: z.string().default('true'),

  // Intelligence / vectors
  UPSTASH_VECTOR_REST_URL: z.string().optional(),
  UPSTASH_VECTOR_REST_TOKEN: z.string().optional(),
  UPSTASH_VECTOR_INDEX_NAME: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPTIMIZE_API_KEY: z.string().optional(),

  // Intelligence jobs / scheduling
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_BASE_URL: z.string().optional(),
  INTELLIGENCE_JOB_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
  INTELLIGENCE_ACCURACY_CRON: z.string().default('*/30 * * * *'),
  INTELLIGENCE_VECTOR_CLEANUP_CRON: z.string().default('0 3 * * *'),
  INTELLIGENCE_CALIBRATION_CRON: z.string().default('15 * * * *'),

  FORECAST_REFRESH_ENABLED: z.string().optional(),
  FORECAST_REFRESH_CRON: z.string().default('*/30 * * * *'),

  // UI (debug)
  UI_ENABLED: z.string().optional(),
  UI_TOKEN: z.string().optional(),

  // External integrations
  ECOBE_ENGINE_URL: z.string().optional(),
  ECOBE_ENGINE_API_KEY: z.string().optional(),

  // DEKES SaaS integration
  DEKES_API_KEY: z.string().optional(),
  DEKES_WEBHOOK_URL: z.string().optional(), // e.g. https://dekes.example.com/api/ecobe/handoff-status
  DEKES_WEBHOOK_SECRET: z.string().optional(),

  // Authentication
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  
  // Stripe Billing
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_GROWTH_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_GROWTH_ANNUAL_PRICE_ID: z.string().optional(),
  STRIPE_ENTERPRISE_PRICE_ID: z.string().optional(),
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
  FORECAST_REFRESH_ENABLED:
    parsed.data.FORECAST_REFRESH_ENABLED !== undefined
      ? parsed.data.FORECAST_REFRESH_ENABLED === 'true'
      : parsed.data.NODE_ENV !== 'test',
  FORECAST_REFRESH_CRON: parsed.data.FORECAST_REFRESH_CRON,
  INTELLIGENCE_ACCURACY_CRON: parsed.data.INTELLIGENCE_ACCURACY_CRON,
  INTELLIGENCE_VECTOR_CLEANUP_CRON: parsed.data.INTELLIGENCE_VECTOR_CLEANUP_CRON,
  INTELLIGENCE_CALIBRATION_CRON: parsed.data.INTELLIGENCE_CALIBRATION_CRON,
}

export type Env = typeof env
