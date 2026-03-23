import { routeGreen, type RoutingResult } from '../lib/green-routing'

// Mock dependencies
jest.mock('../lib/electricity-maps')
jest.mock('../lib/db')
jest.mock('../lib/redis')
jest.mock('../lib/watttime')
jest.mock('../lib/carbon/provider-router', () => ({
  providerRouter: {
    getRoutingSignal: jest.fn(),
    validateSignalQuality: jest.fn(),
    recordSignalProvenance: jest.fn(),
  }
}))
jest.mock('../lib/grid-signals/grid-signal-cache')
jest.mock('../lib/grid-signals/grid-signal-audit')

describe('Routing Contract', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('routeGreen response contract', () => {
    it('should return all required fields in routing result', async () => {
      const { providerRouter } = require('../lib/carbon/provider-router')

      providerRouter.getRoutingSignal.mockResolvedValue({
        carbonIntensity: 250,
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
          disagreementPct: 0,
        }
      })

      providerRouter.validateSignalQuality.mockResolvedValue({
        qualityTier: 'high',
        meetsRequirements: true,
        reasons: []
      })

      const result = await routeGreen({
        preferredRegions: ['us-east-1']
      })

      // Check all contract fields exist
      expect(result).toHaveProperty('selectedRegion')
      expect(result).toHaveProperty('carbonIntensity')
      expect(result).toHaveProperty('score')
      expect(result).toHaveProperty('qualityTier')
      expect(result).toHaveProperty('carbon_delta_g_per_kwh')
      expect(result).toHaveProperty('forecast_stability')
      expect(result).toHaveProperty('provider_disagreement')
      expect(result).toHaveProperty('balancingAuthority')
      expect(result).toHaveProperty('demandRampPct')
      expect(result).toHaveProperty('carbonSpikeProbability')
      expect(result).toHaveProperty('curtailmentProbability')
      expect(result).toHaveProperty('importCarbonLeakageScore')
      expect(result).toHaveProperty('source_used')
      expect(result).toHaveProperty('validation_source')
      expect(result).toHaveProperty('fallback_used')
      expect(result).toHaveProperty('estimatedFlag')
      expect(result).toHaveProperty('syntheticFlag')
      expect(result).toHaveProperty('predicted_clean_window')
      expect(result).toHaveProperty('decisionFrameId')
      expect(result).toHaveProperty('alternatives')
    })

    it('should populate selectedRegion with lowest carbon option', async () => {
      const { providerRouter } = require('../lib/carbon/provider-router')

      providerRouter.getRoutingSignal
        .mockResolvedValueOnce({
          carbonIntensity: 300,
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
            disagreementPct: 0,
          }
        })
        .mockResolvedValueOnce({
          carbonIntensity: 150,
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
            disagreementPct: 0,
          }
        })

      providerRouter.validateSignalQuality.mockResolvedValue({
        qualityTier: 'high',
        meetsRequirements: true,
        reasons: []
      })

      const result = await routeGreen({
        preferredRegions: ['us-east-1', 'us-west-1']
      })

      expect(result.selectedRegion).toBe('us-west-1') // Lower carbon
      expect(result.carbonIntensity).toBe(150)
    })

    it('should set qualityTier from validation result', async () => {
      const { providerRouter } = require('../lib/carbon/provider-router')

      providerRouter.getRoutingSignal.mockResolvedValue({
        carbonIntensity: 250,
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
          disagreementPct: 0,
        }
      })

      providerRouter.validateSignalQuality.mockResolvedValue({
        qualityTier: 'medium',
        meetsRequirements: true,
        reasons: ['Moderate confidence']
      })

      const result = await routeGreen({
        preferredRegions: ['us-east-1']
      })

      expect(result.qualityTier).toBe('medium')
    })

    it('should include provider disagreement in contract', async () => {
      const { providerRouter } = require('../lib/carbon/provider-router')

      providerRouter.getRoutingSignal.mockResolvedValue({
        carbonIntensity: 250,
        source: 'electricity_maps',
        isForecast: false,
        confidence: 0.75,
        provenance: {
          sourceUsed: 'ELECTRICITY_MAPS::WATTTIME_30%',
          contributingSources: ['electricity_maps', 'watttime'],
          referenceTime: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          fallbackUsed: false,
          disagreementFlag: true,
          disagreementPct: 15,
        }
      })

      providerRouter.validateSignalQuality.mockResolvedValue({
        qualityTier: 'high',
        meetsRequirements: true,
        reasons: []
      })

      const result = await routeGreen({
        preferredRegions: ['us-east-1']
      })

      expect(result.provider_disagreement).toHaveProperty('flag')
      expect(result.provider_disagreement).toHaveProperty('pct')
      expect(result.provider_disagreement.flag).toBe(true)
      expect(result.provider_disagreement.pct).toBe(15)
    })

    it('should include grid signals in contract (balancingAuthority, demandRamp, etc)', async () => {
      const { providerRouter } = require('../lib/carbon/provider-router')

      providerRouter.getRoutingSignal.mockResolvedValue({
        carbonIntensity: 250,
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
          disagreementPct: 0,
        }
      })

      providerRouter.validateSignalQuality.mockResolvedValue({
        qualityTier: 'high',
        meetsRequirements: true,
        reasons: []
      })

      const result = await routeGreen({
        preferredRegions: ['us-east-1']
      })

      // Grid signals should be null-safe properties
      expect(typeof result.balancingAuthority === 'string' || result.balancingAuthority === null).toBe(true)
      expect(typeof result.demandRampPct === 'number' || result.demandRampPct === null).toBe(true)
      expect(typeof result.carbonSpikeProbability === 'number' || result.carbonSpikeProbability === null).toBe(true)
      expect(typeof result.curtailmentProbability === 'number' || result.curtailmentProbability === null).toBe(true)
      expect(typeof result.importCarbonLeakageScore === 'number' || result.importCarbonLeakageScore === null).toBe(true)
    })

    it('should include source and validation metadata', async () => {
      const { providerRouter } = require('../lib/carbon/provider-router')

      providerRouter.getRoutingSignal.mockResolvedValue({
        carbonIntensity: 250,
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
          disagreementPct: 0,
        }
      })

      providerRouter.validateSignalQuality.mockResolvedValue({
        qualityTier: 'high',
        meetsRequirements: true,
        reasons: []
      })

      const result = await routeGreen({
        preferredRegions: ['us-east-1']
      })

      expect(result.source_used).toBe('ELECTRICITY_MAPS')
      expect(result.fallback_used).toBe(false)
      expect(typeof result.estimatedFlag === 'boolean' || result.estimatedFlag === null).toBe(true)
      expect(typeof result.syntheticFlag === 'boolean' || result.syntheticFlag === null).toBe(true)
    })

    it('should include forecast stability in contract', async () => {
      const { providerRouter } = require('../lib/carbon/provider-router')

      providerRouter.getRoutingSignal.mockResolvedValue({
        carbonIntensity: 250,
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
          disagreementPct: 0,
        }
      })

      providerRouter.validateSignalQuality.mockResolvedValue({
        qualityTier: 'high',
        meetsRequirements: true,
        reasons: []
      })

      const result = await routeGreen({
        preferredRegions: ['us-east-1']
      })

      expect(['stable', 'medium', 'unstable', null]).toContain(result.forecast_stability)
    })

    it('should include predicted_clean_window in contract', async () => {
      const { providerRouter } = require('../lib/carbon/provider-router')

      providerRouter.getRoutingSignal.mockResolvedValue({
        carbonIntensity: 250,
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
          disagreementPct: 0,
        }
      })

      providerRouter.validateSignalQuality.mockResolvedValue({
        qualityTier: 'high',
        meetsRequirements: true,
        reasons: []
      })

      const result = await routeGreen({
        preferredRegions: ['us-east-1']
      })

      expect(result.predicted_clean_window === null || typeof result.predicted_clean_window === 'object').toBe(true)
    })

    it('should include decisionFrameId for audit/replay', async () => {
      const { providerRouter } = require('../lib/carbon/provider-router')

      providerRouter.getRoutingSignal.mockResolvedValue({
        carbonIntensity: 250,
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
          disagreementPct: 0,
        }
      })

      providerRouter.validateSignalQuality.mockResolvedValue({
        qualityTier: 'high',
        meetsRequirements: true,
        reasons: []
      })

      const result = await routeGreen({
        preferredRegions: ['us-east-1']
      })

      expect(result.decisionFrameId === null || typeof result.decisionFrameId === 'string').toBe(true)
    })

    it('should include alternatives with scores', async () => {
      const { providerRouter } = require('../lib/carbon/provider-router')

      providerRouter.getRoutingSignal
        .mockResolvedValueOnce({
          carbonIntensity: 300,
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
            disagreementPct: 0,
          }
        })
        .mockResolvedValueOnce({
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
            disagreementPct: 0,
          }
        })
        .mockResolvedValueOnce({
          carbonIntensity: 250,
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
            disagreementPct: 0,
          }
        })

      providerRouter.validateSignalQuality.mockResolvedValue({
        qualityTier: 'high',
        meetsRequirements: true,
        reasons: []
      })

      const result = await routeGreen({
        preferredRegions: ['us-east-1', 'us-west-1', 'eu-west-1']
      })

      expect(Array.isArray(result.alternatives)).toBe(true)
      expect(result.alternatives.length).toBeGreaterThan(0)

      for (const alt of result.alternatives) {
        expect(alt).toHaveProperty('region')
        expect(alt).toHaveProperty('carbonIntensity')
        expect(alt).toHaveProperty('score')
        expect(typeof alt.score).toBe('number')
        expect(alt.score).toBeGreaterThanOrEqual(0)
        expect(alt.score).toBeLessThanOrEqual(1)
      }
    })

    it('should include legacy lease fields for backward compatibility', async () => {
      const { providerRouter } = require('../lib/carbon/provider-router')

      providerRouter.getRoutingSignal.mockResolvedValue({
        carbonIntensity: 250,
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
          disagreementPct: 0,
        }
      })

      providerRouter.validateSignalQuality.mockResolvedValue({
        qualityTier: 'high',
        meetsRequirements: true,
        reasons: []
      })

      const result = await routeGreen({
        preferredRegions: ['us-east-1']
      })

      // Lease fields are optional but should be null-safe
      expect(result.lease_id === undefined || typeof result.lease_id === 'string').toBe(true)
      expect(result.lease_expires_at === undefined || typeof result.lease_expires_at === 'string').toBe(true)
      expect(result.must_revalidate_after === undefined || typeof result.must_revalidate_after === 'string').toBe(true)
    })

    it('should calculate score between 0 and 1', async () => {
      const { providerRouter } = require('../lib/carbon/provider-router')

      providerRouter.getRoutingSignal.mockResolvedValue({
        carbonIntensity: 250,
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
          disagreementPct: 0,
        }
      })

      providerRouter.validateSignalQuality.mockResolvedValue({
        qualityTier: 'high',
        meetsRequirements: true,
        reasons: []
      })

      const result = await routeGreen({
        preferredRegions: ['us-east-1']
      })

      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(1)
    })

    it('should preserve null values for unavailable grid signals', async () => {
      const { providerRouter } = require('../lib/carbon/provider-router')

      providerRouter.getRoutingSignal.mockResolvedValue({
        carbonIntensity: 250,
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

      providerRouter.validateSignalQuality.mockResolvedValue({
        qualityTier: 'low',
        meetsRequirements: false,
        reasons: ['Fallback signal']
      })

      const result = await routeGreen({
        preferredRegions: ['us-east-1']
      })

      // When using fallback, grid signals should be null
      expect(result.balancingAuthority).toBeNull()
      expect(result.demandRampPct).toBeNull()
      expect(result.carbonSpikeProbability).toBeNull()
      expect(result.curtailmentProbability).toBeNull()
      expect(result.importCarbonLeakageScore).toBeNull()
    })
  })
})
