/**
 * RoutingResult Grid Signal Shape Test
 *
 * Verifies that:
 *   1. routeGreen() returns with grid signal enrichment fields typed correctly
 *   2. Enrichment fields are null (not undefined error) when cache is empty
 *   3. Enrichment fields are populated when cache has data
 *   4. Grid signal unavailability never throws or blocks routing
 */

import { routeGreen } from '../../green-routing'

// Mock all external dependencies
jest.mock('../../db')
jest.mock('../../redis')
jest.mock('../../carbon/provider-registry')
jest.mock('../../grid-signals/grid-signal-cache')

import { getProvider } from '../../carbon/provider-registry'
import { prisma } from '../../db'
import { getCachedGridSignal } from '../../grid-signals/grid-signal-cache'

const mockGetProvider = getProvider as jest.Mock
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetCachedGridSignal = getCachedGridSignal as jest.Mock

function makeTestProvider(intensity: number) {
  return {
    name: 'electricity_maps',
    supportsRegion: () => true,
    getCurrentIntensity: () => Promise.resolve({
      ok: true,
      signal: {
        region: 'US-MIDA-PJM',
        intensity_gco2_per_kwh: intensity,
        observed_time: new Date().toISOString(),
        forecast_time: null,
        fetched_at: new Date().toISOString(),
        source: 'electricity_maps',
        is_forecast: false,
        confidence: 0.9,
        data_quality: 'high',
        fallback_used: false,
        validation_used: false,
        disagreement_flag: false,
        disagreement_pct: null,
        metadata: {},
      },
    }),
    getForecast: () => Promise.resolve([]),
    getHistorical: () => Promise.resolve([]),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetProvider.mockReturnValue(makeTestProvider(250))
  ;(mockPrisma.carbonIntensity as any) = {
    create: jest.fn().mockResolvedValue({}),
  }
})

describe('routeGreen grid signal enrichment shape', () => {
  it('returns grid enrichment fields as null when cache is empty', async () => {
    mockGetCachedGridSignal.mockResolvedValue(null)

    const result = await routeGreen({
      preferredRegions: ['US-MIDA-PJM'],
    })

    expect(result.selectedRegion).toBe('US-MIDA-PJM')
    expect(result.carbonIntensity).toBe(250)

    // Grid fields are optional; null is acceptable when cache is empty
    expect(result.balancingAuthority === null || result.balancingAuthority === undefined).toBe(true)
    expect(result.carbonSpikeProbability === null || result.carbonSpikeProbability === undefined).toBe(true)
    expect(result.curtailmentProbability === null || result.curtailmentProbability === undefined).toBe(true)
    expect(result.importCarbonLeakageScore === null || result.importCarbonLeakageScore === undefined).toBe(true)
  })

  it('populates grid fields from cached snapshot', async () => {
    const mockSnapshot = {
      region: 'US-MIDA-PJM',
      balancingAuthority: 'MIDA',
      timestamp: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      demandMwh: 80_000,
      demandChangeMwh: 2_000,
      demandChangePct: 2.5,
      loadRampDirection: 'rising' as const,
      loadRampStrength: 0.67,
      netGenerationMwh: 78_000,
      netInterchangeMwh: -2_000,
      renewableRatio: 0.35,
      fossilRatio: 0.55,
      fuelMixSummary: null,
      carbonSpikeProbability: 0.6,
      curtailmentProbability: 0.05,
      importCarbonLeakageScore: 0.12,
      signalQuality: 'high' as const,
      estimatedFlag: false,
      syntheticFlag: false,
      source: 'eia930' as const,
      metadata: {},
    }

    mockGetCachedGridSignal.mockResolvedValue(mockSnapshot)

    const result = await routeGreen({
      preferredRegions: ['US-MIDA-PJM'],
    })

    expect(result.balancingAuthority).toBe('MIDA')
    expect(result.demandRampPct).toBe(2.5)
    expect(result.carbonSpikeProbability).toBe(0.6)
    expect(result.curtailmentProbability).toBe(0.05)
    expect(result.importCarbonLeakageScore).toBe(0.12)
    expect(result.estimatedFlag).toBe(false)
    expect(result.syntheticFlag).toBe(false)
  })

  it('never throws when cache raises an error', async () => {
    mockGetCachedGridSignal.mockRejectedValue(new Error('Redis connection timeout'))

    // Should not throw; routing proceeds without enrichment
    const result = await routeGreen({
      preferredRegions: ['US-MIDA-PJM'],
    })
    expect(result.selectedRegion).toBe('US-MIDA-PJM')
  })

  it('routing result always has core required fields', async () => {
    mockGetCachedGridSignal.mockResolvedValue(null)

    const result = await routeGreen({
      preferredRegions: ['US-MIDA-PJM', 'US-CAL-CISO'],
    })

    expect(typeof result.selectedRegion).toBe('string')
    expect(typeof result.carbonIntensity).toBe('number')
    expect(typeof result.score).toBe('number')
    expect(typeof result.explanation).toBe('string')
    expect(['high', 'medium', 'low']).toContain(result.qualityTier)
    expect(Array.isArray(result.alternatives)).toBe(true)
  })
})
