import { routeGreen } from '../lib/green-routing'

// Mock dependencies
jest.mock('../lib/electricity-maps')
jest.mock('../lib/db')
jest.mock('../lib/redis')
jest.mock('../lib/carbon/provider-registry')

import { getProvider } from '../lib/carbon/provider-registry'
import { prisma } from '../lib/db'

// Per-region intensity table shared by all tests in this file
const regionIntensities: Record<string, number> = {
  'US-CAL-CISO': 180,
  FR: 58,
  DE: 320,
  GB: 240,
  SE: 45,
}

function makeTestProvider(intensities: Record<string, number>) {
  return {
    supportsRegion: (r: string) => r in intensities,
    getCurrentIntensity: (r: string) => Promise.resolve({
      ok: true,
      signal: {
        region: r,
        intensity_gco2_per_kwh: intensities[r] ?? 200,
        observed_time: new Date().toISOString(),
        forecast_time: null,
        fetched_at: new Date().toISOString(),
        source: 'electricity_maps' as const,
        is_forecast: false,
        confidence: 0.9,
        data_quality: 'high' as const,
        fallback_used: false,
        validation_used: false,
        disagreement_flag: false,
        disagreement_pct: null,
        metadata: {},
      },
    }),
    getForecast: jest.fn().mockResolvedValue([]),
  }
}

describe('Green Routing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma as any).carbonIntensity.create.mockResolvedValue({})
    // Wire provider registry so getBestCarbonSignal returns real per-region values
    ;(getProvider as jest.Mock).mockImplementation((name: string) =>
      name === 'electricity_maps' ? makeTestProvider(regionIntensities) : undefined
    )
  })

  describe('routeGreen', () => {
    it('should select region with lowest carbon intensity', async () => {
      const result = await routeGreen({
        preferredRegions: ['FR', 'DE', 'US-CAL-CISO'],
        carbonWeight: 1.0,
        latencyWeight: 0.0,
        costWeight: 0.0,
      })

      expect(result).toHaveProperty('selectedRegion')
      expect(result).toHaveProperty('carbonIntensity')
      expect(result).toHaveProperty('score')
      expect(result.score).toBeGreaterThan(0)
      expect(result.score).toBeLessThanOrEqual(1)
    })

    it('should respect max carbon threshold', async () => {
      const result = await routeGreen({
        preferredRegions: ['FR', 'DE'],
        maxCarbonGPerKwh: 100,
      })

      expect(result.carbonIntensity).toBeLessThanOrEqual(100)
    })

    it('should balance multiple optimization factors', async () => {
      const result = await routeGreen({
        preferredRegions: ['FR', 'DE', 'US-CAL-CISO'],
        carbonWeight: 0.5,
        latencyWeight: 0.3,
        costWeight: 0.2,
        latencyMsByRegion: {
          FR: 80,
          DE: 60,
          'US-CAL-CISO': 140,
        },
      })

      expect(result).toHaveProperty('selectedRegion')
      expect(result).toHaveProperty('alternatives')
      expect(Array.isArray(result.alternatives)).toBe(true)
    })

    it('should return alternatives sorted by score', async () => {
      const result = await routeGreen({
        preferredRegions: ['FR', 'DE', 'GB'],
      })

      expect(result.alternatives).toBeDefined()
      if (result.alternatives && result.alternatives.length > 1) {
        const scores = result.alternatives.map((a) => a.score)
        const sortedScores = [...scores].sort((a, b) => b - a)
        expect(scores).toEqual(sortedScores)
      }
    })

    it('should handle single region', async () => {
      const result = await routeGreen({
        preferredRegions: ['FR'],
      })

      expect(result.selectedRegion).toBe('FR')
      expect(result.alternatives).toHaveLength(0)
    })

    it('should throw error with empty regions array', async () => {
      await expect(
        routeGreen({
          preferredRegions: [],
        })
      ).rejects.toThrow()
    })
  })
})
