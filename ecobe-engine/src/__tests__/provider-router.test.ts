import { ProviderRouter } from '../lib/carbon/provider-router'

// Mock external APIs
jest.mock('../lib/watttime', () => ({
  wattTime: {
    getCurrentMOER: jest.fn(),
    getMOERForecast: jest.fn(),
    getPredictedCleanWindows: jest.fn(),
  }
}))

jest.mock('../lib/electricity-maps', () => ({
  electricityMaps: {
    getCarbonIntensity: jest.fn(),
  }
}))

jest.mock('../lib/ember', () => ({
  ember: {
    getCarbonIntensityYearly: jest.fn().mockResolvedValue([]),
    getElectricityDemand: jest.fn().mockResolvedValue([]),
    getInstalledCapacity: jest.fn().mockResolvedValue([]),
  }
}))

jest.mock('../lib/grid-signals/grid-signal-cache', () => ({
  GridSignalCache: {
    cacheProviderDisagreement: jest.fn(),
    getCachedProviderDisagreement: jest.fn().mockResolvedValue(null),
  }
}))

jest.mock('../lib/grid-signals/grid-signal-audit', () => ({
  GridSignalAudit: {
    recordRoutingDecision: jest.fn(),
  }
}))

describe('ProviderRouter', () => {
  let router: ProviderRouter

  beforeEach(() => {
    jest.clearAllMocks()
    router = new ProviderRouter()
  })

  describe('getRoutingSignal', () => {
    it('should return fallback when all providers fail', async () => {
      const { wattTime } = require('../lib/watttime')
      const { electricityMaps } = require('../lib/electricity-maps')

      wattTime.getCurrentMOER.mockResolvedValue(null)
      wattTime.getMOERForecast.mockResolvedValue([])
      electricityMaps.getCarbonIntensity.mockResolvedValue(null)

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.carbonIntensity).toBe(450)
      expect(signal.source).toBe('fallback')
      expect(signal.provenance.fallbackUsed).toBe(true)
      expect(signal.confidence).toBe(0.05)
    })

    it('should use Electricity Maps as primary when available', async () => {
      const { wattTime } = require('../lib/watttime')
      const { electricityMaps } = require('../lib/electricity-maps')

      electricityMaps.getCarbonIntensity.mockResolvedValue({
        carbonIntensity: 250,
        zone: 'US-NY',
      })
      wattTime.getCurrentMOER.mockResolvedValue(null)
      wattTime.getMOERForecast.mockResolvedValue([])

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.source).toBe('electricity_maps')
      expect(signal.provenance.fallbackUsed).toBe(false)
    })

    it('should return correct shape for all provenance fields', async () => {
      const { electricityMaps } = require('../lib/electricity-maps')
      const { wattTime } = require('../lib/watttime')

      electricityMaps.getCarbonIntensity.mockResolvedValue({
        carbonIntensity: 300,
        zone: 'US-NY',
      })
      wattTime.getCurrentMOER.mockResolvedValue(null)
      wattTime.getMOERForecast.mockResolvedValue([])

      const signal = await router.getRoutingSignal('us-east-1', new Date())

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

    it('should blend WattTime and Electricity Maps signals', async () => {
      const { wattTime } = require('../lib/watttime')
      const { electricityMaps } = require('../lib/electricity-maps')

      electricityMaps.getCarbonIntensity.mockResolvedValue({
        carbonIntensity: 300,
        zone: 'US-NY',
      })
      wattTime.getCurrentMOER.mockResolvedValue({
        moer: 200,
        timestamp: new Date().toISOString()
      })

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.carbonIntensity).toBeGreaterThan(0)
      expect(signal.source).toBe('electricity_maps')
      expect(signal.provenance.contributingSources).toContain('electricity_maps')
      expect(signal.provenance.contributingSources).toContain('watttime')
    })

    it('should fall back to WattTime when Electricity Maps fails', async () => {
      const { wattTime } = require('../lib/watttime')
      const { electricityMaps } = require('../lib/electricity-maps')

      electricityMaps.getCarbonIntensity.mockResolvedValue(null)
      wattTime.getCurrentMOER.mockResolvedValue({
        moer: 350,
        timestamp: new Date().toISOString()
      })

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.source).toBe('watttime')
      expect(signal.carbonIntensity).toBe(350)
      expect(signal.provenance.fallbackUsed).toBe(true)
    })

    it('should use forecast data when current data is unavailable', async () => {
      const { wattTime } = require('../lib/watttime')
      const { electricityMaps } = require('../lib/electricity-maps')

      electricityMaps.getCarbonIntensity.mockResolvedValue(null)
      wattTime.getCurrentMOER.mockResolvedValue(null)
      wattTime.getMOERForecast.mockResolvedValue([
        {
          moer: 280,
          timestamp: new Date().toISOString()
        }
      ])

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.isForecast).toBe(true)
      expect(signal.carbonIntensity).toBe(280)
    })
  })

  describe('validateSignalQuality', () => {
    it('should return high for confident non-fallback signals', async () => {
      const result = await router.validateSignalQuality({
        carbonIntensity: 200,
        source: 'electricity_maps',
        isForecast: false,
        confidence: 0.85,
        provenance: {
          sourceUsed: 'ELECTRICITY_MAPS',
          contributingSources: ['electricity_maps'],
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

    it('should return medium for low-confidence signals', async () => {
      const result = await router.validateSignalQuality({
        carbonIntensity: 300,
        source: 'electricity_maps',
        isForecast: true,
        confidence: 0.5,
        provenance: {
          sourceUsed: 'ELECTRICITY_MAPS',
          contributingSources: ['electricity_maps'],
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
        source: 'electricity_maps',
        isForecast: false,
        confidence: 0.8,
        provenance: {
          sourceUsed: 'ELECTRICITY_MAPS',
          contributingSources: ['electricity_maps', 'watttime'],
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
        source: 'electricity_maps',
        isForecast: false,
        confidence: 0.8,
        provenance: {
          sourceUsed: 'ESTIMATED',
          contributingSources: ['electricity_maps'],
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

  describe('provider disagreement detection', () => {
    it('should return none for very low disagreement', async () => {
      const { electricityMaps } = require('../lib/electricity-maps')
      const { wattTime } = require('../lib/watttime')

      electricityMaps.getCarbonIntensity.mockResolvedValue({
        carbonIntensity: 300,
        zone: 'US-NY',
      })
      wattTime.getCurrentMOER.mockResolvedValue({
        moer: 305,
        timestamp: new Date().toISOString()
      })

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.provenance.disagreementFlag).toBe(false)
      expect(signal.provenance.disagreementPct).toBeLessThan(5)
    })

    it('should detect high disagreement between providers', async () => {
      const { electricityMaps } = require('../lib/electricity-maps')
      const { wattTime } = require('../lib/watttime')

      electricityMaps.getCarbonIntensity.mockResolvedValue({
        carbonIntensity: 200,
        zone: 'US-NY',
      })
      wattTime.getCurrentMOER.mockResolvedValue({
        moer: 400,
        timestamp: new Date().toISOString()
      })

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.provenance.disagreementFlag).toBe(true)
      expect(signal.provenance.disagreementPct).toBeGreaterThan(25)
    })
  })

  describe('structural profile validation', () => {
    it('should include structural profile validation in confidence adjustment', async () => {
      const { electricityMaps } = require('../lib/electricity-maps')
      const { wattTime } = require('../lib/watttime')
      const { ember } = require('../lib/ember')

      electricityMaps.getCarbonIntensity.mockResolvedValue({
        carbonIntensity: 300,
        zone: 'US-NY',
      })
      wattTime.getCurrentMOER.mockResolvedValue(null)

      ember.getCarbonIntensityYearly.mockResolvedValue([
        { date: 2024, carbon_intensity: 150 }
      ])
      ember.getElectricityDemand.mockResolvedValue([])
      ember.getInstalledCapacity.mockResolvedValue([])

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      // Signal should have confidence penalty due to deviation from Ember baseline
      expect(signal.confidence).toBeLessThan(0.85)
      expect(signal.provenance.validationNotes).toBeDefined()
    })
  })

  describe('null handling', () => {
    it('should handle null confidence values gracefully', async () => {
      const { electricityMaps } = require('../lib/electricity-maps')
      const { wattTime } = require('../lib/watttime')

      electricityMaps.getCarbonIntensity.mockResolvedValue({
        carbonIntensity: 250,
        zone: 'US-NY',
        // No confidence field
      })
      wattTime.getCurrentMOER.mockResolvedValue(null)
      wattTime.getMOERForecast.mockResolvedValue([]) // Explicit: no forecast

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.confidence).toBeGreaterThan(0)
      expect(typeof signal.confidence).toBe('number')
    })

    it('should handle null metadata gracefully', async () => {
      const { electricityMaps } = require('../lib/electricity-maps')
      const { wattTime } = require('../lib/watttime')

      electricityMaps.getCarbonIntensity.mockResolvedValue({
        carbonIntensity: 250,
        // Minimal response
      })
      wattTime.getCurrentMOER.mockResolvedValue(null)
      wattTime.getMOERForecast.mockResolvedValue([]) // Explicit: no forecast data

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal).toBeDefined()
      expect(signal.carbonIntensity).toBeCloseTo(250, 1) // Floating-point safe
    })

    it('should handle empty forecast arrays', async () => {
      const { electricityMaps } = require('../lib/electricity-maps')
      const { wattTime } = require('../lib/watttime')

      electricityMaps.getCarbonIntensity.mockResolvedValue(null)
      wattTime.getCurrentMOER.mockResolvedValue(null)
      wattTime.getMOERForecast.mockResolvedValue([]) // Empty forecast

      const signal = await router.getRoutingSignal('us-east-1', new Date())

      expect(signal.source).toBe('fallback')
    })
  })
})
