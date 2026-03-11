import { wattTime } from '../watttime'
import { electricityMaps } from '../electricity-maps'
import { ember } from '../ember'
import { GridSignalCache } from '../grid-signals/grid-signal-cache'
import { GridSignalAudit } from '../grid-signals/grid-signal-audit'
import { EmberStructuralProfile, type RegionStructuralProfile } from '../ember/structural-profile'

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
  source: 'watttime' | 'electricity_maps' | 'eia930' | 'fallback'
  isForecast: boolean
  confidence: number
  provenance: {
    sourceUsed: string
    validationSource?: string
    referenceTime: string
    fetchedAt: string
    fallbackUsed: boolean
    disagreementFlag: boolean
    disagreementPct: number
  }
}

/**
 * PROVIDER DOCTRINE - LOCKED HIERARCHY
 * 
 * 1. WattTime MOER + MOER forecast = PRIMARY CAUSAL ROUTING SIGNAL
 *    - Drives all routing and delay scheduling decisions
 *    - Electricity Maps MUST NOT replace WattTime in fast-path routing
 * 
 * 2. Electricity Maps = COHERENT GRID INTELLIGENCE
 *    - Flow-traced carbon context
 *    - Validation and cross-checking only
 *    - NOT for fast-path routing decisions
 * 
 * 3. Ember = STRUCTURAL CONTEXT + VALIDATION ONLY
 *    - NOT a real-time routing provider
 *    - Structural carbon baseline, trends, capacity analysis
 *    - Validation of signal plausibility
 * 
 * 4. EIA-930 = PREDICTIVE TELEMETRY
 *    - Grid stress indicators, demand trends
 *    - Derived features for routing enhancement
 *    - NOT primary carbon intensity source
 */
export class ProviderRouter {
  /**
   * Get routing signal with strict provider hierarchy enforcement
   * WattTime is ALWAYS the primary source for routing decisions
   */
  async getRoutingSignal(region: string, timestamp: Date): Promise<RoutingSignal> {
    const referenceTime = timestamp.toISOString()
    const fetchedAt = new Date().toISOString()

    // 1. PRIMARY: Try WattTime MOER (current or forecast)
    const watttimeSignal = await this.getWattTimeSignal(region, timestamp)
    
    if (watttimeSignal) {
      // Validate with other providers for disagreement detection
      const validation = await this.validateSignal(watttimeSignal, region, timestamp)
      
      return {
        carbonIntensity: watttimeSignal.carbonIntensity,
        source: 'watttime',
        isForecast: watttimeSignal.isForecast,
        confidence: watttimeSignal.confidence || 0.8,
        provenance: {
          sourceUsed: 'WATTTIME_MOER',
          validationSource: validation.validationSource,
          referenceTime,
          fetchedAt,
          fallbackUsed: false,
          disagreementFlag: validation.disagreement.level !== 'none',
          disagreementPct: validation.disagreement.disagreementPct
        }
      }
    }

    // 2. FALLBACK: Electricity Maps (only if WattTime unavailable)
    const emSignal = await this.getElectricityMapsSignal(region, timestamp)
    
    if (emSignal) {
      const validation = await this.validateSignal(emSignal, region, timestamp)
      
      return {
        carbonIntensity: emSignal.carbonIntensity,
        source: 'electricity_maps',
        isForecast: false,
        confidence: emSignal.confidence || 0.6,
        provenance: {
          sourceUsed: 'ELECTRICITY_MAPS_FALLBACK',
          validationSource: validation.validationSource,
          referenceTime,
          fetchedAt,
          fallbackUsed: true,
          disagreementFlag: validation.disagreement.level !== 'none',
          disagreementPct: validation.disagreement.disagreementPct
        }
      }
    }

    // 3. LAST RESORT: Static fallback
    return {
      carbonIntensity: 400, // gCO2eq/kWh
      source: 'fallback',
      isForecast: false,
      confidence: 0.1,
      provenance: {
        sourceUsed: 'STATIC_FALLBACK',
        referenceTime,
        fetchedAt,
        fallbackUsed: true,
        disagreementFlag: false,
        disagreementPct: 0
      }
    }
  }

  /**
   * Get WattTime MOER signal (primary routing source)
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
          timestamp: intensity.date,
          estimatedFlag: !intensity.estimated,
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
   * Validate signal against other providers for disagreement detection
   */
  private async validateSignal(
    primarySignal: ProviderSignal,
    region: string,
    timestamp: Date
  ): Promise<{
    validationSource?: string
    disagreement: ProviderDisagreement
  }> {
    const signals: ProviderSignal[] = [primarySignal]

    // Get validation signals (NOT for routing, only for disagreement detection)
    const emSignal = await this.getElectricityMapsSignal(region, timestamp)
    if (emSignal) signals.push(emSignal)

    // Calculate disagreement
    const disagreement = this.calculateDisagreement(signals)

    // Determine validation source
    let validationSource: string | undefined
    if (emSignal && disagreement.level !== 'severe') {
      validationSource = 'electricity_maps'
    }

    return { validationSource, disagreement }
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
      // For now, return null as Ember structural profile needs to be implemented
      // This would fetch Ember data and derive structural profile
      return null
    } catch (error) {
      console.warn(`Failed to get Ember structural profile for ${region}:`, error)
    }

    return null
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
