import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Required
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Prisma Accelerate — direct DB URL used for migrations when DATABASE_URL is a prisma:// proxy URL
  DIRECT_URL: z.string().optional(),

  // Governance
  GOVERNANCE_AUDIT_ENABLED: z.string().default('true'),
  GOVERNANCE_CHAIN_VERIFY: z.string().default('false'),

  // Optional — carbon data layer
  ELECTRICITY_MAPS_API_KEY: z.string().optional(),
  ELECTRICITY_MAPS_BASE_URL: z.string().default('https://api.electricitymap.org'),
  DEFAULT_MAX_CARBON_G_PER_KWH: z.string().default('400'),

  // Multi-provider carbon layer
  EMBER_ENERGY_API_KEY: z.string().optional(),
  EMBER_BASE_URL: z.string().optional(),
  WATTTIME_API_KEY: z.string().optional(),
  CARBON_PROVIDER_PRIMARY: z.string().default('electricity_maps'),
  CARBON_PROVIDER_VALIDATION: z.string().optional(),
  CARBON_PROVIDER_ALLOW_FALLBACK: z.string().default('true'),
  CARBON_PROVIDER_MAX_STALENESS_MINUTES: z.string().default('10'),
  CARBON_PROVIDER_DISAGREEMENT_THRESHOLD_PCT: z.string().default('15'),
  CARBON_PROVIDER_DEV_DIAGNOSTICS: z.string().optional(),
  CARBON_PROVIDER_EM_ROLE: z.string().optional(),
  CARBON_PROVIDER_EMBER_ROLE: z.string().optional(),
  CARBON_PROVIDER_WATTTIME_ROLE: z.string().optional(),

  FORECAST_REFRESH_ENABLED: z.string().optional(),
  FORECAST_REFRESH_CRON: z.string().default('*/30 * * * *'),

  // UI (debug)
  UI_ENABLED: z.string().optional(),
  UI_TOKEN: z.string().optional(),

  // External integrations / self-referential API key
  CO2ROUTER_URL: z.string().optional(),
  CO2ROUTER_API_KEY: z.string().optional(),

  // Dev-only escape hatch: allow unauthenticated access when no API key is configured.
  // NEVER set to true in production.
  ALLOW_INSECURE_NO_API_KEY: z.string().optional(),

  // Electricity Maps — forecast horizon hours (24, 48, or 72; default: 24)
  // Higher values require a higher-tier API plan.
  EM_FORECAST_HORIZON_HOURS: z.enum(['24', '48', '72']).optional(),

  // EIA-930 Open Data API (https://www.eia.gov/opendata/)
  // Rate limit: 1000 req/hour per key. Required for grid signal intelligence.
  EIA930_API_KEY: z.string().optional(),
  // Polling interval in minutes (default: 5). Minimum: 1.
  EIA930_POLLING_INTERVAL_MIN: z.string().optional(),

  // WattTime v3 API (https://docs.watttime.org/)
  // Username + password for JWT auth. Alternative: WATTTIME_API_KEY (legacy).
  WATTTIME_USERNAME: z.string().optional(),
  WATTTIME_PASSWORD: z.string().optional(),
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
  GOVERNANCE_AUDIT_ENABLED: parsed.data.GOVERNANCE_AUDIT_ENABLED !== 'false',
  GOVERNANCE_CHAIN_VERIFY: parsed.data.GOVERNANCE_CHAIN_VERIFY === 'true',
  ALLOW_INSECURE_NO_API_KEY: parsed.data.ALLOW_INSECURE_NO_API_KEY === 'true',
  UI_ENABLED:
    parsed.data.UI_ENABLED !== undefined
      ? parsed.data.UI_ENABLED === 'true'
      : parsed.data.NODE_ENV !== 'production',
  FORECAST_REFRESH_ENABLED:
    parsed.data.FORECAST_REFRESH_ENABLED !== undefined
      ? parsed.data.FORECAST_REFRESH_ENABLED === 'true'
      : parsed.data.NODE_ENV !== 'test',
  FORECAST_REFRESH_CRON: parsed.data.FORECAST_REFRESH_CRON,
}

export type Env = typeof env
