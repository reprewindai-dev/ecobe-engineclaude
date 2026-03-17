import { wattTime } from '../watttime'
import { electricityMaps } from '../electricity-maps'
import { ember } from '../ember'
import { GridSignalCache } from '../grid-signals/grid-signal-cache'
import { GridSignalAudit } from '../grid-signals/grid-signal-audit'
import { EmberStructuralProfile, type EmberData, type RegionStructuralProfile } from '../ember/structural-profile'

interface WeightedSignal {
  provider: ProviderSignal
  weight: number
}

export interface ProviderSignal {
  carbonIntensity: number // gCO2eq/kWh
  isForecast: boolean
  source: string
  timestamp: string
  estimatedFlag: boolean
  syntheticFlag: boolean
  confidence?: number
  metadata?: Record<string, unknown>
}

export interface ProviderDisagreement {
  level: 'none' | 'low' | 'medium' | 'high' | 'severe'
  disagreementPct: number
  providers: string[]
  values: number[]
}

export interface RoutingSignal {
  carbonIntensity: number
  source: 'watttime' | 'electricity_maps' | 'ember' | 'fallback'
  isForecast: boolean
  confidence: number
  provenance: {
    sourceUsed: string
    contributingSources: string[]
    referenceTime: string
    fetchedAt: string
    fallbackUsed: boolean
    disagreementFlag: boolean
    disagreementPct: number
    validationNotes?: string
  }
}

/**
 * PROVIDER DOCTRINE – LOCKED HIERARCHY (REV 2026-03-12)
 *
 * PRIMARY (Live Carbon Signal)
 *  - Electricity Maps => authoritative realtime intensity + flow-traced context
 *  - Required for every routing decision
 *
 * SECONDARY (Marginal Signal Amplifier)
 *  - WattTime => marginal operating emission rate (MOER) enriches primary
 *  - Never used alone; always blended with Electricity Maps weight
 *
 * BASELINE / VALIDATION
 *  - Ember => structural baseline + historical sanity check
 *  - Supplies confidence dampening when primary deviates beyond tolerance
 *
 * FALLBACK
 *  - Static fallback only when both API providers are unavailable
 */
export class ProviderRouter {
  /**
   * Produce a routing signal aligned with the locked provider stack:
   * Electricity Maps (primary) + WattTime (marginal) blended into a
   * confidence-weighted score, with Ember providing baseline validation.
   */
  async getRoutingSignal(region: string, timestamp: Date): Promise<RoutingSignal> {
    const referenceTime = timestamp.toISOString()
    const fetchedAt = new Date().toISOString()

    const electricityMapsSignal = await this.getElectricityMapsSignal(region, timestamp)
    const wattTimeSignal = await this.getWattTimeSignal(region, timestamp)

    if (electricityMapsSignal) {
      const weightedSignals: WeightedSignal[] = [
        { provider: electricityMapsSignal, weight: electricityMapsSignal.confidence ?? 0.7 }
      ]

      if (wattTimeSignal) {
        const marginWeight = wattTimeSignal.confidence ?? (wattTimeSignal.isForecast ? 0.5 : 0.7)
        weightedSignals.push({ provider: wattTimeSignal, weight: marginWeight })
      }

      const blended = this.blendSignals(weightedSignals)
      // Pass raw provider signals for accurate disagreement — do NOT re-fetch
      const rawSignals = weightedSignals.map(s => s.provider)
      const validation = await this.validateWithEmber(blended, region, timestamp, rawSignals)

      return {
        carbonIntensity: blended.carbonIntensity,
        source: 'electricity_maps',
        isForecast: blended.isForecast,
        confidence: validation.adjustedConfidence,
        provenance: {
          sourceUsed: blended.provenanceSource,
          contributingSources: weightedSignals.map((s) => s.provider.source),
          referenceTime,
          fetchedAt,
          fallbackUsed: false,
          disagreementFlag: validation.disagreement.level !== 'none',
          disagreementPct: validation.disagreement.disagreementPct,
          validationNotes: validation.validationNotes
        }
      }
    }

    if (wattTimeSignal) {
      const validation = await this.validateWithEmber(wattTimeSignal, region, timestamp, [wattTimeSignal])

      return {
        carbonIntensity: wattTimeSignal.carbonIntensity,
        source: 'watttime',
        isForecast: wattTimeSignal.isForecast,
        confidence: validation.adjustedConfidence,
        provenance: {
          sourceUsed: wattTimeSignal.metadata?.signalType === 'forecast_moer' ? 'WATTTIME_MOER_FORECAST' : 'WATTTIME_MOER',
          contributingSources: ['watttime'],
          referenceTime,
          fetchedAt,
          fallbackUsed: true,
          disagreementFlag: validation.disagreement.level !== 'none',
          disagreementPct: validation.disagreement.disagreementPct,
          validationNotes: validation.validationNotes
        }
      }
    }

    return {
      carbonIntensity: 450,
      source: 'fallback',
      isForecast: false,
      confidence: 0.05,
      provenance: {
        sourceUsed: 'STATIC_FALLBACK',
        contributingSources: [],
        referenceTime,
        fetchedAt,
        fallbackUsed: true,
        disagreementFlag: false,
        disagreementPct: 0,
        validationNotes: 'Primary and marginal providers unavailable'
      }
    }
  }

  /**
   * Get WattTime MOER signal (marginal amplifier)
   */
  private async getWattTimeSignal(region: string, timestamp: Date): Promise<ProviderSignal | null> {
    try {
      // Try current MOER first
      const currentMoer = await wattTime.getCurrentMOER(region)
      if (currentMoer) {
        return {
          carbonIntensity: currentMoer.moer,
          isForecast: false,
          source: 'watttime',
          timestamp: currentMoer.timestamp,
          estimatedFlag: false,
          syntheticFlag: false,
          confidence: 0.9,
          metadata: { signalType: 'current_moer' }
        }
      }

      // Fall back to MOER forecast for future timestamps
      const forecastMoer = await wattTime.getMOERForecast(region, timestamp)
      if (forecastMoer.length > 0) {
        const forecast = forecastMoer[0]
        return {
          carbonIntensity: forecast.moer,
          isForecast: true,
          source: 'watttime',
          timestamp: forecast.timestamp,
          estimatedFlag: true,
          syntheticFlag: false,
          confidence: 0.7,
          metadata: { signalType: 'forecast_moer', forecastHorizon: forecast.timestamp }
        }
      }

    } catch (error) {
      console.warn(`WattTime signal failed for ${region}:`, error)
    }

    return null
  }

  /**
   * Get Electricity Maps signal (validation/intelligence only)
   */
  private async getElectricityMapsSignal(region: string, timestamp: Date): Promise<ProviderSignal | null> {
    try {
      const intensity = await electricityMaps.getCarbonIntensity(region)
      if (intensity) {
        return {
          carbonIntensity: intensity.carbonIntensity,
          isForecast: false,
          source: 'electricity_maps',
          timestamp: (intensity as any).date || new Date().toISOString(),
          estimatedFlag: (intensity as any).estimated ?? false,
          syntheticFlag: false,
          confidence: 0.7,
          metadata: {
            signalType: 'current_intensity',
            zone: intensity.zone,
            zoneName: intensity.zone || 'Unknown'
          }
        }
      }
    } catch (error) {
      console.warn(`Electricity Maps signal failed for ${region}:`, error)
    }

    return null
  }

  /**
   * Blend provider signals using confidence weights
   */
  private blendSignals(signals: WeightedSignal[]): {
    carbonIntensity: number
    isForecast: boolean
    provenanceSource: string
  } {
    if (signals.length === 0) {
      return {
        carbonIntensity: 0,
        isForecast: false,
        provenanceSource: 'NO_SIGNAL'
      }
    }

    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0)
    if (totalWeight === 0) {
      return {
        carbonIntensity: signals[0].provider.carbonIntensity,
        isForecast: signals[0].provider.isForecast,
        provenanceSource: signals[0].provider.source.toUpperCase()
      }
    }

    const blendedIntensity =
      signals.reduce((sum, s) => sum + s.provider.carbonIntensity * s.weight, 0) / totalWeight

    const forecastWeight = signals.reduce(
      (sum, s) => sum + (s.provider.isForecast ? s.weight : 0),
      0
    )

    const provenanceSource = signals
      .map((s) => `${s.provider.source.toUpperCase()}_${Math.round((s.weight / totalWeight) * 100)}%`)
      .join('::')

    return {
      carbonIntensity: blendedIntensity,
      isForecast: forecastWeight / totalWeight > 0.4,
      provenanceSource
    }
  }

  /**
   * Validate blended signal against Ember baseline to adjust confidence.
   * When rawSignals are provided, uses those for disagreement calculation
   * instead of re-fetching (avoids comparing blended vs raw which deflates disagreement).
   */
  private async validateWithEmber(
    signal: ProviderSignal | { carbonIntensity: number; isForecast: boolean; provenanceSource: string },
    region: string,
    timestamp: Date,
    rawSignals?: ProviderSignal[]
  ): Promise<{
    adjustedConfidence: number
    disagreement: ProviderDisagreement
    validationNotes?: string
  }> {
    // Use raw provider signals for disagreement (when available)
    // This avoids the bug of comparing a blended signal against a re-fetched provider
    let disagreementSignals: ProviderSignal[]

    if (rawSignals && rawSignals.length > 0) {
      disagreementSignals = rawSignals
    } else {
      // Fallback: construct from the signal itself
      disagreementSignals = []
      if ('source' in signal) {
        disagreementSignals.push(signal)
      } else {
        disagreementSignals.push({
          carbonIntensity: signal.carbonIntensity,
          isForecast: signal.isForecast,
          source: 'electricity_maps',
          timestamp: timestamp.toISOString(),
          estimatedFlag: false,
          syntheticFlag: false
        })
      }
    }

    const disagreement = this.calculateDisagreement(disagreementSignals)

    let validationNotes: string | undefined
    let confidencePenalty = 0

    const emberProfile = await this.getStructuralProfile(region)
    if (emberProfile?.structuralCarbonBaseline) {
      const deviation = Math.abs(emberProfile.structuralCarbonBaseline - signal.carbonIntensity)
      const deviationPct = (deviation / Math.max(emberProfile.structuralCarbonBaseline, 1)) * 100

      if (deviationPct > 30) {
        confidencePenalty += 0.3
        validationNotes = `High deviation (${deviationPct.toFixed(1)}%) from Ember baseline`
      } else if (deviationPct > 15) {
        confidencePenalty += 0.15
        validationNotes = `Moderate deviation (${deviationPct.toFixed(1)}%) from Ember baseline`
      }
    }

    if (disagreement.level === 'high') {
      confidencePenalty += 0.2
      validationNotes = validationNotes
        ? `${validationNotes}; High provider disagreement`
        : 'High provider disagreement'
    } else if (disagreement.level === 'medium') {
      confidencePenalty += 0.1
      validationNotes = validationNotes
        ? `${validationNotes}; Moderate provider disagreement`
        : 'Moderate provider disagreement'
    }

    const baseConfidence =
      'confidence' in signal && typeof signal.confidence === 'number'
        ? signal.confidence
        : 0.75

    const adjustedConfidence = Math.max(0.05, baseConfidence - confidencePenalty)

    return {
      adjustedConfidence,
      disagreement,
      validationNotes
    }
  }

  /**
   * Calculate provider disagreement
   */
  private calculateDisagreement(signals: ProviderSignal[]): ProviderDisagreement {
    if (signals.length < 2) {
      return {
        level: 'none',
        disagreementPct: 0,
        providers: signals.map(s => s.source),
        values: signals.map(s => s.carbonIntensity)
      }
    }

    const values = signals.map(s => s.carbonIntensity)
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length
    const maxDeviation = Math.max(...values.map(v => Math.abs(v - mean)))
    const meanValue = mean || 1
    const disagreementPct = (maxDeviation / meanValue) * 100

    let level: ProviderDisagreement['level'] = 'none'
    if (disagreementPct > 50) level = 'severe'
    else if (disagreementPct > 25) level = 'high'
    else if (disagreementPct > 10) level = 'medium'
    else if (disagreementPct > 5) level = 'low'

    return {
      level,
      disagreementPct,
      providers: signals.map(s => s.source),
      values
    }
  }

  /**
   * Get structural profile from Ember (validation/context only)
   * This is NOT used for routing decisions
   */
  async getStructuralProfile(region: string): Promise<RegionStructuralProfile | null> {
    try {
      const entityCode = region.toUpperCase()
      const emberData = await this.fetchEmberStructuralData(entityCode)

      if (!emberData) {
        return null
      }

      const profile = EmberStructuralProfile.deriveStructuralProfile(emberData, region)

      const validation = EmberStructuralProfile.validateProfile(profile)
      if (!validation.isValid) {
        console.warn('Ember structural profile warnings:', validation.warnings)
      }

      return profile
    } catch (error) {
      console.warn(`Failed to get Ember structural profile for ${region}:`, error)
    }

    return null
  }

  private async fetchEmberStructuralData(entityCode: string): Promise<EmberData | null> {
    const [carbonIntensityYearly, demandYearly, capacityMonthly] = await Promise.all([
      ember.getCarbonIntensityYearly(entityCode),
      ember.getElectricityDemand(entityCode, 'yearly'),
      ember.getInstalledCapacity(entityCode)
    ])

    if (
      carbonIntensityYearly.length === 0 &&
      demandYearly.length === 0 &&
      capacityMonthly.length === 0
    ) {
      return null
    }

    const emberData: EmberData = {
      carbonIntensity: carbonIntensityYearly.map((point) => ({
        year: point.date,
        value: Number.isFinite(point.carbon_intensity) ? point.carbon_intensity : null
      })),
      demand: demandYearly.map((point) => ({
        year: point.date,
        value: Number.isFinite(point.value) ? point.value : null
      })),
      capacity: capacityMonthly.map((point) => ({
        year: point.date,
        fuelTech: point.technology ?? 'unknown',
        value: Number.isFinite(point.capacity_mw) ? point.capacity_mw : null
      }))
    }

    return emberData
  }

  /**
   * Check if signal quality meets routing requirements
   */
  async validateSignalQuality(signal: RoutingSignal): Promise<{
    meetsRequirements: boolean
    qualityTier: 'high' | 'medium' | 'low'
    reasons: string[]
  }> {
    const reasons: string[] = []
    let qualityTier: 'high' | 'medium' | 'low' = 'high'

    // Check confidence
    if (signal.confidence < 0.3) {
      qualityTier = 'low'
      reasons.push('Very low confidence')
    } else if (signal.confidence < 0.6) {
      qualityTier = 'medium'
      reasons.push('Low confidence')
    }

    // Check for fallback usage
    if (signal.provenance.fallbackUsed) {
      qualityTier = 'low'
      reasons.push('Using fallback signal')
    }

    // Check for provider disagreement
    if (signal.provenance.disagreementFlag) {
      if (signal.provenance.disagreementPct > 25) {
        qualityTier = 'low'
        reasons.push('High provider disagreement')
      } else if (signal.provenance.disagreementPct > 10) {
        qualityTier = 'medium'
        reasons.push('Moderate provider disagreement')
      }
    }

    // Check for estimated/synthetic data
    if (signal.provenance.sourceUsed.includes('ESTIMATED') || 
        signal.provenance.sourceUsed.includes('SYNTHETIC')) {
      qualityTier = 'low'
      reasons.push('Using estimated or synthetic data')
    }

    const meetsRequirements = qualityTier !== 'low' || signal.provenance.fallbackUsed

    return { meetsRequirements, qualityTier, reasons }
  }

  /**
   * Cache routing signal for performance
   */
  async cacheRoutingSignal(region: string, signal: RoutingSignal, timestamp: Date): Promise<void> {
    const cacheKey = `routing-signal:${region}:${timestamp.toISOString()}`
    await GridSignalCache.cacheProviderDisagreement(
      region,
      timestamp.toISOString(),
      {
        level: signal.provenance.disagreementFlag ? 'medium' : 'none',
        disagreementPct: signal.provenance.disagreementPct,
        providers: [signal.source],
        values: [signal.carbonIntensity]
      }
    )
  }

  /**
   * Get cached routing signal
   */
  async getCachedRoutingSignal(region: string, timestamp: Date): Promise<RoutingSignal | null> {
    const cached = await GridSignalCache.getCachedProviderDisagreement(
      region,
      timestamp.toISOString()
    )

    if (cached && cached.level !== 'severe') {
      // Reconstruct routing signal from cached data
      return {
        carbonIntensity: cached.values[0] || 400,
        source: cached.providers[0] as any,
        isForecast: false,
        confidence: 0.8,
        provenance: {
          sourceUsed: `CACHED_${cached.providers[0]}`,
          contributingSources: cached.providers,
          referenceTime: timestamp.toISOString(),
          fetchedAt: new Date().toISOString(),
          fallbackUsed: false,
          disagreementFlag: cached.level !== 'none',
          disagreementPct: cached.disagreementPct
        }
      }
    }

    return null
  }

  /**
   * Record signal provenance for audit
   */
  async recordSignalProvenance(signal: RoutingSignal, commandId: string): Promise<void> {
    await GridSignalAudit.recordRoutingDecision(
      commandId,
      signal.source === 'watttime' ? 'US' : signal.source, // Simplified region mapping
      {
        balancingAuthority: signal.source === 'watttime' ? 'WATTTIME' : null,
        demandRampPct: null, // Would come from grid signals
        carbonSpikeProbability: null,
        curtailmentProbability: null,
        importCarbonLeakageScore: null,
        signalQuality: signal.confidence > 0.7 ? 'high' : signal.confidence > 0.4 ? 'medium' : 'low',
        estimatedFlag: signal.provenance.sourceUsed.includes('ESTIMATED'),
        syntheticFlag: signal.provenance.sourceUsed.includes('SYNTHETIC')
      },
      signal.provenance
    )
  }
}

export const providerRouter = new ProviderRouter()
