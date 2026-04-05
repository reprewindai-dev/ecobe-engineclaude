import { ProviderRouter } from '../lib/carbon/provider-router'

// Mock external providers — WattTime is Tier 1 (locked doctrine)
jest.mock('../lib/watttime', () => ({
  wattTime: {
    getCurrentMOER: jest.fn(),
    getMOERForecast: jest.fn(),
    getPredictedCleanWindows: jest.fn(),
  }
}))

jest.mock('../lib/ember', () => ({
  ember: {
    getCarbonIntensityYearly: jest.fn().mockResolvedValue([]),
    getElectricityDemand: jest.fn().mockResolvedValue([]),
    getInstalledCapacity: jest.fn().mockResolvedValue([]),
    deriveStructuralProfile: jest.fn().mockResolvedValue(null),
  }
}))

jest.mock('../lib/grid-signals/gridstatus-client', () => ({
  gridStatus: {
    getFuelMix: jest.fn().mockResolvedValue(null),
  }
}))

jest.mock('../lib/grid-signals/grid-signal-cache', () => ({
  GridSignalCache: {
    cacheRoutingSignal: jest.fn().mockResolvedValue(undefined),
    getCachedRoutingSignal: jest.fn().mockResolvedValue(null),
    getCachedRoutingSignalWithSource: jest.fn().mockResolvedValue(null),
    cacheLastKnownGoodRoutingSignal: jest.fn().mockResolvedValue(undefined),
    getLastKnownGoodRoutingSignal: jest.fn().mockResolvedValue(null),
    getLastKnownGoodRoutingSignalWithSource: jest.fn().mockResolvedValue(null),
    cacheProviderDisagreement: jest.fn().mockResolvedValue(undefined),
    getCachedProviderDisagreement: jest.fn().mockResolvedValue(null),
  }
}))

jest.mock('../lib/grid-signals/grid-signal-audit', () => ({
  GridSignalAudit: {
    recordRoutingDecision: jest.fn(),
  }
}))

jest.mock('../lib/grid-signals/region-mapping', () => ({
  getRegionMapping: jest.fn().mockReturnValue(null),
}))

jest.mock('../lib/gb-carbon-intensity', () => ({
  gbCarbonIntensity: { getCurrentIntensity: jest.fn().mockResolvedValue(null) }
}))

jest.mock('../lib/denmark-carbon', () => ({
  denmarkCarbon: { getCarbonIntensity: jest.fn().mockResolvedValue(null) }
}))

jest.mock('../lib/finland-carbon', () => ({
  finlandCarbon: { getCarbonIntensity: jest.fn().mockResolvedValue(null) }
}))

jest.mock('../lib/ember/structural-profile', () => ({
  EmberStructuralProfile: jest.fn().mockImplementation(() => ({
    getStructuralProfile: jest.fn().mockResolvedValue(null),
  }))
}))

describe('ProviderRouter', () => {
  let router: ProviderRouter

  beforeEach(() => {
    jest.clearAllMocks()
    router = new ProviderRouter()
    // Prevent ember structural profile from providing a fallback signal between tests
    const { ember } = require('../lib/ember')
    ember.deriveStructuralProfile.mockResolvedValue(null)
  })

  describe('getRoutingSignal — tier order (WattTime Tier 1)', () => {
    it('should use WattTime MOER as primary signal for US regions', async () => {
      const { wattTime } = require('../lib/watttime')

      wattTime.getCurrentMOER.mockResolvedValue({
        moer: 320,
        timestamp: new Date().toISOString(),
        balancingAuthority: 'PJM',
      })

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.source).toBe('watttime')
      expect(signal.carbonIntensity).toBe(320)
      expect(signal.provenance.fallbackUsed).toBe(false)
      expect(signal.confidence).toBeGreaterThan(0.7)
    })

    it('should use WattTime MOER forecast when current is unavailable', async () => {
      const { wattTime } = require('../lib/watttime')

      wattTime.getCurrentMOER.mockResolvedValue(null)
      wattTime.getMOERForecast.mockResolvedValue([
        { moer: 280, timestamp: new Date().toISOString() }
      ])

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.isForecast).toBe(true)
      expect(signal.carbonIntensity).toBe(280)
      expect(signal.source).toBe('watttime')
    })

    it('should return fallback when all providers fail', async () => {
      const { wattTime } = require('../lib/watttime')

      wattTime.getCurrentMOER.mockResolvedValue(null)
      wattTime.getMOERForecast.mockResolvedValue([])

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.carbonIntensity).toBe(450)
      expect(signal.source).toBe('fallback')
      expect(signal.provenance.fallbackUsed).toBe(true)
      expect(signal.confidence).toBe(0.05)
    })

    it('should return correct provenance shape for all fields', async () => {
      const { wattTime } = require('../lib/watttime')

      wattTime.getCurrentMOER.mockResolvedValue({
        moer: 300,
        timestamp: new Date().toISOString(),
        balancingAuthority: 'CAISO',
      })

      const signal = await router.getRoutingSignal('us-west-2', new Date())

      expect(signal).toHaveProperty('carbonIntensity')
      expect(signal).toHaveProperty('source')
      expect(signal).toHaveProperty('isForecast')
      expect(signal).toHaveProperty('confidence')
      expect(signal.provenance).toHaveProperty('sourceUsed')
      expect(signal.provenance).toHaveProperty('contributingSources')
      expect(signal.provenance).toHaveProperty('referenceTime')
      expect(signal.provenance).toHaveProperty('fetchedAt')
      expect(signal.provenance).toHaveProperty('fallbackUsed')
      expect(signal.provenance).toHaveProperty('disagreementFlag')
      expect(signal.provenance).toHaveProperty('disagreementPct')
    })

    it('should handle empty forecast arrays and fall to static', async () => {
      const { wattTime } = require('../lib/watttime')

      wattTime.getCurrentMOER.mockResolvedValue(null)
      wattTime.getMOERForecast.mockResolvedValue([])

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.source).toBe('fallback')
    })
  })

  describe('validateSignalQuality', () => {
    it('should return high for confident WattTime non-fallback signals', async () => {
      const result = await router.validateSignalQuality({
        carbonIntensity: 200,
        source: 'watttime',
        isForecast: false,
        confidence: 0.85,
        signalMode: 'marginal',
        accountingMethod: 'marginal',
        provenance: {
          sourceUsed: 'WATTTIME',
          contributingSources: ['watttime'],
          referenceTime: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          fallbackUsed: false,
          disagreementFlag: false,
          disagreementPct: 2,
        }
      })

      expect(result.qualityTier).toBe('high')
      expect(result.meetsRequirements).toBe(true)
    })

    it('should return low for fallback signals', async () => {
      const result = await router.validateSignalQuality({
        carbonIntensity: 450,
        source: 'fallback',
        isForecast: false,
        confidence: 0.05,
        signalMode: 'fallback',
        accountingMethod: 'average',
        provenance: {
          sourceUsed: 'STATIC_FALLBACK',
          contributingSources: [],
          referenceTime: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          fallbackUsed: true,
          disagreementFlag: false,
          disagreementPct: 0,
        }
      })

      expect(result.qualityTier).toBe('low')
    })

    it('should return medium for low-confidence forecast signals', async () => {
      const result = await router.validateSignalQuality({
        carbonIntensity: 300,
        source: 'watttime',
        isForecast: true,
        confidence: 0.5,
        signalMode: 'marginal',
        accountingMethod: 'marginal',
        provenance: {
          sourceUsed: 'WATTTIME_FORECAST',
          contributingSources: ['watttime'],
          referenceTime: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          fallbackUsed: false,
          disagreementFlag: false,
          disagreementPct: 0,
        }
      })

      expect(result.qualityTier).toBe('medium')
    })

    it('should detect high provider disagreement', async () => {
      const result = await router.validateSignalQuality({
        carbonIntensity: 300,
        source: 'watttime',
        isForecast: false,
        confidence: 0.8,
        signalMode: 'marginal',
        accountingMethod: 'marginal',
        provenance: {
          sourceUsed: 'WATTTIME',
          contributingSources: ['watttime', 'ember'],
          referenceTime: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          fallbackUsed: false,
          disagreementFlag: true,
          disagreementPct: 30,
        }
      })

      expect(result.qualityTier).toBe('low')
      expect(result.reasons).toContain('High provider disagreement')
    })

    it('should flag estimated or synthetic data', async () => {
      const result = await router.validateSignalQuality({
        carbonIntensity: 300,
        source: 'watttime',
        isForecast: false,
        confidence: 0.8,
        signalMode: 'marginal',
        accountingMethod: 'marginal',
        provenance: {
          sourceUsed: 'ESTIMATED',
          contributingSources: ['watttime'],
          referenceTime: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          fallbackUsed: false,
          disagreementFlag: false,
          disagreementPct: 0,
        }
      })

      expect(result.qualityTier).toBe('low')
      expect(result.reasons).toContain('Using estimated or synthetic data')
    })
  })

  describe('structural profile validation (Ember Tier 3)', () => {
    it('should include Ember validation in confidence adjustment when signal deviates from baseline', async () => {
      const { wattTime } = require('../lib/watttime')
      const { ember } = require('../lib/ember')

      wattTime.getCurrentMOER.mockResolvedValue({
        moer: 300,
        timestamp: new Date().toISOString(),
        balancingAuthority: 'PJM',
      })

      ember.deriveStructuralProfile.mockResolvedValue({
        region: 'us-east-1',
        entityCode: 'USA',
        structuralCarbonBaseline: 150,
        carbonTrendDirection: 'flat',
        demandTrendTwh: 4000,
        demandPerCapita: 12,
        fossilDependenceScore: 0.6,
        renewableDependenceScore: 0.4,
        generationMixProfile: { Gas: 2000, Coal: 500, Wind: 400, Solar: 300 },
        windCapacityGw: 150,
        solarCapacityGw: 400,
        windCapacityTrend: 0.02,
        solarCapacityTrend: 0.07,
        confidenceRole: 'validation',
        source: 'ember',
        updatedAt: new Date().toISOString(),
      })

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.confidence).toBeLessThanOrEqual(0.9)
      expect(signal.provenance.validationNotes).toBeDefined()
    })
  })

  describe('null handling', () => {
    it('should handle null MOER response gracefully', async () => {
      const { wattTime } = require('../lib/watttime')

      wattTime.getCurrentMOER.mockResolvedValue(null)
      wattTime.getMOERForecast.mockResolvedValue([])

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.confidence).toBeGreaterThan(0)
      expect(typeof signal.confidence).toBe('number')
      expect(signal.source).toBe('fallback')
    })

    it('should handle WattTime throw gracefully and fall to static', async () => {
      const { wattTime } = require('../lib/watttime')

      wattTime.getCurrentMOER.mockRejectedValue(new Error('WattTime API timeout'))
      wattTime.getMOERForecast.mockResolvedValue([])

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal).toBeDefined()
      expect(signal.source).toBe('fallback')
    })

    it('should handle empty forecast arrays and degrade to static', async () => {
      const { wattTime } = require('../lib/watttime')

      wattTime.getCurrentMOER.mockResolvedValue(null)
      wattTime.getMOERForecast.mockResolvedValue([])

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.source).toBe('fallback')
    })
  })

  describe('getRoutingSignalRecord', () => {
    it('uses last-known-good state conservatively when live fetch degrades', async () => {
      const { wattTime } = require('../lib/watttime')
      const { GridSignalCache } = require('../lib/grid-signals/grid-signal-cache')

      wattTime.getCurrentMOER.mockResolvedValue(null)
      wattTime.getMOERForecast.mockResolvedValue([])
      GridSignalCache.getLastKnownGoodRoutingSignal.mockResolvedValue({
        signal: {
          carbonIntensity: 180,
          source: 'watttime',
          isForecast: false,
          confidence: 0.9,
          signalMode: 'marginal',
          accountingMethod: 'marginal',
          provenance: {
            sourceUsed: 'WATTTIME_MOER',
            contributingSources: ['watttime'],
            referenceTime: new Date().toISOString(),
            fetchedAt: new Date().toISOString(),
            fallbackUsed: false,
            disagreementFlag: false,
            disagreementPct: 0,
          },
        },
        fetchedAt: new Date().toISOString(),
        stalenessSec: 30,
        lastLatencyMs: 22,
        degraded: false,
      })

      const record = await router.getRoutingSignalRecord('us-east-1', new Date())

      expect(record.signal.provenance.sourceUsed.startsWith('LKG_')).toBe(true)
      expect(record.signal.provenance.fallbackUsed).toBe(true)
      expect(record.signal.carbonIntensity).toBeGreaterThan(180)
      expect(record.degraded).toBe(true)
    })
  })

  describe('getHotPathRoutingSignalRecord', () => {
    it('uses cache-first precedence and never falls through to live providers when warm data exists', async () => {
      const { GridSignalCache } = require('../lib/grid-signals/grid-signal-cache')
      const { wattTime } = require('../lib/watttime')

      GridSignalCache.getCachedRoutingSignalWithSource.mockResolvedValue({
        source: 'warm',
        record: {
          signal: {
            carbonIntensity: 140,
            source: 'watttime',
            isForecast: false,
            confidence: 0.92,
            signalMode: 'marginal',
            accountingMethod: 'marginal',
            provenance: {
              sourceUsed: 'WATTTIME_MOER',
              contributingSources: ['watttime'],
              referenceTime: new Date().toISOString(),
              fetchedAt: new Date().toISOString(),
              fallbackUsed: false,
              disagreementFlag: false,
              disagreementPct: 0,
            },
          },
          fetchedAt: new Date().toISOString(),
          stalenessSec: 4,
          lastLatencyMs: 8,
          degraded: false,
          cacheSource: 'warm',
        },
      })

      const record = await router.getHotPathRoutingSignalRecord('us-east-1', new Date())

      expect(record.cacheSource).toBe('warm')
      expect(record.signal.provenance.sourceUsed.startsWith('WARM_CACHE_')).toBe(true)
      expect(GridSignalCache.getLastKnownGoodRoutingSignalWithSource).not.toHaveBeenCalled()
      expect(wattTime.getCurrentMOER).not.toHaveBeenCalled()
      expect(wattTime.getMOERForecast).not.toHaveBeenCalled()
    })

    it('falls back to deterministic degraded-safe output when no hot-path cache data exists', async () => {
      const { GridSignalCache } = require('../lib/grid-signals/grid-signal-cache')
      const { wattTime } = require('../lib/watttime')

      GridSignalCache.getCachedRoutingSignalWithSource.mockResolvedValue(null)
      GridSignalCache.getLastKnownGoodRoutingSignalWithSource.mockResolvedValue(null)

      const record = await router.getHotPathRoutingSignalRecord('us-east-1', new Date())

      expect(record.cacheSource).toBe('degraded-safe')
      expect(record.signal.source).toBe('fallback')
      expect(record.signal.provenance.fallbackUsed).toBe(true)
      expect(wattTime.getCurrentMOER).not.toHaveBeenCalled()
      expect(wattTime.getMOERForecast).not.toHaveBeenCalled()
    })

    it('carries forward disagreement provenance when degraded-safe output is derived from cached state', async () => {
      const { GridSignalCache } = require('../lib/grid-signals/grid-signal-cache')

      GridSignalCache.getCachedRoutingSignalWithSource.mockResolvedValue({
        source: 'redis',
        record: {
          signal: {
            carbonIntensity: 210,
            source: 'watttime',
            isForecast: false,
            confidence: 0.41,
            signalMode: 'fallback',
            accountingMethod: 'average',
            provenance: {
              sourceUsed: 'REDIS_CACHE_WATTTIME_MOER',
              contributingSources: ['watttime', 'ember'],
              referenceTime: new Date().toISOString(),
              fetchedAt: new Date().toISOString(),
              fallbackUsed: true,
              disagreementFlag: true,
              disagreementPct: 28,
              validationNotes: 'High provider disagreement',
            },
          },
          fetchedAt: new Date().toISOString(),
          stalenessSec: 91,
          lastLatencyMs: 14,
          degraded: true,
          cacheSource: 'redis',
        },
      })
      GridSignalCache.getLastKnownGoodRoutingSignalWithSource.mockResolvedValue(null)

      const record = await router.getHotPathRoutingSignalRecord('us-east-1', new Date())

      expect(record.cacheSource).toBe('degraded-safe')
      expect(record.signal.provenance.sourceUsed.startsWith('DEGRADED_SAFE_')).toBe(true)
      expect(record.signal.provenance.disagreementFlag).toBe(true)
      expect(record.signal.provenance.disagreementPct).toBe(28)
      expect(record.signal.provenance.validationNotes).toContain('deterministic degraded-safe fallback')
    })
  })

  describe('degraded-safe quality posture', () => {
    it('marks deterministic degraded-safe sources as low quality with an explicit reason', async () => {
      const result = await router.validateSignalQuality({
        carbonIntensity: 450,
        source: 'fallback',
        isForecast: false,
        confidence: 0.05,
        signalMode: 'fallback',
        accountingMethod: 'average',
        provenance: {
          sourceUsed: 'DEGRADED_SAFE_WATTTIME_MOER',
          contributingSources: ['watttime'],
          referenceTime: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          fallbackUsed: true,
          disagreementFlag: false,
          disagreementPct: 0,
        }
      })

      expect(result.qualityTier).toBe('low')
      expect(result.reasons).toContain('Deterministic degraded-safe fallback active')
      expect(result.meetsRequirements).toBe(true)
    })

    it('marks last-known-good fallback with an explicit safety-margin reason', async () => {
      const result = await router.validateSignalQuality({
        carbonIntensity: 275,
        source: 'watttime',
        isForecast: false,
        confidence: 0.62,
        signalMode: 'fallback',
        accountingMethod: 'average',
        provenance: {
          sourceUsed: 'LKG_WATTTIME_MOER',
          contributingSources: ['watttime'],
          referenceTime: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          fallbackUsed: true,
          disagreementFlag: false,
          disagreementPct: 0,
        }
      })

      expect(result.qualityTier).toBe('low')
      expect(result.reasons).toContain('Using last-known-good safety margin')
    })
  })
})
