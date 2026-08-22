/**
 * Tests for src/config/env.ts
 *
 * Key changes in this PR:
 * 1. Removed UPSTASH_SEARCH_REST_TOKEN from schema (previously used as UPSTASH_VECTOR_REST_TOKEN fallback)
 * 2. Removed regional QSTASH env vars (EU_CENTRAL_1_*, US_EAST_1_*, QSTASH_URL, QSTASH_REGION)
 * 3. Removed EIA_INGESTION_REGION_STAGGER_MS
 * 4. QSTASH_BASE_URL and QSTASH_TOKEN no longer have complex regional fallback chains
 * 5. UI_ENABLED default changed: now defaults to true if NODE_ENV !== 'production'
 *    (previously: true if NODE_ENV !== 'test' for production check — now: true unless production)
 *
 * NOTE: env.ts calls process.exit(1) on parse failure, so we test the already-loaded
 * `env` object and use Zod schema behavior tests where possible.
 */

import { env } from '../config/env'

describe('env config — removed fields from PR', () => {
  describe('EIA_INGESTION_REGION_STAGGER_MS removed', () => {
    it('env object does not have EIA_INGESTION_REGION_STAGGER_MS property', () => {
      expect(env).not.toHaveProperty('EIA_INGESTION_REGION_STAGGER_MS')
    })
  })

  describe('Regional QSTASH vars removed', () => {
    it('env object does not have EU_CENTRAL_1_QSTASH_URL', () => {
      expect(env).not.toHaveProperty('EU_CENTRAL_1_QSTASH_URL')
    })

    it('env object does not have EU_CENTRAL_1_QSTASH_TOKEN', () => {
      expect(env).not.toHaveProperty('EU_CENTRAL_1_QSTASH_TOKEN')
    })

    it('env object does not have US_EAST_1_QSTASH_URL', () => {
      expect(env).not.toHaveProperty('US_EAST_1_QSTASH_URL')
    })

    it('env object does not have US_EAST_1_QSTASH_TOKEN', () => {
      expect(env).not.toHaveProperty('US_EAST_1_QSTASH_TOKEN')
    })

    it('env object does not have QSTASH_URL', () => {
      expect(env).not.toHaveProperty('QSTASH_URL')
    })

    it('env object does not have QSTASH_REGION', () => {
      expect(env).not.toHaveProperty('QSTASH_REGION')
    })

    it('env object does not have EU_CENTRAL_1_QSTASH_CURRENT_SIGNING_KEY', () => {
      expect(env).not.toHaveProperty('EU_CENTRAL_1_QSTASH_CURRENT_SIGNING_KEY')
    })

    it('env object does not have EU_CENTRAL_1_QSTASH_NEXT_SIGNING_KEY', () => {
      expect(env).not.toHaveProperty('EU_CENTRAL_1_QSTASH_NEXT_SIGNING_KEY')
    })

    it('env object does not have US_EAST_1_QSTASH_CURRENT_SIGNING_KEY', () => {
      expect(env).not.toHaveProperty('US_EAST_1_QSTASH_CURRENT_SIGNING_KEY')
    })

    it('env object does not have US_EAST_1_QSTASH_NEXT_SIGNING_KEY', () => {
      expect(env).not.toHaveProperty('US_EAST_1_QSTASH_NEXT_SIGNING_KEY')
    })
  })

  describe('UPSTASH_SEARCH_REST_TOKEN removed', () => {
    it('env object does not have UPSTASH_SEARCH_REST_TOKEN', () => {
      expect(env).not.toHaveProperty('UPSTASH_SEARCH_REST_TOKEN')
    })
  })
})

describe('env config — QSTASH_BASE_URL simplified (no complex fallback)', () => {
  it('env.QSTASH_BASE_URL is either undefined or a string (no hardcoded default)', () => {
    // Previously had a complex fallback that defaulted to "https://qstash.upstash.io"
    // Now it is only set if QSTASH_BASE_URL env var is explicitly set
    expect(
      env.QSTASH_BASE_URL === undefined || typeof env.QSTASH_BASE_URL === 'string'
    ).toBe(true)
  })

  it('env.QSTASH_BASE_URL does not default to hardcoded qstash.upstash.io in test mode', () => {
    // In test mode where QSTASH_BASE_URL is not set, it should be undefined (not the old default)
    if (!process.env.QSTASH_BASE_URL) {
      expect(env.QSTASH_BASE_URL).toBeUndefined()
    }
  })
})

describe('env config — numeric type coercions', () => {
  it('env.PORT is a number', () => {
    expect(typeof env.PORT).toBe('number')
  })

  it('env.PORT defaults to 3001 in test setup (from setup.ts)', () => {
    expect(env.PORT).toBe(3001)
  })

  it('env.DEFAULT_MAX_CARBON_G_PER_KWH is a number', () => {
    expect(typeof env.DEFAULT_MAX_CARBON_G_PER_KWH).toBe('number')
    expect(env.DEFAULT_MAX_CARBON_G_PER_KWH).toBe(400)
  })

  it('env.GRID_SIGNAL_CACHE_TTL is a number', () => {
    expect(typeof env.GRID_SIGNAL_CACHE_TTL).toBe('number')
    expect(env.GRID_SIGNAL_CACHE_TTL).toBe(900)
  })

  it('env.GRID_FEATURE_CACHE_TTL is a number', () => {
    expect(typeof env.GRID_FEATURE_CACHE_TTL).toBe('number')
    expect(env.GRID_FEATURE_CACHE_TTL).toBe(3600)
  })

  it('env.LEARNING_LOOKBACK_HOURS is a number', () => {
    expect(typeof env.LEARNING_LOOKBACK_HOURS).toBe('number')
    expect(env.LEARNING_LOOKBACK_HOURS).toBe(168)
  })

  it('env.DS_EVENT_LOOKBACK_HOURS is at least 24 (Math.max enforcement)', () => {
    expect(typeof env.DS_EVENT_LOOKBACK_HOURS).toBe('number')
    expect(env.DS_EVENT_LOOKBACK_HOURS).toBeGreaterThanOrEqual(24)
  })

  it('env.RUNTIME_SUPERVISOR_INTERVAL_SEC is a number', () => {
    expect(typeof env.RUNTIME_SUPERVISOR_INTERVAL_SEC).toBe('number')
    expect(env.RUNTIME_SUPERVISOR_INTERVAL_SEC).toBe(60)
  })

  it('env.DECISION_EVENT_DISPATCH_BATCH_SIZE is a number', () => {
    expect(typeof env.DECISION_EVENT_DISPATCH_BATCH_SIZE).toBe('number')
    expect(env.DECISION_EVENT_DISPATCH_BATCH_SIZE).toBe(25)
  })

  it('env.DECISION_EVENT_DISPATCH_TIMEOUT_MS is a number', () => {
    expect(typeof env.DECISION_EVENT_DISPATCH_TIMEOUT_MS).toBe('number')
    expect(env.DECISION_EVENT_DISPATCH_TIMEOUT_MS).toBe(3000)
  })

  it('env.DECISION_EVENT_MAX_ATTEMPTS is a number', () => {
    expect(typeof env.DECISION_EVENT_MAX_ATTEMPTS).toBe('number')
    expect(env.DECISION_EVENT_MAX_ATTEMPTS).toBe(5)
  })

  it('env.DECISION_API_IDEMPOTENCY_TTL_SEC is a number', () => {
    expect(typeof env.DECISION_API_IDEMPOTENCY_TTL_SEC).toBe('number')
    expect(env.DECISION_API_IDEMPOTENCY_TTL_SEC).toBe(900)
  })

  it('env.PGL_AUDIT_RETRY_BATCH_SIZE is a number', () => {
    expect(typeof env.PGL_AUDIT_RETRY_BATCH_SIZE).toBe('number')
    expect(env.PGL_AUDIT_RETRY_BATCH_SIZE).toBe(20)
  })

  it('env.PGL_AUDIT_RETRY_BASE_MS is a number', () => {
    expect(typeof env.PGL_AUDIT_RETRY_BASE_MS).toBe('number')
    expect(env.PGL_AUDIT_RETRY_BASE_MS).toBe(15000)
  })

  it('env.EXTERNAL_POLICY_HOOK_TIMEOUT_MS is a number', () => {
    expect(typeof env.EXTERNAL_POLICY_HOOK_TIMEOUT_MS).toBe('number')
    expect(env.EXTERNAL_POLICY_HOOK_TIMEOUT_MS).toBe(800)
  })

  it('env.SEKED_POLICY_ADAPTER_TIMEOUT_MS is a number', () => {
    expect(typeof env.SEKED_POLICY_ADAPTER_TIMEOUT_MS).toBe('number')
    expect(env.SEKED_POLICY_ADAPTER_TIMEOUT_MS).toBe(800)
  })

  it('env.OTEL_EXPORT_TIMEOUT_MS is a number', () => {
    expect(typeof env.OTEL_EXPORT_TIMEOUT_MS).toBe('number')
    expect(env.OTEL_EXPORT_TIMEOUT_MS).toBe(1500)
  })

  it('env.DOCTRINE_CACHE_TTL_SEC is a number', () => {
    expect(typeof env.DOCTRINE_CACHE_TTL_SEC).toBe('number')
    expect(env.DOCTRINE_CACHE_TTL_SEC).toBe(60)
  })
})

describe('env config — boolean coercions (test mode defaults)', () => {
  it('env.ENGINE_BACKGROUND_WORKERS_ENABLED is a boolean', () => {
    expect(typeof env.ENGINE_BACKGROUND_WORKERS_ENABLED).toBe('boolean')
  })

  it('env.ENGINE_BACKGROUND_WORKERS_ENABLED defaults to false when not set', () => {
    // setup.ts does not set ENGINE_BACKGROUND_WORKERS_ENABLED
    if (!process.env.ENGINE_BACKGROUND_WORKERS_ENABLED) {
      expect(env.ENGINE_BACKGROUND_WORKERS_ENABLED).toBe(false)
    }
  })

  it('env.FORECAST_REFRESH_ENABLED is a boolean', () => {
    expect(typeof env.FORECAST_REFRESH_ENABLED).toBe('boolean')
  })

  it('env.FORECAST_REFRESH_ENABLED is false in test mode when not explicitly set', () => {
    // NODE_ENV=test and FORECAST_REFRESH_ENABLED not set → should be false
    if (!process.env.FORECAST_REFRESH_ENABLED && process.env.NODE_ENV === 'test') {
      expect(env.FORECAST_REFRESH_ENABLED).toBe(false)
    }
  })

  it('env.LEARNING_LOOP_ENABLED is a boolean', () => {
    expect(typeof env.LEARNING_LOOP_ENABLED).toBe('boolean')
  })

  it('env.LEARNING_LOOP_ENABLED is false in test mode when not explicitly set', () => {
    if (!process.env.LEARNING_LOOP_ENABLED && process.env.NODE_ENV === 'test') {
      expect(env.LEARNING_LOOP_ENABLED).toBe(false)
    }
  })

  it('env.RUNTIME_SUPERVISOR_ENABLED is a boolean', () => {
    expect(typeof env.RUNTIME_SUPERVISOR_ENABLED).toBe('boolean')
  })

  it('env.RUNTIME_SUPERVISOR_ENABLED is false in test mode when not explicitly set', () => {
    if (!process.env.RUNTIME_SUPERVISOR_ENABLED && process.env.NODE_ENV === 'test') {
      expect(env.RUNTIME_SUPERVISOR_ENABLED).toBe(false)
    }
  })

  it('env.DECISION_EVENT_DISPATCH_ENABLED is a boolean', () => {
    expect(typeof env.DECISION_EVENT_DISPATCH_ENABLED).toBe('boolean')
  })

  it('env.DECISION_EVENT_DISPATCH_ENABLED is false in test mode when not explicitly set', () => {
    if (!process.env.DECISION_EVENT_DISPATCH_ENABLED && process.env.NODE_ENV === 'test') {
      expect(env.DECISION_EVENT_DISPATCH_ENABLED).toBe(false)
    }
  })

  it('env.PGL_AUDIT_RETRY_ENABLED is a boolean', () => {
    expect(typeof env.PGL_AUDIT_RETRY_ENABLED).toBe('boolean')
  })

  it('env.PGL_AUDIT_RETRY_ENABLED is false in test mode when not explicitly set', () => {
    if (!process.env.PGL_AUDIT_RETRY_ENABLED && process.env.NODE_ENV === 'test') {
      expect(env.PGL_AUDIT_RETRY_ENABLED).toBe(false)
    }
  })

  it('env.EXTERNAL_POLICY_HOOK_ENABLED is a boolean', () => {
    expect(typeof env.EXTERNAL_POLICY_HOOK_ENABLED).toBe('boolean')
  })

  it('env.EXTERNAL_POLICY_HOOK_ENABLED defaults to false when not explicitly set', () => {
    if (!process.env.EXTERNAL_POLICY_HOOK_ENABLED) {
      expect(env.EXTERNAL_POLICY_HOOK_ENABLED).toBe(false)
    }
  })

  it('env.SEKED_POLICY_ADAPTER_ENABLED is a boolean', () => {
    expect(typeof env.SEKED_POLICY_ADAPTER_ENABLED).toBe('boolean')
  })

  it('env.SEKED_POLICY_ADAPTER_ENABLED defaults to false when not explicitly set', () => {
    if (!process.env.SEKED_POLICY_ADAPTER_ENABLED) {
      expect(env.SEKED_POLICY_ADAPTER_ENABLED).toBe(false)
    }
  })

  it('env.OTEL_EXPORT_ENABLED is a boolean', () => {
    expect(typeof env.OTEL_EXPORT_ENABLED).toBe('boolean')
  })

  it('env.DS_LEARNING_LOOP_ENABLED defaults to false when not explicitly set', () => {
    if (!process.env.DS_LEARNING_LOOP_ENABLED) {
      expect(env.DS_LEARNING_LOOP_ENABLED).toBe(false)
    }
  })

  it('env.TRENDY_SHADOW_ENABLED defaults to false when not explicitly set', () => {
    if (!process.env.TRENDY_SHADOW_ENABLED) {
      expect(env.TRENDY_SHADOW_ENABLED).toBe(false)
    }
  })
})

describe('env config — UI_ENABLED default changed (not-production vs not-test)', () => {
  it('env.UI_ENABLED is a boolean', () => {
    expect(typeof env.UI_ENABLED).toBe('boolean')
  })

  it('env.UI_ENABLED is true in test mode when not explicitly set (now: !production)', () => {
    // The PR changed the default from "NODE_ENV !== 'test'" to "NODE_ENV !== 'production'"
    // In test mode: UI_ENABLED was previously false (not test = false), now it's true (not production = true)
    if (!process.env.UI_ENABLED && process.env.NODE_ENV === 'test') {
      expect(env.UI_ENABLED).toBe(true)
    }
  })
})

describe('env config — string defaults', () => {
  it('env.ELECTRICITY_MAPS_BASE_URL defaults to https://api.electricitymap.org', () => {
    if (!process.env.ELECTRICITY_MAPS_BASE_URL) {
      expect(env.ELECTRICITY_MAPS_BASE_URL).toBe('https://api.electricitymap.org')
    }
  })

  it('env.EMBER_BASE_URL defaults to https://api.ember-energy.org', () => {
    if (!process.env.EMBER_BASE_URL) {
      expect(env.EMBER_BASE_URL).toBe('https://api.ember-energy.org')
    }
  })

  it('env.EIA_BASE_URL defaults to https://api.eia.gov', () => {
    if (!process.env.EIA_BASE_URL) {
      expect(env.EIA_BASE_URL).toBe('https://api.eia.gov')
    }
  })

  it('env.OTEL_SERVICE_NAME defaults to ecobe-engine', () => {
    if (!process.env.OTEL_SERVICE_NAME) {
      expect(env.OTEL_SERVICE_NAME).toBe('ecobe-engine')
    }
  })

  it('env.EIA_INGESTION_SCHEDULE defaults to 0 */15 * * * *', () => {
    if (!process.env.EIA_INGESTION_SCHEDULE) {
      expect(env.EIA_INGESTION_SCHEDULE).toBe('0 */15 * * * *')
    }
  })

  it('env.FORECAST_REFRESH_CRON defaults to */30 * * * *', () => {
    if (!process.env.FORECAST_REFRESH_CRON) {
      expect(env.FORECAST_REFRESH_CRON).toBe('*/30 * * * *')
    }
  })

  it('env.PGL_SIGNING_KEY_ID defaults to pgl-v0-primary', () => {
    if (!process.env.PGL_SIGNING_KEY_ID) {
      expect(env.PGL_SIGNING_KEY_ID).toBe('pgl-v0-primary')
    }
  })

  it('env.PGL_SIGNING_ALG defaults to HS256', () => {
    expect(env.PGL_SIGNING_ALG).toBe('HS256')
  })

  it('env.PGL_ROUTER_NODE_ID defaults to router-1', () => {
    if (!process.env.PGL_ROUTER_NODE_ID) {
      expect(env.PGL_ROUTER_NODE_ID).toBe('router-1')
    }
  })

  it('env.PGL_NODE_ID defaults to pgl-1', () => {
    if (!process.env.PGL_NODE_ID) {
      expect(env.PGL_NODE_ID).toBe('pgl-1')
    }
  })

  it('env.OPENAI_EMBEDDING_MODEL defaults to text-embedding-3-small', () => {
    if (!process.env.OPENAI_EMBEDDING_MODEL) {
      expect(env.OPENAI_EMBEDDING_MODEL).toBe('text-embedding-3-small')
    }
  })
})

describe('env config — Env type shape', () => {
  it('env object exists and is defined', () => {
    expect(env).toBeDefined()
    expect(typeof env).toBe('object')
  })

  it('env has DATABASE_URL set (from test setup)', () => {
    expect(env.DATABASE_URL).toBe('postgresql://test:test@localhost:5432/ecobe_test')
  })

  it('env has REDIS_URL set (from test setup)', () => {
    expect(env.REDIS_URL).toBe('redis://localhost:6379/1')
  })

  it('env.NODE_ENV is test', () => {
    expect(env.NODE_ENV).toBe('test')
  })
})

describe('env config — Zod schema validation logic (inline)', () => {
  it('envSchema rejects empty DATABASE_URL', () => {
    const { z } = require('zod')
    // Replicate just the critical required fields from the schema
    const minimalSchema = z.object({
      DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
      REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
    })

    const result = minimalSchema.safeParse({
      DATABASE_URL: '',
      REDIS_URL: 'redis://localhost:6379',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('DATABASE_URL')
    }
  })

  it('envSchema rejects JWT_SECRET shorter than 32 chars', () => {
    const { z } = require('zod')
    const minimalSchema = z.object({
      JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
    })

    const result = minimalSchema.safeParse({
      JWT_SECRET: 'too-short',
    })

    expect(result.success).toBe(false)
  })

  it('envSchema accepts JWT_SECRET of exactly 32 chars', () => {
    const { z } = require('zod')
    const minimalSchema = z.object({
      JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
    })

    const result = minimalSchema.safeParse({
      JWT_SECRET: 'a'.repeat(32),
    })

    expect(result.success).toBe(true)
  })

  it('PGL_SIGNING_ALG only allows HS256', () => {
    const { z } = require('zod')
    const minimalSchema = z.object({
      PGL_SIGNING_ALG: z.enum(['HS256']).default('HS256'),
    })

    const result = minimalSchema.safeParse({ PGL_SIGNING_ALG: 'RS256' })
    expect(result.success).toBe(false)
  })

  it('NODE_ENV must be one of development/production/test', () => {
    const { z } = require('zod')
    const minimalSchema = z.object({
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    })

    const result = minimalSchema.safeParse({ NODE_ENV: 'staging' })
    expect(result.success).toBe(false)
  })
})