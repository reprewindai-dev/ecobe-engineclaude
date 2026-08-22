/**
 * Tests for src/routes/ci.ts
 *
 * Key changes in this PR:
 * 1. Removed import of `DEFAULT_DOCTRINE_SETTINGS` and `normalizeDoctrineSettings`
 *    from `../lib/doctrine/schema` — these are no longer used in ci.ts.
 * 2. Removed `buildFallbackDoctrineContext()` function — the fallback doctrine
 *    context builder that created a "fallback-org" doctrine is no longer present.
 * 3. `DoctrineSettings` is now imported as a type-only import (no runtime value).
 *
 * We test:
 * - The exported `requestSchema` (Zod validation) comprehensively
 * - The `doctrineWeightPctToFraction` logic (re-implemented inline)
 * - The removed `buildFallbackDoctrineContext` is no longer exported
 */

// ─── Mock all heavy dependencies before importing routes/ci ──────────────────
// routes/ci.ts has many imports that cause side effects (DB, Redis, etc.)

jest.mock('../lib/db', () => ({
  prisma: {
    cIDecision: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    region: { findMany: jest.fn().mockResolvedValue([]) },
  },
}))
jest.mock('../lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    hset: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue('PONG'),
  },
}))
jest.mock('../lib/carbon/provider-router', () => ({
  providerRouter: {
    getRoutingSignal: jest.fn(),
    getRoutingSignalRecord: jest.fn(),
    getCachedRoutingSignalRecord: jest.fn().mockResolvedValue(null),
    cacheRoutingSignal: jest.fn().mockResolvedValue(undefined),
  },
}))
jest.mock('../lib/cache-warmer', () => ({
  trackRecentRoutingRegions: jest.fn(),
  warmCacheOnStartup: jest.fn().mockResolvedValue(undefined),
  startRoutingSignalWarmLoop: jest.fn(),
  stopRoutingSignalWarmLoop: jest.fn(),
}))
jest.mock('../lib/ci/idempotency', () => ({
  buildIdempotencyCacheKey: jest.fn().mockReturnValue('cache-key'),
  readIdempotentResponse: jest.fn().mockResolvedValue(null),
  writeIdempotentResponse: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../lib/observability/otel', () => ({
  buildDecisionSpanRecord: jest.fn().mockReturnValue({}),
  exportDecisionSpanRecord: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../lib/observability/telemetry', () => ({
  getTelemetrySnapshot: jest.fn().mockReturnValue({}),
  recordTelemetryMetric: jest.fn(),
  telemetryMetricNames: {
    providerResolutionLatencyMs: 'provider.resolution.latency.ms',
    providerFreshnessSeconds: 'provider.freshness.seconds',
    waterAuthorityFreshnessSeconds: 'water.authority.freshness.seconds',
  },
}))
jest.mock('../lib/doctrine/service', () => ({
  DoctrineServiceError: class DoctrineServiceError extends Error {},
  requireActiveDoctrine: jest.fn().mockResolvedValue({
    orgId: 'test-org',
    versionId: 'v1',
    versionNumber: 1,
    version: 'v1.0.0',
    status: 'active',
    settings: {
      rules: { blockUsEast1: false, allowDelayUpTo4Hours: true },
      weights: { carbon: 70, water: 30, latency: 10, cost: 10 },
      caps: { maxDelayMinutes: 240 },
      modes: {},
    },
    activatedAt: new Date().toISOString(),
    sourceProposalId: null,
  }),
  resolveFallbackOrgId: jest.fn().mockResolvedValue('fallback-org'),
}))
jest.mock('../lib/learning/region-reliability', () => ({
  loadRegionReliabilityMultipliers: jest.fn().mockResolvedValue({}),
}))
jest.mock('../lib/pgl/canonical', () => ({
  hashCanonicalJson: jest.fn().mockReturnValue('hash-abc123'),
}))
jest.mock('../lib/pgl/service', () => ({
  derivePglRiskClass: jest.fn().mockReturnValue('standard'),
  enqueuePglDecisionAuditRetry: jest.fn().mockResolvedValue(undefined),
  getPglAttestationByEventHash: jest.fn().mockResolvedValue(null),
  getPglChainByCorrelationId: jest.fn().mockResolvedValue(null),
  getPglChainByDecisionFrameId: jest.fn().mockResolvedValue(null),
  getPglSummaryByDecisionFrameId: jest.fn().mockResolvedValue(null),
  getPglSummaryMapByDecisionFrameIds: jest.fn().mockResolvedValue({}),
  PglAuditError: class PglAuditError extends Error {},
  preparePglDecisionLifecycle: jest.fn().mockReturnValue({}),
  recordPglErrorEventBestEffort: jest.fn().mockResolvedValue(undefined),
  resolvePglGovernanceContext: jest.fn().mockReturnValue({ correlationId: 'ctx-1' }),
  validatePglGovernanceContext: jest.fn().mockReturnValue({ valid: true, failures: [] }),
  persistPglDecisionLifecycle: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../lib/policy/external-hook', () => ({
  evaluateExternalPolicyHook: jest.fn().mockResolvedValue({ allowed: true }),
}))
jest.mock('../lib/policy/seked-policy-adapter', () => ({
  evaluateSekedPolicyAdapter: jest.fn().mockResolvedValue({ allowed: true }),
}))
jest.mock('../lib/proof/export-chain', () => ({
  persistExportBatch: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../lib/ci/decision-events', () => ({
  buildDecisionEvaluatedEvent: jest.fn().mockReturnValue({}),
  enqueueDecisionEvaluatedEvents: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../lib/ci/replay', () => ({
  pinReplayProofHash: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../middleware/internal-auth', () => ({
  internalServiceGuard: jest.fn((req: any, res: any, next: any) => next()),
}))

import { requestSchema } from '../routes/ci'

// ─── Re-implementations of pure helpers from ci.ts ───────────────────────────

function doctrineWeightPctToFraction(value: number): number {
  return Math.max(0, Math.min(1, value / 100))
}

function computeScore(input: {
  carbonIntensity: number
  waterScarcityImpact: number
  carbonWeight: number
  waterWeight: number
  latencyWeight: number
  costWeight: number
  region: string
}): number {
  const totalWeight =
    input.carbonWeight +
    input.waterWeight +
    input.latencyWeight +
    input.costWeight
  const carbonW = input.carbonWeight / totalWeight
  const waterW = input.waterWeight / totalWeight
  const latencyW = input.latencyWeight / totalWeight
  const costW = input.costWeight / totalWeight

  const pseudoLatencyPenalty = input.region.startsWith('eu-') ? 0.18 : 0.1
  const pseudoCostPenalty = input.region.startsWith('ap-') ? 0.2 : 0.12

  return (
    carbonW * input.carbonIntensity +
    waterW * input.waterScarcityImpact * 100 +
    latencyW * pseudoLatencyPenalty * 100 +
    costW * pseudoCostPenalty * 100
  )
}

function estimateEnergyKwh(
  jobType: 'standard' | 'heavy' | 'light',
  explicit?: number
): number {
  if (explicit && explicit > 0) return explicit
  if (jobType === 'heavy') return 8
  if (jobType === 'light') return 0.8
  return 2.5
}

function computeSignalConfidence(
  carbonConfidence: number,
  waterConfidence: number
): number {
  return Number(
    Math.max(0.05, Math.min(1, (carbonConfidence + waterConfidence) / 2)).toFixed(3)
  )
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  )
  return sorted[Math.max(0, idx)]
}

// ─── requestSchema validation tests ──────────────────────────────────────────

describe('requestSchema — required fields', () => {
  it('rejects when preferredRegions is missing', () => {
    const result = requestSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      const hasPreferredRegionsError = result.error.issues.some(
        (issue) => issue.path.includes('preferredRegions')
      )
      expect(hasPreferredRegionsError).toBe(true)
    }
  })

  it('rejects when preferredRegions is empty array', () => {
    const result = requestSchema.safeParse({ preferredRegions: [] })
    expect(result.success).toBe(false)
  })

  it('accepts when preferredRegions has one entry', () => {
    const result = requestSchema.safeParse({ preferredRegions: ['us-east-1'] })
    expect(result.success).toBe(true)
  })
})

describe('requestSchema — default values', () => {
  const baseInput = { preferredRegions: ['us-east-1'] }

  it('defaults carbonWeight to 0.7', () => {
    const result = requestSchema.parse(baseInput)
    expect(result.carbonWeight).toBe(0.7)
  })

  it('defaults waterWeight to 0.3', () => {
    const result = requestSchema.parse(baseInput)
    expect(result.waterWeight).toBe(0.3)
  })

  it('defaults latencyWeight to 0.1', () => {
    const result = requestSchema.parse(baseInput)
    expect(result.latencyWeight).toBe(0.1)
  })

  it('defaults costWeight to 0.1', () => {
    const result = requestSchema.parse(baseInput)
    expect(result.costWeight).toBe(0.1)
  })

  it('defaults jobType to standard', () => {
    const result = requestSchema.parse(baseInput)
    expect(result.jobType).toBe('standard')
  })

  it('defaults criticality to standard', () => {
    const result = requestSchema.parse(baseInput)
    expect(result.criticality).toBe('standard')
  })

  it('defaults waterPolicyProfile to default', () => {
    const result = requestSchema.parse(baseInput)
    expect(result.waterPolicyProfile).toBe('default')
  })

  it('defaults allowDelay to true', () => {
    const result = requestSchema.parse(baseInput)
    expect(result.allowDelay).toBe(true)
  })

  it('defaults criticalPath to false', () => {
    const result = requestSchema.parse(baseInput)
    expect(result.criticalPath).toBe(false)
  })

  it('defaults signalPolicy to marginal_first', () => {
    const result = requestSchema.parse(baseInput)
    expect(result.signalPolicy).toBe('marginal_first')
  })

  it('defaults decisionMode to runtime_authorization', () => {
    const result = requestSchema.parse(baseInput)
    expect(result.decisionMode).toBe('runtime_authorization')
  })
})

describe('requestSchema — enum validations', () => {
  const baseInput = { preferredRegions: ['us-east-1'] }

  it('accepts jobType: heavy', () => {
    const result = requestSchema.safeParse({ ...baseInput, jobType: 'heavy' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.jobType).toBe('heavy')
  })

  it('accepts jobType: light', () => {
    const result = requestSchema.safeParse({ ...baseInput, jobType: 'light' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid jobType', () => {
    const result = requestSchema.safeParse({ ...baseInput, jobType: 'ultra-heavy' })
    expect(result.success).toBe(false)
  })

  it('accepts criticality: critical', () => {
    const result = requestSchema.safeParse({ ...baseInput, criticality: 'critical' })
    expect(result.success).toBe(true)
  })

  it('accepts criticality: batch', () => {
    const result = requestSchema.safeParse({ ...baseInput, criticality: 'batch' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid criticality', () => {
    const result = requestSchema.safeParse({ ...baseInput, criticality: 'extreme' })
    expect(result.success).toBe(false)
  })

  it('accepts all valid waterPolicyProfile values', () => {
    const profiles = [
      'default',
      'drought_sensitive',
      'eu_data_center_reporting',
      'high_water_sensitivity',
    ]
    for (const profile of profiles) {
      const result = requestSchema.safeParse({ ...baseInput, waterPolicyProfile: profile })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid waterPolicyProfile', () => {
    const result = requestSchema.safeParse({ ...baseInput, waterPolicyProfile: 'very_sensitive' })
    expect(result.success).toBe(false)
  })

  it('accepts signalPolicy: average_fallback', () => {
    const result = requestSchema.safeParse({ ...baseInput, signalPolicy: 'average_fallback' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid signalPolicy', () => {
    const result = requestSchema.safeParse({ ...baseInput, signalPolicy: 'best_effort' })
    expect(result.success).toBe(false)
  })

  it('accepts decisionMode: scenario_planning', () => {
    const result = requestSchema.safeParse({ ...baseInput, decisionMode: 'scenario_planning' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid decisionMode', () => {
    const result = requestSchema.safeParse({ ...baseInput, decisionMode: 'advisory' })
    expect(result.success).toBe(false)
  })
})

describe('requestSchema — numeric range validations', () => {
  const baseInput = { preferredRegions: ['us-east-1'] }

  it('rejects carbonWeight below 0', () => {
    const result = requestSchema.safeParse({ ...baseInput, carbonWeight: -0.1 })
    expect(result.success).toBe(false)
  })

  it('rejects carbonWeight above 1', () => {
    const result = requestSchema.safeParse({ ...baseInput, carbonWeight: 1.1 })
    expect(result.success).toBe(false)
  })

  it('accepts carbonWeight at boundary 0', () => {
    const result = requestSchema.safeParse({ ...baseInput, carbonWeight: 0 })
    expect(result.success).toBe(true)
  })

  it('accepts carbonWeight at boundary 1', () => {
    const result = requestSchema.safeParse({ ...baseInput, carbonWeight: 1 })
    expect(result.success).toBe(true)
  })

  it('rejects timeoutMs above 60000', () => {
    const result = requestSchema.safeParse({ ...baseInput, timeoutMs: 60001 })
    expect(result.success).toBe(false)
  })

  it('accepts timeoutMs at max boundary 60000', () => {
    const result = requestSchema.safeParse({ ...baseInput, timeoutMs: 60000 })
    expect(result.success).toBe(true)
  })

  it('rejects maxDelayMinutes above 1440', () => {
    const result = requestSchema.safeParse({ ...baseInput, maxDelayMinutes: 1441 })
    expect(result.success).toBe(false)
  })

  it('rejects estimatedEnergyKwh of 0 (must be positive)', () => {
    const result = requestSchema.safeParse({ ...baseInput, estimatedEnergyKwh: 0 })
    expect(result.success).toBe(false)
  })

  it('accepts positive estimatedEnergyKwh', () => {
    const result = requestSchema.safeParse({ ...baseInput, estimatedEnergyKwh: 2.5 })
    expect(result.success).toBe(true)
  })
})

describe('requestSchema — waterContext sub-schema', () => {
  const baseInput = { preferredRegions: ['us-east-1'] }

  it('defaults waterContext.scenario to current', () => {
    const result = requestSchema.parse({
      ...baseInput,
      waterContext: {},
    })
    expect(result.waterContext?.scenario).toBe('current')
  })

  it('accepts all valid scenario values', () => {
    const scenarios = ['current', '2030', '2050', '2080']
    for (const scenario of scenarios) {
      const result = requestSchema.safeParse({
        ...baseInput,
        waterContext: { scenario },
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid scenario', () => {
    const result = requestSchema.safeParse({
      ...baseInput,
      waterContext: { scenario: '2040' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects telemetryWindowMinutes above 1440', () => {
    const result = requestSchema.safeParse({
      ...baseInput,
      waterContext: { telemetryWindowMinutes: 1441 },
    })
    expect(result.success).toBe(false)
  })
})

describe('requestSchema — schedulerHints sub-schema', () => {
  const baseInput = { preferredRegions: ['us-east-1'] }

  it('accepts valid schedulerHints', () => {
    const result = requestSchema.safeParse({
      ...baseInput,
      schedulerHints: {
        bottleneckScore: 0.5,
        dependencyDepth: 3,
        queueDepth: 10,
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects bottleneckScore above 1', () => {
    const result = requestSchema.safeParse({
      ...baseInput,
      schedulerHints: { bottleneckScore: 1.1 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects dependencyDepth below 0', () => {
    const result = requestSchema.safeParse({
      ...baseInput,
      schedulerHints: { dependencyDepth: -1 },
    })
    expect(result.success).toBe(false)
  })
})

// ─── doctrineWeightPctToFraction tests ───────────────────────────────────────

describe('doctrineWeightPctToFraction', () => {
  it('converts 70 to 0.7', () => {
    expect(doctrineWeightPctToFraction(70)).toBe(0.7)
  })

  it('converts 100 to 1', () => {
    expect(doctrineWeightPctToFraction(100)).toBe(1)
  })

  it('converts 0 to 0', () => {
    expect(doctrineWeightPctToFraction(0)).toBe(0)
  })

  it('clamps values above 100 to 1', () => {
    expect(doctrineWeightPctToFraction(150)).toBe(1)
  })

  it('clamps negative values to 0', () => {
    expect(doctrineWeightPctToFraction(-10)).toBe(0)
  })

  it('converts 50 to 0.5', () => {
    expect(doctrineWeightPctToFraction(50)).toBe(0.5)
  })
})

// ─── estimateEnergyKwh tests ──────────────────────────────────────────────────

describe('estimateEnergyKwh', () => {
  it('returns explicit value when provided and positive', () => {
    expect(estimateEnergyKwh('standard', 5.0)).toBe(5.0)
  })

  it('uses jobType when explicit value is not provided', () => {
    expect(estimateEnergyKwh('heavy')).toBe(8)
    expect(estimateEnergyKwh('light')).toBe(0.8)
    expect(estimateEnergyKwh('standard')).toBe(2.5)
  })

  it('uses jobType default when explicit value is 0', () => {
    // 0 is falsy, so explicit check `explicit && explicit > 0` fails
    expect(estimateEnergyKwh('heavy', 0)).toBe(8)
  })

  it('uses jobType default when explicit is undefined', () => {
    expect(estimateEnergyKwh('light', undefined)).toBe(0.8)
  })

  it('returns explicit value over default for positive number', () => {
    expect(estimateEnergyKwh('heavy', 1.5)).toBe(1.5)
  })
})

// ─── computeSignalConfidence tests ───────────────────────────────────────────

describe('computeSignalConfidence', () => {
  it('returns average of carbon and water confidence', () => {
    // (0.8 + 0.6) / 2 = 0.7
    expect(computeSignalConfidence(0.8, 0.6)).toBe(0.7)
  })

  it('clamps result to minimum 0.05', () => {
    expect(computeSignalConfidence(0, 0)).toBe(0.05)
  })

  it('clamps result to maximum 1', () => {
    expect(computeSignalConfidence(1, 1)).toBe(1)
  })

  it('rounds to 3 decimal places', () => {
    const result = computeSignalConfidence(0.777, 0.666)
    expect(result).toBe(0.722)
  })

  it('handles perfect confidence', () => {
    expect(computeSignalConfidence(1.0, 1.0)).toBe(1)
  })

  it('handles low carbon confidence with high water confidence', () => {
    // min is 0.05, average of 0.05 and 0.95 = 0.5
    const result = computeSignalConfidence(0.05, 0.95)
    expect(result).toBe(0.5)
  })
})

// ─── computeScore tests ───────────────────────────────────────────────────────

describe('computeScore', () => {
  it('produces higher score for higher carbon intensity', () => {
    const lowCarbonScore = computeScore({
      carbonIntensity: 100,
      waterScarcityImpact: 0.1,
      carbonWeight: 0.7,
      waterWeight: 0.3,
      latencyWeight: 0.1,
      costWeight: 0.1,
      region: 'us-east-1',
    })
    const highCarbonScore = computeScore({
      carbonIntensity: 500,
      waterScarcityImpact: 0.1,
      carbonWeight: 0.7,
      waterWeight: 0.3,
      latencyWeight: 0.1,
      costWeight: 0.1,
      region: 'us-east-1',
    })
    expect(highCarbonScore).toBeGreaterThan(lowCarbonScore)
  })

  it('applies EU latency penalty for eu- regions', () => {
    const usScore = computeScore({
      carbonIntensity: 200,
      waterScarcityImpact: 0,
      carbonWeight: 0.5,
      waterWeight: 0.2,
      latencyWeight: 0.5,
      costWeight: 0.3,
      region: 'us-east-1',
    })
    const euScore = computeScore({
      carbonIntensity: 200,
      waterScarcityImpact: 0,
      carbonWeight: 0.5,
      waterWeight: 0.2,
      latencyWeight: 0.5,
      costWeight: 0.3,
      region: 'eu-west-1',
    })
    // EU has higher latency penalty (0.18 vs 0.1)
    expect(euScore).toBeGreaterThan(usScore)
  })

  it('applies AP cost penalty for ap- regions', () => {
    const usScore = computeScore({
      carbonIntensity: 100,
      waterScarcityImpact: 0,
      carbonWeight: 0.3,
      waterWeight: 0.1,
      latencyWeight: 0.1,
      costWeight: 0.5,
      region: 'us-east-1',
    })
    const apScore = computeScore({
      carbonIntensity: 100,
      waterScarcityImpact: 0,
      carbonWeight: 0.3,
      waterWeight: 0.1,
      latencyWeight: 0.1,
      costWeight: 0.5,
      region: 'ap-southeast-1',
    })
    // AP has higher cost penalty (0.2 vs 0.12)
    expect(apScore).toBeGreaterThan(usScore)
  })

  it('normalizes weights correctly (sum > 1 is handled)', () => {
    // Total weight = 2.0, each should be normalized to 0.25
    const score = computeScore({
      carbonIntensity: 200,
      waterScarcityImpact: 0.1,
      carbonWeight: 0.5,
      waterWeight: 0.5,
      latencyWeight: 0.5,
      costWeight: 0.5,
      region: 'us-east-1',
    })
    expect(score).toBeGreaterThan(0)
    expect(Number.isFinite(score)).toBe(true)
  })
})

// ─── percentile tests ─────────────────────────────────────────────────────────

describe('percentile', () => {
  it('returns 0 for empty array', () => {
    expect(percentile([], 95)).toBe(0)
  })

  it('returns the only value for single-element array', () => {
    expect(percentile([42], 95)).toBe(42)
  })

  it('returns max for p=100', () => {
    expect(percentile([10, 20, 30, 40, 50], 100)).toBe(50)
  })

  it('returns min-ish for p=1', () => {
    const result = percentile([10, 20, 30, 40, 50], 1)
    expect(result).toBeGreaterThanOrEqual(10)
    expect(result).toBeLessThanOrEqual(20)
  })

  it('returns correct median (p=50) for odd count', () => {
    const result = percentile([10, 20, 30, 40, 50], 50)
    expect(result).toBe(30)
  })

  it('sorts values before computing percentile', () => {
    // Unsorted input [50, 10, 30, 20, 40] should behave same as sorted
    const result = percentile([50, 10, 30, 20, 40], 50)
    expect(result).toBe(30)
  })

  it('returns p95 correctly for larger array', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1) // 1..100
    const p95 = percentile(values, 95)
    expect(p95).toBe(95)
  })
})

// ─── Verify buildFallbackDoctrineContext is no longer exported ────────────────

describe('ci route module — removed exports', () => {
  it('buildFallbackDoctrineContext is NOT exported from routes/ci', async () => {
    // Dynamic import to check all exports
    const ciModule = await import('../routes/ci')
    expect((ciModule as any).buildFallbackDoctrineContext).toBeUndefined()
  })

  it('DEFAULT_DOCTRINE_SETTINGS is NOT exported from routes/ci', async () => {
    const ciModule = await import('../routes/ci')
    expect((ciModule as any).DEFAULT_DOCTRINE_SETTINGS).toBeUndefined()
  })

  it('normalizeDoctrineSettings is NOT exported from routes/ci', async () => {
    const ciModule = await import('../routes/ci')
    expect((ciModule as any).normalizeDoctrineSettings).toBeUndefined()
  })

  it('requestSchema IS still exported from routes/ci', async () => {
    const ciModule = await import('../routes/ci')
    expect(ciModule.requestSchema).toBeDefined()
  })
})