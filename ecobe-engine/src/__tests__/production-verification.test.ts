/**
 * Production-style verification suite
 *
 * Covers all 6 scenarios from the QA audit:
 *   1. Immediate live routing
 *   2. Future forecast routing
 *   3. DEKES batch scheduling (multi-region, multi-slot)
 *   4. Historical fallback (no forecast signals)
 *   5. Stale forecast exclusion via referenceTime gate
 *   6. Ember validation disagreement flag
 *
 * Each test verifies:
 *   - Correct output shape
 *   - Correct field semantics (score, intensity, fallback_used)
 *   - Correct audit trail (source_used, referenceTime, fallback_used,
 *     resolutionMinutes, windowAvgIntensity, decisionFrameId)
 *   - No silent failures
 */

import { addHours, subHours, addMinutes } from 'date-fns'

// ── Module mocks (must be before any imports that use them) ──────────────────
jest.mock('../lib/db')
jest.mock('../lib/redis')
jest.mock('../lib/electricity-maps')
jest.mock('../lib/governance/audit')
jest.mock('../lib/carbon/provider-registry')
jest.mock('../config/carbon-providers', () => ({
  carbonProviderConfig: {
    primary: 'electricity_maps',
    validation: 'ember',
    allowFallback: true,
    maxStalenessMinutes: 10,
    disagreementThresholdPct: 15,
    devDiagnostics: false,
    providerRoles: {
      electricity_maps: { role: 'primary_realtime' },
      ember: { role: 'secondary_validation' },
      watttime: { role: 'fallback' },
    },
  },
}))

import { prisma } from '../lib/db'
import { redis } from '../lib/redis'
import { writeAuditLog } from '../lib/governance/audit'
import { getProvider } from '../lib/carbon/provider-registry'
import { CarbonSignal, ProviderResult } from '../lib/carbon/types'
import { assembleDecisionFrame } from '../lib/decision-data-assembler'
import { routeGreen } from '../lib/green-routing'
import { scheduleBatchQueries } from '../lib/dekes-integration'
import { getForecastSignals } from '../lib/carbon/provider-router'

// ── Signal factory ────────────────────────────────────────────────────────────

function makeSignal(
  region: string,
  intensity: number,
  overrides: Partial<CarbonSignal> = {}
): CarbonSignal {
  return {
    region,
    intensity_gco2_per_kwh: intensity,
    observed_time: new Date().toISOString(),
    forecast_time: addHours(new Date(), 2).toISOString(),
    fetched_at: new Date().toISOString(), // fresh by default
    source: 'electricity_maps',
    is_forecast: true,
    confidence: 0.85,
    data_quality: 'high',
    fallback_used: false,
    validation_used: false,
    disagreement_flag: false,
    disagreement_pct: null,
    metadata: {},
    ...overrides,
  }
}

function makeStaleSignal(region: string, intensity: number): CarbonSignal {
  return makeSignal(region, intensity, {
    fetched_at: subHours(new Date(), 2).toISOString(), // 2 hours old — exceeds 10-min limit
  })
}

function makeForecastSignal(region: string, intensity: number, forecastHoursAhead: number): CarbonSignal {
  return makeSignal(region, intensity, {
    forecast_time: addHours(new Date(), forecastHoursAhead).toISOString(),
    fetched_at: new Date().toISOString(),
    is_forecast: true,
  })
}

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockHistoryRows = [
  { region: 'FR', carbonIntensity: 95, resolutionMinutes: 60, timestamp: new Date() },
  { region: 'DE', carbonIntensity: 350, resolutionMinutes: 60, timestamp: new Date() },
  { region: 'SE', carbonIntensity: 30, resolutionMinutes: 60, timestamp: new Date() },
]

// ─────────────────────────────────────────────────────────────────────────────
// 1. IMMEDIATE LIVE ROUTING
// ─────────────────────────────────────────────────────────────────────────────

describe('1. Immediate live routing', () => {
  // Per-region intensity table used by the mock provider
  const regionIntensities: Record<string, number> = { FR: 58, DE: 320, SE: 45, GB: 240 }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma as any).carbonIntensity.findMany.mockResolvedValue(mockHistoryRows)
    ;(prisma as any).carbonIntensity.create.mockResolvedValue({})
    ;(redis as any).get.mockResolvedValue(null)
    ;(redis as any).setex.mockResolvedValue('OK')

    // Provide a real-enough mock provider so getBestCarbonSignal returns
    // region-specific intensities and the live routing path works correctly.
    ;(getProvider as jest.Mock).mockImplementation((name: string) => {
      if (name !== 'electricity_maps') return undefined
      return {
        supportsRegion: (r: string) => r in regionIntensities,
        getCurrentIntensity: (r: string) => Promise.resolve({
          ok: true,
          signal: makeSignal(r, regionIntensities[r] ?? 200, { is_forecast: false, forecast_time: null }),
        }),
        getForecast: jest.fn().mockResolvedValue([]),
      }
    })
  })

  it('selects the lowest-carbon region and returns correct shape', async () => {
    const result = await routeGreen({
      preferredRegions: ['FR', 'DE', 'SE'],
      carbonWeight: 1.0,
      latencyWeight: 0.0,
      costWeight: 0.0,
    })

    expect(result).toHaveProperty('selectedRegion')
    expect(result).toHaveProperty('carbonIntensity')
    expect(result).toHaveProperty('score')
    expect(result).toHaveProperty('alternatives')

    // SE=45 < FR=58 < DE=320 — SE must win at carbonWeight=1.0
    expect(result.selectedRegion).toBe('SE')
    expect(result.carbonIntensity).toBe(45)
  })

  it('score is a normalized 0–1 weighted value (not confidence)', async () => {
    const result = await routeGreen({
      preferredRegions: ['FR', 'DE'],
      carbonWeight: 0.7,
      latencyWeight: 0.3,
      costWeight: 0.0,
    })

    // Score must be 0–1 and computed from carbon + latency weights, not raw confidence
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })

  it('alternatives are sorted by descending score', async () => {
    const result = await routeGreen({
      preferredRegions: ['FR', 'DE', 'SE'],
    })

    const scores = result.alternatives?.map((a) => a.score) ?? []
    const sorted = [...scores].sort((a, b) => b - a)
    expect(scores).toEqual(sorted)
  })

  it('respects max carbon ceiling — falls back to least-bad when all exceed', async () => {
    // maxCarbonGPerKwh=10 — all regions exceed it, so pick least bad
    const result = await routeGreen({
      preferredRegions: ['FR', 'DE'],
      maxCarbonGPerKwh: 10,
    })

    // Must still return a region, not throw
    expect(result.selectedRegion).toBeTruthy()
    expect(result.carbonIntensity).toBeGreaterThan(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. FUTURE FORECAST ROUTING
// ─────────────────────────────────────────────────────────────────────────────

describe('2. Future forecast routing', () => {
  const targetTime = addHours(new Date(), 6)

  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma as any).carbonIntensity.findMany.mockResolvedValue(mockHistoryRows)
    ;(redis as any).get.mockResolvedValue(null)
    ;(redis as any).setex.mockResolvedValue('OK')
  })

  it('uses assembleDecisionFrame path when targetTime is in the future', async () => {
    // The forecast path returns decisionFrameId — this distinguishes it from live path
    const result = await routeGreen({
      preferredRegions: ['FR', 'DE'],
      targetTime,
      durationMinutes: 60,
    })

    expect(result).toHaveProperty('decisionFrameId')
    expect(result.decisionFrameId).toMatch(/^dda-/)
  })

  it('score semantics match live path (weighted formula, not confidence)', async () => {
    const result = await routeGreen({
      preferredRegions: ['FR', 'DE'],
      targetTime,
      carbonWeight: 0.7,
      latencyWeight: 0.3,
      costWeight: 0.0,
    })

    // Score must be 0–1
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
    // Alternatives must also have same-format scores
    for (const alt of result.alternatives ?? []) {
      expect(alt.score).toBeGreaterThanOrEqual(0)
      expect(alt.score).toBeLessThanOrEqual(1)
    }
  })

  it('returns forecastAvailable=false when no forecast signals exist (historical fallback)', async () => {
    // getForecastSignals returns [] → assembler falls back to historical
    ;(redis as any).get.mockResolvedValue(null) // no cache

    // Disable the EM provider for these regions (no API key set in test env)
    const mockProvider = {
      supportsRegion: () => false,
      getForecast: jest.fn().mockResolvedValue([]),
      getCurrentIntensity: jest.fn(),
    }
    ;(getProvider as jest.Mock).mockReturnValue(mockProvider)

    const result = await routeGreen({
      preferredRegions: ['FR', 'DE'],
      targetTime,
      durationMinutes: 60,
    })

    expect(result.forecastAvailable).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. DEKES BATCH SCHEDULING
// ─────────────────────────────────────────────────────────────────────────────

describe('3. DEKES batch scheduling', () => {
  const queries = [
    { id: 'q1', query: 'SELECT leads FROM uk_prospects', estimatedResults: 10000 },
    { id: 'q2', query: 'SELECT leads FROM eu_prospects', estimatedResults: 5000 },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    ;(redis as any).get.mockResolvedValue(null)
    ;(redis as any).setex.mockResolvedValue('OK')
    ;(prisma as any).dekesWorkload.create.mockImplementation((args: any) =>
      Promise.resolve({ id: `workload-${args.data.dekesQueryId}`, ...args.data })
    )

    // History fallback: FR=95, DE=350 gCO2/kWh
    ;(prisma as any).carbonIntensity.findMany.mockResolvedValue(mockHistoryRows)

    // Provider returns no forecast signals (forces history fallback path for simplicity)
    const mockProvider = {
      supportsRegion: () => false,
      getForecast: jest.fn().mockResolvedValue([]),
      getCurrentIntensity: jest.fn(),
    }
    ;(getProvider as jest.Mock).mockReturnValue(mockProvider)
  })

  it('returns one entry per query', async () => {
    const schedule = await scheduleBatchQueries(queries, ['FR', 'DE'], 24)
    expect(schedule).toHaveLength(queries.length)
  })

  it('each entry has required fields', async () => {
    const schedule = await scheduleBatchQueries(queries, ['FR', 'DE'], 24)
    for (const entry of schedule) {
      expect(entry).toHaveProperty('queryId')
      expect(entry).toHaveProperty('selectedRegion')
      expect(entry).toHaveProperty('scheduledTime')
      expect(entry).toHaveProperty('predictedCarbonIntensity')
      expect(entry).toHaveProperty('estimatedCO2')
      expect(entry).toHaveProperty('estimatedKwh')
      expect(entry).toHaveProperty('savings')
      expect(entry).toHaveProperty('workloadId')
    }
  })

  it('selects FR over DE (95 vs 350 gCO2/kWh from history fallback)', async () => {
    const schedule = await scheduleBatchQueries(queries, ['FR', 'DE'], 24)
    // Both queries should land in FR (lowest carbon from history)
    for (const entry of schedule) {
      expect(entry.selectedRegion).toBe('FR')
    }
  })

  it('savings is non-negative', async () => {
    const schedule = await scheduleBatchQueries(queries, ['FR', 'DE'], 24)
    for (const entry of schedule) {
      expect(entry.savings).toBeGreaterThanOrEqual(0)
    }
  })

  it('persists each workload to DB with correct region', async () => {
    await scheduleBatchQueries(queries, ['FR', 'DE'], 24)
    expect((prisma as any).dekesWorkload.create).toHaveBeenCalledTimes(queries.length)

    const firstCall = (prisma as any).dekesWorkload.create.mock.calls[0][0]
    expect(firstCall.data).toMatchObject({
      selectedRegion: 'FR',
      status: 'SCHEDULED',
      scheduledTime: expect.any(Date),
    })
  })

  it('getForecastSignals is called once per region (not once per slot)', async () => {
    // To verify the batched fetch, we spy on the DB findMany — it should be
    // called exactly once for history, not 48 times
    await scheduleBatchQueries(queries, ['FR', 'DE'], 24)
    // History is fetched exactly once for all regions
    expect((prisma as any).carbonIntensity.findMany).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. HISTORICAL FALLBACK — assembleDecisionFrame
// ─────────────────────────────────────────────────────────────────────────────

describe('4. Historical fallback in assembleDecisionFrame', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(redis as any).get.mockResolvedValue(null)
    ;(redis as any).setex.mockResolvedValue('OK')

    // No provider can serve these regions → getForecastSignals returns []
    const noOpProvider = {
      supportsRegion: () => false,
      getForecast: jest.fn().mockResolvedValue([]),
      getCurrentIntensity: jest.fn(),
    }
    ;(getProvider as jest.Mock).mockReturnValue(noOpProvider)
  })

  it('returns forecastAvailable=false and uses historical intensity', async () => {
    ;(prisma as any).carbonIntensity.findMany.mockResolvedValue([
      { region: 'FR', carbonIntensity: 75, resolutionMinutes: 60, timestamp: new Date() },
    ])

    const frame = await assembleDecisionFrame({
      regions: ['FR'],
      targetTime: addHours(new Date(), 3),
      durationMinutes: 60,
    })

    const region = frame.regions[0]
    expect(region.forecastAvailable).toBe(false)
    expect(region.targetCarbonIntensity).toBe(75)
    expect(region.windowAvgIntensity).toBe(75)
    expect(region.dataResolutionMinutes).toBe(60)
  })

  it('uses 400 gCO2/kWh hardcoded default when no historical data exists', async () => {
    ;(prisma as any).carbonIntensity.findMany.mockResolvedValue([])

    const frame = await assembleDecisionFrame({
      regions: ['UNKNOWN-ZONE'],
      targetTime: addHours(new Date(), 3),
      durationMinutes: 60,
    })

    const region = frame.regions[0]
    expect(region.forecastAvailable).toBe(false)
    expect(region.targetCarbonIntensity).toBe(400)
  })

  it('logs a FORECAST_FALLBACK warning with region and source info', async () => {
    ;(prisma as any).carbonIntensity.findMany.mockResolvedValue([
      { region: 'DE', carbonIntensity: 300, resolutionMinutes: 15, timestamp: new Date() },
    ])

    await assembleDecisionFrame({
      regions: ['DE'],
      targetTime: addHours(new Date(), 3),
      durationMinutes: 60,
    })

    // console.warn is mocked globally in setup.ts; verify it was called with fallback marker
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('FORECAST_FALLBACK')
    )
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('DE')
    )
  })

  it('forecastConfidence is 0.4 when using historical fallback', async () => {
    ;(prisma as any).carbonIntensity.findMany.mockResolvedValue([
      { region: 'FR', carbonIntensity: 80, resolutionMinutes: 60, timestamp: new Date() },
    ])

    const frame = await assembleDecisionFrame({
      regions: ['FR'],
      targetTime: addHours(new Date(), 3),
      durationMinutes: 60,
    })

    expect(frame.regions[0].forecastConfidence).toBe(0.4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. STALE FORECAST EXCLUSION via referenceTime gate
// ─────────────────────────────────────────────────────────────────────────────

describe('5. Stale forecast exclusion in getForecastSignals', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(redis as any).get.mockResolvedValue(null) // no cache
    ;(redis as any).setex.mockResolvedValue('OK')
  })

  it('excludes signals whose fetched_at is older than maxStalenessMinutes', async () => {
    // Provider returns one stale and one fresh signal
    const staleSignal: ProviderResult = {
      ok: true,
      signal: makeStaleSignal('FR', 60),
    }
    const freshSignal: ProviderResult = {
      ok: true,
      signal: makeForecastSignal('FR', 62, 3),
    }

    const mockProvider = {
      supportsRegion: () => true,
      getForecast: jest.fn().mockResolvedValue([staleSignal, freshSignal]),
      getCurrentIntensity: jest.fn(),
    }
    ;(getProvider as jest.Mock).mockReturnValue(mockProvider)

    const signals = await getForecastSignals('FR', new Date(), addHours(new Date(), 24))

    // Only fresh signal should survive the gate
    expect(signals).toHaveLength(1)
    expect(signals[0].intensity_gco2_per_kwh).toBe(62)
  })

  it('logs a warning for each excluded stale signal', async () => {
    const staleSignal: ProviderResult = {
      ok: true,
      signal: makeStaleSignal('DE', 300),
    }

    const mockProvider = {
      supportsRegion: () => true,
      getForecast: jest.fn().mockResolvedValue([staleSignal]),
      getCurrentIntensity: jest.fn(),
    }
    ;(getProvider as jest.Mock).mockReturnValue(mockProvider)

    await getForecastSignals('DE', new Date(), addHours(new Date(), 24))

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Stale forecast signal excluded')
    )
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('DE')
    )
  })

  it('returns from cache without hitting provider on repeated calls', async () => {
    // Seed cache with fresh signals
    const cachedPayload = JSON.stringify({
      signals: [makeForecastSignal('FR', 55, 2)],
      cachedAt: Date.now(),
    })
    ;(redis as any).get.mockResolvedValue(cachedPayload)

    const mockProvider = {
      supportsRegion: () => true,
      getForecast: jest.fn().mockResolvedValue([]),
      getCurrentIntensity: jest.fn(),
    }
    ;(getProvider as jest.Mock).mockReturnValue(mockProvider)

    const signals = await getForecastSignals('FR', new Date(), addHours(new Date(), 24))

    // Should have returned from cache
    expect(mockProvider.getForecast).not.toHaveBeenCalled()
    expect(signals).toHaveLength(1)
    expect(signals[0].intensity_gco2_per_kwh).toBe(55)
  })

  it('falls back to validation provider when primary returns no fresh signals', async () => {
    const primaryProvider = {
      supportsRegion: () => true,
      getForecast: jest.fn().mockResolvedValue([
        { ok: true, signal: makeStaleSignal('FR', 200) }, // stale → filtered out
      ]),
      getCurrentIntensity: jest.fn(),
    }
    const emberProvider = {
      supportsRegion: () => true,
      getForecast: jest.fn().mockResolvedValue([
        { ok: true, signal: makeForecastSignal('FR', 65, 2) }, // fresh → kept
      ]),
      getCurrentIntensity: jest.fn(),
    }

    ;(getProvider as jest.Mock).mockImplementation((name: string) => {
      if (name === 'electricity_maps') return primaryProvider
      if (name === 'ember') return emberProvider
      return undefined
    })

    const signals = await getForecastSignals('FR', new Date(), addHours(new Date(), 24))

    // Ember fallback signal should be returned
    expect(signals).toHaveLength(1)
    expect(signals[0].intensity_gco2_per_kwh).toBe(65)
    expect(signals[0].fallback_used).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. EMBER VALIDATION DISAGREEMENT FLAG
// ─────────────────────────────────────────────────────────────────────────────

describe('6. Ember validation disagreement flag', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(redis as any).get.mockResolvedValue(null)
    ;(redis as any).setex.mockResolvedValue('OK')
  })

  it('sets disagreement_flag when Ember and EM diverge beyond threshold (15%)', async () => {
    // EM = 100, Ember = 140 → 40% divergence → flag set
    const emSignal = makeSignal('FR', 100, { is_forecast: false, forecast_time: null })
    const emberSignal = makeSignal('FR', 140, {
      source: 'ember',
      is_forecast: false,
      forecast_time: null,
    })

    const emProvider = {
      supportsRegion: () => true,
      getCurrentIntensity: jest.fn().mockResolvedValue({ ok: true, signal: emSignal }),
      getForecast: jest.fn().mockResolvedValue([]),
    }
    const emberProvider = {
      supportsRegion: () => true,
      getCurrentIntensity: jest.fn().mockResolvedValue({ ok: true, signal: emberSignal }),
      getForecast: jest.fn().mockResolvedValue([]),
    }

    ;(getProvider as jest.Mock).mockImplementation((name: string) => {
      if (name === 'electricity_maps') return emProvider
      if (name === 'ember') return emberProvider
      return undefined
    })

    const { getBestCarbonSignal } = await import('../lib/carbon/provider-router')
    const result = await getBestCarbonSignal('FR', 'realtime')

    expect(result.ok).toBe(true)
    expect(result.signal).not.toBeNull()
    // Disagreement > 15% → flag must be set
    expect(result.signal!.disagreement_flag).toBe(true)
    expect(result.signal!.disagreement_pct).toBeGreaterThan(15)
  })

  it('does NOT set disagreement_flag when Ember and EM agree (within 15%)', async () => {
    // EM = 100, Ember = 108 → 8% divergence → flag NOT set
    const emSignal = makeSignal('FR', 100, { is_forecast: false, forecast_time: null })
    const emberSignal = makeSignal('FR', 108, {
      source: 'ember',
      is_forecast: false,
      forecast_time: null,
    })

    const emProvider = {
      supportsRegion: () => true,
      getCurrentIntensity: jest.fn().mockResolvedValue({ ok: true, signal: emSignal }),
      getForecast: jest.fn().mockResolvedValue([]),
    }
    const emberProvider = {
      supportsRegion: () => true,
      getCurrentIntensity: jest.fn().mockResolvedValue({ ok: true, signal: emberSignal }),
      getForecast: jest.fn().mockResolvedValue([]),
    }

    ;(getProvider as jest.Mock).mockImplementation((name: string) => {
      if (name === 'electricity_maps') return emProvider
      if (name === 'ember') return emberProvider
      return undefined
    })

    const { getBestCarbonSignal } = await import('../lib/carbon/provider-router')
    const result = await getBestCarbonSignal('FR', 'realtime')

    expect(result.signal!.disagreement_flag).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. AUDIT TRAIL COMPLETENESS
// ─────────────────────────────────────────────────────────────────────────────

describe('7. Decision audit trail completeness', () => {
  const mockWriteAuditLog = writeAuditLog as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    // writeAuditLog is mocked — capture calls
    mockWriteAuditLog.mockResolvedValue(undefined)
    ;(prisma as any).carbonIntensity.findMany.mockResolvedValue(mockHistoryRows)
    ;(redis as any).get.mockResolvedValue(null)
    ;(redis as any).setex.mockResolvedValue('OK')
  })

  it('assembleDecisionFrame frame carries all required provenance fields', async () => {
    // No provider → history fallback path
    const noOpProvider = {
      supportsRegion: () => false,
      getForecast: jest.fn().mockResolvedValue([]),
      getCurrentIntensity: jest.fn(),
    }
    ;(getProvider as jest.Mock).mockReturnValue(noOpProvider)

    ;(prisma as any).carbonIntensity.findMany.mockResolvedValue([
      { region: 'SE', carbonIntensity: 30, resolutionMinutes: 60, timestamp: new Date() },
    ])

    const frame = await assembleDecisionFrame({
      regions: ['SE'],
      targetTime: addHours(new Date(), 4),
      durationMinutes: 60,
    })

    // Frame-level fields
    expect(frame.frameId).toMatch(/^dda-/)
    expect(frame.assembledAt).toBeInstanceOf(Date)
    expect(frame.targetTime).toBeInstanceOf(Date)
    expect(frame.durationMinutes).toBe(60)

    // Region-level provenance fields
    const region = frame.regions[0]
    expect(region.referenceTime).toBeInstanceOf(Date)   // when data was sourced
    expect(region.targetTime).toBeInstanceOf(Date)      // when workload will run
    expect(typeof region.dataResolutionMinutes).toBe('number')
    expect(typeof region.windowAvgIntensity).toBe('number')
    expect(typeof region.forecastAvailable).toBe('boolean')
    expect(region.dataResolutionMinutes).toBe(60)
    expect(region.windowAvgIntensity).toBe(30)
  })

  it('forecast path returns decisionFrameId and forecastAvailable in RoutingResult', async () => {
    // EM provider returns fresh forecasts
    const freshSignals: ProviderResult[] = [
      { ok: true, signal: makeForecastSignal('SE', 28, 4) },
      { ok: true, signal: makeForecastSignal('SE', 32, 5) },
    ]
    const mockProvider = {
      supportsRegion: () => true,
      getForecast: jest.fn().mockResolvedValue(freshSignals),
      getCurrentIntensity: jest.fn(),
    }
    ;(getProvider as jest.Mock).mockReturnValue(mockProvider)

    const result = await routeGreen({
      preferredRegions: ['SE', 'FR'],
      targetTime: addHours(new Date(), 4),
      durationMinutes: 60,
    })

    // These fields are required for every decision to carry its own audit trail
    expect(result.decisionFrameId).toBeDefined()
    expect(result.decisionFrameId).toMatch(/^dda-/)
    expect(result.forecastAvailable).toBe(true)
  })

  it('score field is bounded 0–1 in both live and forecast paths', async () => {
    // Live path — wire up a real-enough mock so getBestCarbonSignal succeeds
    ;(getProvider as jest.Mock).mockImplementation((name: string) => {
      if (name !== 'electricity_maps') return undefined
      return {
        supportsRegion: () => true,
        getCurrentIntensity: (r: string) => Promise.resolve({
          ok: true,
          signal: makeSignal(r, r === 'FR' ? 58 : 320, { is_forecast: false, forecast_time: null }),
        }),
        getForecast: jest.fn().mockResolvedValue([]),
      }
    })
    ;(prisma as any).carbonIntensity.create.mockResolvedValue({})

    const liveResult = await routeGreen({ preferredRegions: ['FR', 'DE'] })
    expect(liveResult.score).toBeGreaterThanOrEqual(0)
    expect(liveResult.score).toBeLessThanOrEqual(1)

    // Forecast path
    const noOpProvider = {
      supportsRegion: () => false,
      getForecast: jest.fn().mockResolvedValue([]),
      getCurrentIntensity: jest.fn().mockResolvedValue({ ok: false, signal: null }),
    }
    ;(getProvider as jest.Mock).mockReturnValue(noOpProvider)

    const forecastResult = await routeGreen({
      preferredRegions: ['FR', 'DE'],
      targetTime: addHours(new Date(), 6),
    })
    expect(forecastResult.score).toBeGreaterThanOrEqual(0)
    expect(forecastResult.score).toBeLessThanOrEqual(1)
  })

  it('assembleDecisionFrame carries confidenceBand on every region', async () => {
    const noOpProvider = {
      supportsRegion: () => false,
      getForecast: jest.fn().mockResolvedValue([]),
      getCurrentIntensity: jest.fn().mockResolvedValue({ ok: false, signal: null }),
    }
    ;(getProvider as jest.Mock).mockReturnValue(noOpProvider)
    ;(prisma as any).carbonIntensity.findMany.mockResolvedValue([
      { region: 'FR', carbonIntensity: 80, resolutionMinutes: 60, timestamp: new Date() },
    ])

    const frame = await assembleDecisionFrame({
      regions: ['FR'],
      targetTime: addHours(new Date(), 3),
      durationMinutes: 60,
    })

    const region = frame.regions[0]
    expect(region).toHaveProperty('confidenceBand')
    expect(region.confidenceBand.low).toBeLessThanOrEqual(region.confidenceBand.mid)
    expect(region.confidenceBand.mid).toBeLessThanOrEqual(region.confidenceBand.high)
    // Fallback path uses estimated band (not empirical)
    expect(region.confidenceBand.empirical).toBe(false)
    // All values are positive integers
    expect(region.confidenceBand.mid).toBeGreaterThan(0)
    expect(Number.isInteger(region.confidenceBand.low)).toBe(true)
  })

  it('forecast path exposes confidenceBand in RoutingResult', async () => {
    const freshSignals: ProviderResult[] = [
      { ok: true, signal: makeForecastSignal('SE', 28, 4) },
      { ok: true, signal: makeForecastSignal('SE', 32, 5) },
    ]
    ;(getProvider as jest.Mock).mockImplementation((name: string) => {
      if (name !== 'electricity_maps') return undefined
      return {
        supportsRegion: () => true,
        getForecast: jest.fn().mockResolvedValue(freshSignals),
        getCurrentIntensity: jest.fn(),
      }
    })

    const result = await routeGreen({
      preferredRegions: ['SE', 'FR'],
      targetTime: addHours(new Date(), 4),
      durationMinutes: 60,
    })

    expect(result).toHaveProperty('confidenceBand')
    expect(result.confidenceBand!.low).toBeLessThanOrEqual(result.confidenceBand!.mid)
    expect(result.confidenceBand!.mid).toBeLessThanOrEqual(result.confidenceBand!.high)
  })

  it('every RoutingResult carries a non-empty explanation string', async () => {
    // Live path
    ;(getProvider as jest.Mock).mockImplementation((name: string) => {
      if (name !== 'electricity_maps') return undefined
      return {
        supportsRegion: (r: string) => ['FR', 'DE'].includes(r),
        getCurrentIntensity: (r: string) => Promise.resolve({
          ok: true,
          signal: makeSignal(r, r === 'FR' ? 58 : 320, { is_forecast: false, forecast_time: null }),
        }),
        getForecast: jest.fn().mockResolvedValue([]),
      }
    })
    ;(prisma as any).carbonIntensity.create.mockResolvedValue({})

    const live = await routeGreen({ preferredRegions: ['FR', 'DE'] })
    expect(typeof live.explanation).toBe('string')
    expect(live.explanation.length).toBeGreaterThan(20)
    expect(live.explanation).toContain('FR')

    // Forecast path (uses historical fallback — no provider)
    const noOpProvider = {
      supportsRegion: () => false,
      getForecast: jest.fn().mockResolvedValue([]),
      getCurrentIntensity: jest.fn().mockResolvedValue({ ok: false, signal: null }),
    }
    ;(getProvider as jest.Mock).mockReturnValue(noOpProvider)

    const forecast = await routeGreen({
      preferredRegions: ['SE', 'FR'],
      targetTime: addHours(new Date(), 4),
      durationMinutes: 60,
    })
    expect(typeof forecast.explanation).toBe('string')
    expect(forecast.explanation.length).toBeGreaterThan(20)
  })

  it('DEKES schedule entries carry a non-empty explanation', async () => {
    const noOpProvider = {
      supportsRegion: () => false,
      getForecast: jest.fn().mockResolvedValue([]),
      getCurrentIntensity: jest.fn().mockResolvedValue({ ok: false, signal: null }),
    }
    ;(getProvider as jest.Mock).mockReturnValue(noOpProvider)
    ;(prisma as any).dekesWorkload.create.mockImplementation((args: any) =>
      Promise.resolve({ id: `wl-${args.data.dekesQueryId}`, ...args.data })
    )

    const [entry] = await scheduleBatchQueries(
      [{ id: 'q-expl', query: 'SELECT *', estimatedResults: 5000 }],
      ['FR', 'SE'],
      6
    )

    expect(typeof entry.explanation).toBe('string')
    expect(entry.explanation.length).toBeGreaterThan(20)
    // Explanation should reference the selected region and predicted intensity
    expect(entry.explanation).toContain(entry.selectedRegion)
    expect(entry.explanation).toContain(String(entry.predictedCarbonIntensity))
  })

  it('ScheduleRecommendation fromRoutingResult produces the full canonical shape', async () => {
    const { fromRoutingResult } = await import('../lib/schedule-recommendation')
    const mockResult = {
      selectedRegion: 'SE',
      carbonIntensity: 28,
      score: 0.92,
      explanation: 'SE selected for 14:00–15:00 UTC: 28 gCO2/kWh vs 300 gCO2/kWh.',
      forecastAvailable: true,
      decisionFrameId: 'dda-test-abc',
      alternatives: [{ region: 'DE', carbonIntensity: 300, score: 0.1 }],
    }

    const rec = fromRoutingResult(mockResult, {
      targetTime: new Date('2026-03-09T14:00:00Z'),
      durationMinutes: 60,
      estimatedKwh: 0.5,
      sourceUsed: 'electricity_maps',
      resolutionMinutes: 60,
    })

    // All canonical fields must be present
    expect(rec).toHaveProperty('selected_region', 'SE')
    expect(rec).toHaveProperty('start_time', '2026-03-09T14:00:00.000Z')
    expect(rec).toHaveProperty('end_time', '2026-03-09T15:00:00.000Z')
    expect(rec).toHaveProperty('expected_ci', 28)
    expect(rec).toHaveProperty('baseline_ci', 300)
    expect(rec.expected_savings_pct).toBeGreaterThan(0)
    expect(rec).toHaveProperty('confidence_band')
    expect(rec).toHaveProperty('source_used', 'electricity_maps')
    expect(rec).toHaveProperty('resolution_minutes', 60)
    expect(rec).toHaveProperty('fallback_used', false)
    expect(rec).toHaveProperty('forecast_available', true)
    expect(rec).toHaveProperty('score', 0.92)
    expect(rec).toHaveProperty('explanation')
    expect(rec).toHaveProperty('decision_frame_id', 'dda-test-abc')
    expect(rec.estimated_kwh).toBe(0.5)
    expect(rec.estimated_co2_g).toBeGreaterThan(0)
  })

  it('DEKES workload DB record includes selectedRegion and scheduledTime', async () => {
    const noOpProvider = {
      supportsRegion: () => false,
      getForecast: jest.fn().mockResolvedValue([]),
      getCurrentIntensity: jest.fn(),
    }
    ;(getProvider as jest.Mock).mockReturnValue(noOpProvider)

    ;(prisma as any).dekesWorkload.create.mockImplementation((args: any) =>
      Promise.resolve({ id: `wl-${args.data.dekesQueryId}`, ...args.data })
    )

    const [entry] = await scheduleBatchQueries(
      [{ id: 'q-audit', query: 'SELECT *', estimatedResults: 1000 }],
      ['FR', 'SE'],
      6
    )

    const dbCall = (prisma as any).dekesWorkload.create.mock.calls[0][0]
    // Required DB fields from QA checklist
    expect(dbCall.data).toHaveProperty('selectedRegion')
    expect(dbCall.data).toHaveProperty('scheduledTime')
    expect(dbCall.data).toHaveProperty('status', 'SCHEDULED')
    // Entry surfaced to caller
    expect(entry.predictedCarbonIntensity).toBeGreaterThan(0)
    expect(entry.estimatedKwh).toBeGreaterThan(0)
  })
})
