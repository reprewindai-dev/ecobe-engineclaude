import { resolveWattTimeRegion, wattTime } from '../watttime'
import { ember } from '../ember'
import { gbCarbonIntensity } from '../gb-carbon-intensity'
import { denmarkCarbon } from '../denmark-carbon'
import { finlandCarbon } from '../finland-carbon'
import { canadaCarbon } from '../canada-carbon'
import { europeCarbon } from '../europe-carbon'
import { euOpenCarbon, type EuOpenCarbonZone } from '../eu-open-carbon'
import { env } from '../../config/env'
import {
  CachedRoutingSignalRecord,
  GridSignalCache,
} from '../grid-signals/grid-signal-cache'
import { GridSignalAudit } from '../grid-signals/grid-signal-audit'
import { FuelMixParser } from '../grid-signals/fuel-mix-parser'
import { eia930 } from '../grid-signals/eia-client'
import { type EmberData } from '../ember/structural-profile'


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
  source: 'watttime' | 'electricity_maps' | 'ember' | 'gb_carbon_intensity' | 'dk_carbon' | 'fi_carbon' | 'ca_carbon' | 'eu_carbon' | 'eu_open_carbon' | 'eia930_fuel_mix' | 'fallback'
  isForecast: boolean
  confidence: number
  signalMode: 'marginal' | 'average' | 'fallback'
  accountingMethod: 'marginal' | 'flow-traced' | 'average'
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
 * PROVIDER DOCTRINE – FREE-FIRST GLOBAL STACK (REV 2026-03-18)
 *
 * Built on free/low-cost data sources. No Electricity Maps enterprise required.
 *
 * TIER 1 — FREE DIRECT CARBON INTENSITY (real gCO2/kWh)
 *  Per-region routing based on geography:
 *  - US regions:  EIA-930 fuel mix → computed average CI (IPCC factors)
 *  - GB regions:  GB Carbon Intensity API (free, no auth, 96h forecast)
 *  - DK regions:  Energi Data Service (free, CO2 forecast + realtime)
 *  - FI regions:  Fingrid (free, 3-min realtime, API key required)
 *
 * TIER 2 — MARGINAL SIGNAL ENRICHMENT
 *  - WattTime MOER: free for CAISO_NORTH, percentile for other US regions
 *  - Enriches primary signal, never replaces it
 *
 * TIER 3 — OPTIONAL PREMIUM (only if key is set)
 *  - Electricity Maps: flow-traced carbon intensity (if API key available)
 *
 * VALIDATION / BASELINE
 *  - Ember: structural baseline + historical sanity check (global, free)
 *  - Supplies confidence dampening when primary deviates beyond tolerance
 *
 * FALLBACK
 *  - Ember baseline for region, then static 450 gCO2/kWh
 */
export class ProviderRouter {
  private static readonly LAST_KNOWN_GOOD_MAX_AGE_SEC = Math.max(env.GRID_SIGNAL_CACHE_TTL * 4, 3600)
  private static readonly LAST_KNOWN_GOOD_SAFETY_MARGIN_FACTOR = 0.1
  private static readonly LAST_KNOWN_GOOD_SAFETY_MARGIN_MIN = 25

  async getRoutingSignal(region: string, timestamp: Date): Promise<RoutingSignal> {
    const record = await this.getRoutingSignalRecord(region, timestamp)
    return record.signal
  }

  async getRoutingSignalRecord(region: string, timestamp: Date): Promise<CachedRoutingSignalRecord> {
    const startedAt = Date.now()
    const signal = await this.getLiveRoutingSignal(region, timestamp)
    const lastLatencyMs = Date.now() - startedAt
    const record = this.buildCachedRoutingSignalRecord(signal, timestamp, lastLatencyMs)

    if (!record.degraded) {
      await GridSignalCache.cacheLastKnownGoodRoutingSignal(region, record).catch((error) => {
        console.warn(`Failed to cache last-known-good routing signal for ${region}:`, error)
      })
      return record
    }

    const lastKnownGood = await GridSignalCache.getLastKnownGoodRoutingSignal(region)
    const lastKnownGoodSource = lastKnownGood?.signal.provenance.sourceUsed ?? ''
    const lastKnownGoodUsable = Boolean(lastKnownGood && !lastKnownGoodSource.includes('WATTTIME'))
    const ageSec =
      this.computeSignalStalenessSec(lastKnownGood?.signal, timestamp) ??
      (lastKnownGood?.fetchedAt
        ? Math.max(0, Math.round((timestamp.getTime() - new Date(lastKnownGood.fetchedAt).getTime()) / 1000))
        : lastKnownGood?.stalenessSec ?? null)
    if (
      lastKnownGoodUsable &&
      lastKnownGood &&
      (ageSec ?? ProviderRouter.LAST_KNOWN_GOOD_MAX_AGE_SEC + 1) <=
        ProviderRouter.LAST_KNOWN_GOOD_MAX_AGE_SEC
    ) {
      return this.buildConservativeLastKnownGoodRecord(lastKnownGood, timestamp)
    }

    return record
  }

  /**
   * Produce a routing signal using free-first provider stack:
   *
   * 1. WattTime MOER (US) — primary causal routing signal
   * 2. GB Carbon Intensity / DK Energi Data / FI Fingrid (EU) — regional primary
   * 3. EIA-930 fuel mix CI — US backbone when WattTime unavailable
   * 4. Ember structural baseline — global fallback
   * 5. Static fallback — degraded state
   */
  private async getLiveRoutingSignal(region: string, timestamp: Date): Promise<RoutingSignal> {
    const referenceTime = timestamp.toISOString()
    const fetchedAt = new Date().toISOString()

    // ── TIER 1a: WattTime MOER — primary causal US signal (locked doctrine) ──
    // WattTime provides real-time marginal emissions (MOER) for US regions.
    // This is the fast-path routing truth for US. EIA-930 is backbone/fallback.
    const wattTimeSignal = await this.getWattTimeSignal(region, timestamp)
    if (wattTimeSignal) {
      const validation = await this.validateWithEmber(wattTimeSignal, region, timestamp, [wattTimeSignal])

      return {
        carbonIntensity: wattTimeSignal.carbonIntensity,
        source: 'watttime',
        isForecast: wattTimeSignal.isForecast,
        confidence: validation.adjustedConfidence,
        signalMode: 'marginal',
        accountingMethod: 'marginal',
        provenance: {
          sourceUsed: wattTimeSignal.metadata?.signalType === 'forecast_moer' ? 'WATTTIME_MOER_FORECAST' : 'WATTTIME_MOER',
          contributingSources: ['watttime'],
          referenceTime,
          fetchedAt,
          fallbackUsed: false,
          disagreementFlag: validation.disagreement.level !== 'none',
          disagreementPct: validation.disagreement.disagreementPct,
          validationNotes: validation.validationNotes
        }
      }
    }

    // ── TIER 1b: GB regions → GB Carbon Intensity API (free, no auth, 96h forecast) ──
    const gbSignal = await this.getGBCarbonIntensitySignal(region)
    if (gbSignal) {
      const validation = await this.validateWithEmber(gbSignal, region, timestamp, [gbSignal])

      return {
        carbonIntensity: gbSignal.carbonIntensity,
        source: 'gb_carbon_intensity',
        isForecast: gbSignal.isForecast,
        confidence: validation.adjustedConfidence,
        signalMode: 'average',
        accountingMethod: 'average',
        provenance: {
          sourceUsed: 'GB_CARBON_INTENSITY_API',
          contributingSources: ['gb_carbon_intensity'],
          referenceTime,
          fetchedAt,
          fallbackUsed: false,
          disagreementFlag: validation.disagreement.level !== 'none',
          disagreementPct: validation.disagreement.disagreementPct,
          validationNotes: validation.validationNotes
        }
      }
    }

    // ── TIER 1c: Denmark regions → Energi Data Service (free, CO2 forecast + realtime) ──
    const dkSignal = await this.getDenmarkSignal(region)
    if (dkSignal) {
      const validation = await this.validateWithEmber(dkSignal, region, timestamp, [dkSignal])

      return {
        carbonIntensity: dkSignal.carbonIntensity,
        source: 'dk_carbon' as any,
        isForecast: dkSignal.isForecast,
        confidence: validation.adjustedConfidence,
        signalMode: 'average',
        accountingMethod: 'average',
        provenance: {
          sourceUsed: 'DK_ENERGI_DATA_SERVICE',
          contributingSources: ['dk_carbon'],
          referenceTime,
          fetchedAt,
          fallbackUsed: false,
          disagreementFlag: validation.disagreement.level !== 'none',
          disagreementPct: validation.disagreement.disagreementPct,
          validationNotes: validation.validationNotes
        }
      }
    }

    // ── TIER 1d: Finland → Fingrid (free, 3-min realtime, API key) ──
    const fiSignal = await this.getFinlandSignal(region)
    if (fiSignal) {
      const validation = await this.validateWithEmber(fiSignal, region, timestamp, [fiSignal])

      return {
        carbonIntensity: fiSignal.carbonIntensity,
        source: 'fi_carbon' as any,
        isForecast: fiSignal.isForecast,
        confidence: validation.adjustedConfidence,
        signalMode: 'average',
        accountingMethod: 'average',
        provenance: {
          sourceUsed: 'FI_FINGRID',
          contributingSources: ['fi_carbon'],
          referenceTime,
          fetchedAt,
          fallbackUsed: false,
          disagreementFlag: validation.disagreement.level !== 'none',
          disagreementPct: validation.disagreement.disagreementPct,
          validationNotes: validation.validationNotes
        }
      }
    }

    // ── TIER 1e: Canada provincial grids → direct public operator/open-data feeds ──
    const canadaSignal = await this.getCanadaSignal(region)
    if (canadaSignal) {
      const validation = await this.validateWithEmber(canadaSignal, region, timestamp, [canadaSignal])
      const sourceUsed =
        canadaSignal.metadata?.zone === 'CA-ON'
          ? 'ON_IESO_GENERATOR_OUTPUT'
          : 'QC_HYDRO_QUEBEC_OPEN_DATA'

      return {
        carbonIntensity: canadaSignal.carbonIntensity,
        source: 'ca_carbon' as any,
        isForecast: canadaSignal.isForecast,
        confidence: validation.adjustedConfidence,
        signalMode: 'average',
        accountingMethod: 'average',
        provenance: {
          sourceUsed,
          contributingSources: ['ca_carbon'],
          referenceTime: canadaSignal.timestamp,
          fetchedAt,
          fallbackUsed: false,
          disagreementFlag: validation.disagreement.level !== 'none',
          disagreementPct: validation.disagreement.disagreementPct,
          validationNotes: validation.validationNotes
        }
      }
    }

    // ── TIER 2: EIA-930 fuel mix — US backbone / predictive telemetry ──
    // Used when WattTime is unavailable. Provides average intensity from
    // real fuel mix data using IPCC emission factors.
    const europeSignal = await this.getEuropeSignal(region)
    if (europeSignal) {
      const validation = await this.validateWithEmber(europeSignal, region, timestamp, [europeSignal])
      const sourceUsed =
        europeSignal.metadata?.zone === 'EU-FR'
          ? 'FR_RTE_ECO2MIX_ODRE'
          : 'BE_ELIA_OPEN_DATA_FUEL_MIX'

      return {
        carbonIntensity: europeSignal.carbonIntensity,
        source: 'eu_carbon' as any,
        isForecast: europeSignal.isForecast,
        confidence: validation.adjustedConfidence,
        signalMode: 'average',
        accountingMethod: 'average',
        provenance: {
          sourceUsed,
          contributingSources: ['eu_carbon'],
          referenceTime: europeSignal.timestamp,
          fetchedAt,
          fallbackUsed: false,
          disagreementFlag: validation.disagreement.level !== 'none',
          disagreementPct: validation.disagreement.disagreementPct,
          validationNotes: validation.validationNotes
        }
      }
    }

    const euOpenSignal = await this.getEuOpenSignal(region)
    if (euOpenSignal) {
      const validation = await this.validateWithEmber(euOpenSignal, region, timestamp, [euOpenSignal])
      const sourceUsed =
        euOpenSignal.metadata?.zone === 'EU-DE'
          ? 'DE_SMARD_GENERATION_MIX_IPCC'
          : euOpenSignal.metadata?.zone === 'EU-AT'
            ? 'AT_SMARD_GENERATION_MIX_IPCC'
            : euOpenSignal.metadata?.zone === 'EU-ES'
              ? 'ES_REE_DAILY_GENERATION_MIX_IPCC'
              : 'ENTSOE_GENERATION_MIX_IPCC'

      return {
        carbonIntensity: euOpenSignal.carbonIntensity,
        source: 'eu_open_carbon' as any,
        isForecast: euOpenSignal.isForecast,
        confidence: validation.adjustedConfidence,
        signalMode: 'average',
        accountingMethod: 'average',
        provenance: {
          sourceUsed,
          contributingSources: ['eu_open_carbon'],
          referenceTime: euOpenSignal.timestamp,
          fetchedAt,
          fallbackUsed: false,
          disagreementFlag: validation.disagreement.level !== 'none',
          disagreementPct: validation.disagreement.disagreementPct,
          validationNotes: validation.validationNotes
            ? `${euOpenSignal.metadata?.sourceFreshness ?? 'source'} official generation mix; ${validation.validationNotes}`
            : `${euOpenSignal.metadata?.sourceFreshness ?? 'source'} official generation mix`,
        }
      }
    }

    const fuelMixSignal = await this.getEia930FuelMixCI(region)
    if (fuelMixSignal !== null) {
      const primarySignal: ProviderSignal = {
        carbonIntensity: fuelMixSignal.carbonIntensity,
        isForecast: false,
        source: 'eia930_fuel_mix',
        timestamp: fuelMixSignal.period,
        estimatedFlag: false,
        syntheticFlag: false,
        confidence: 0.7,
        metadata: fuelMixSignal.metadata,
      }

      const validation = await this.validateWithEmber(primarySignal, region, timestamp, [primarySignal])

      return {
        carbonIntensity: fuelMixSignal.carbonIntensity,
        source: 'eia930_fuel_mix',
        isForecast: false,
        confidence: validation.adjustedConfidence,
        signalMode: 'average',
        accountingMethod: 'average',
        provenance: {
          sourceUsed: 'EIA930_FUEL_MIX_IPCC',
          contributingSources: ['eia930_fuel_mix'],
          referenceTime,
          fetchedAt,
          fallbackUsed: false,
          disagreementFlag: validation.disagreement.level !== 'none',
          disagreementPct: validation.disagreement.disagreementPct,
          validationNotes: `EIA-930 direct fuel mix: ${fuelMixSignal.carbonIntensity.toFixed(0)} gCO2/kWh (WattTime unavailable)` + (validation.validationNotes ? `; ${validation.validationNotes}` : '')
        }
      }
    }

    // ── TIER 3: Ember baseline (global, free — structural context only) ──
    const emberProfile = await this.getStructuralProfile(region)
    if (emberProfile?.structuralCarbonBaseline) {
      return {
        carbonIntensity: emberProfile.structuralCarbonBaseline,
        source: 'ember',
        isForecast: false,
        confidence: 0.25,
        signalMode: 'average',
        accountingMethod: 'average',
        provenance: {
          sourceUsed: 'EMBER_STRUCTURAL_BASELINE',
          contributingSources: ['ember'],
          referenceTime,
          fetchedAt,
          fallbackUsed: true,
          disagreementFlag: false,
          disagreementPct: 0,
          validationNotes: `Ember structural baseline: ${emberProfile.structuralCarbonBaseline.toFixed(0)} gCO2/kWh (no realtime data available)`
        }
      }
    }

    // ── TIER 4: Static fallback (last resort — degraded state) ────────
    return {
      carbonIntensity: 450,
      source: 'fallback',
      isForecast: false,
      confidence: 0.05,
      signalMode: 'fallback',
      accountingMethod: 'average',
      provenance: {
        sourceUsed: 'STATIC_FALLBACK',
        contributingSources: [],
        referenceTime,
        fetchedAt,
        fallbackUsed: true,
        disagreementFlag: false,
        disagreementPct: 0,
        validationNotes: 'All providers unavailable for this region'
      }
    }
  }

  /**
   * Get WattTime MOER signal (marginal amplifier)
   */
  // WattTime v3 uses sub-regional names, not top-level BA codes
  private static WATTTIME_REGION_MAP: Record<string, string> = {
    'us-east-1': 'PJM_DC',         // N. Virginia → PJM sub-region
    'us-east-2': 'PJM_ROANOKE',    // Ohio → PJM sub-region
    'us-west-1': 'CAISO_NORTH',    // N. California → CAISO
    'us-west-2': 'BPA',            // Oregon → Bonneville Power
    'us-central1': 'MISO_MI',      // Iowa → MISO sub-region
    'us-east4': 'PJM_DC',          // GCP N. Virginia
    'us-west1': 'BPA',             // GCP Oregon
    'eastus': 'PJM_DC',            // Azure Virginia
    'eastus2': 'PJM_DC',           // Azure Virginia
    'westus2': 'BPA',              // Azure Washington
    'centralus': 'SPP_NORTH',      // Azure Iowa → SPP
    'southcentralus': 'ERCOT_SOUTH', // Azure Texas
  }

  private async getWattTimeSignal(region: string, timestamp: Date): Promise<ProviderSignal | null> {
    try {
      // Map cloud region to WattTime v3 sub-regional name
      // ONLY try US regions — WattTime free plan covers US only (CAISO_NORTH full access)
      const wattTimeRegion = resolveWattTimeRegion(region)
      if (!wattTimeRegion) return null

      // Touch the current index for provider health only. WattTime v3 signal-index
      // is a percentile, not gCO2/kWh, so it cannot become a route carbon sample.
      const currentMoer = await wattTime.getCurrentMOER(wattTimeRegion)
      if (currentMoer) {
        console.debug(`WattTime signal-index for ${region}/${wattTimeRegion}: ${currentMoer.moerPercent}`)
      }

      if (timestamp.getTime() <= Date.now() + 5 * 60 * 1000) {
        return null
      }

      // Use MOER forecast values after conversion to gCO2/kWh.
      const forecastMoer = await wattTime.getMOERForecast(wattTimeRegion, timestamp)
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

  // Cloud regions that map to Great Britain grid
  private static GB_REGIONS = new Set([
    'EU-GB',
    'eu-west-2',       // AWS London
    'europe-west2',    // GCP London
    'uksouth',         // Azure UK South
    'uknorth',         // Azure UK North
  ])

  /**
   * Get GB Carbon Intensity signal (free, no auth, real gCO2/kWh + 96h forecast)
   * Covers: eu-west-2 (London) and other GB-mapped cloud regions
   */
  private async getGBCarbonIntensitySignal(region: string): Promise<ProviderSignal | null> {
    if (!ProviderRouter.GB_REGIONS.has(region)) return null

    try {
      const current = await gbCarbonIntensity.getCurrentIntensity()
      if (current && current.intensity.forecast) {
        return {
          carbonIntensity: current.intensity.actual ?? current.intensity.forecast,
          isForecast: current.intensity.actual === null,
          source: 'gb_carbon_intensity' as any,
          timestamp: current.from,
          estimatedFlag: current.intensity.actual === null,
          syntheticFlag: false,
          confidence: current.intensity.actual !== null ? 0.85 : 0.75,
          metadata: {
            signalType: 'gb_national_intensity',
            index: current.intensity.index,
            forecastAvailable: true,
          }
        }
      }
    } catch (error) {
      console.warn(`GB Carbon Intensity signal failed for ${region}:`, error)
    }

    return null
  }

  // Cloud regions that map to Denmark grid (DK1 West / DK2 East)
  private static DK_REGIONS: Record<string, 'DK1' | 'DK2'> = {
    'EU-DK1': 'DK1',
    'EU-DK2': 'DK2',
    'eu-north-1': 'DK1',      // AWS Stockholm (closest to DK)
    'europe-north1': 'DK1',   // GCP Finland (Nordic)
  }

  /**
   * Get Denmark carbon intensity (free, Energi Data Service)
   */
  private async getDenmarkSignal(region: string): Promise<ProviderSignal | null> {
    const dkZone = ProviderRouter.DK_REGIONS[region]
    if (!dkZone) return null

    try {
      const data = await denmarkCarbon.getCurrentIntensity(dkZone)
      if (data.length > 0) {
        const latest = data[0]
        return {
          carbonIntensity: latest.carbonIntensity,
          isForecast: false,
          source: 'dk_carbon',
          timestamp: latest.timestamp,
          estimatedFlag: false,
          syntheticFlag: false,
          confidence: 0.8,
          metadata: { signalType: 'dk_realtime', zone: latest.zone }
        }
      }
    } catch (error) {
      console.warn(`Denmark carbon signal failed for ${region}:`, error)
    }
    return null
  }

  // Cloud regions that map to Finland grid
  private static FI_REGIONS = new Set([
    'EU-FI',
    'eu-north-1',       // AWS Stockholm (Nordic, covers FI)
    'europe-north1',    // GCP Finland
  ])

  /**
   * Get Finland carbon intensity (free, Fingrid — 3-min updates)
   */
  private async getFinlandSignal(region: string): Promise<ProviderSignal | null> {
    if (!ProviderRouter.FI_REGIONS.has(region)) return null
    if (!finlandCarbon.isAvailable) return null

    try {
      const data = await finlandCarbon.getCurrentIntensity()
      if (data) {
        return {
          carbonIntensity: data.carbonIntensity,
          isForecast: false,
          source: 'fi_carbon',
          timestamp: data.timestamp,
          estimatedFlag: false,
          syntheticFlag: false,
          confidence: 0.85, // Real measured, consumption-based (includes imports)
          metadata: { signalType: 'fi_consumed_intensity', method: data.method }
        }
      }
    } catch (error) {
      console.warn(`Finland carbon signal failed for ${region}:`, error)
    }
    return null
  }

  private static CANADA_REGIONS = new Set([
    'CA-ON',
    'canadacentral',
    'CA-QC',
    'ca-central-1',
    'ca-west-1',
    'northamerica-northeast1',
    'canadaeast',
  ])

  private async getCanadaSignal(region: string): Promise<ProviderSignal | null> {
    if (!ProviderRouter.CANADA_REGIONS.has(region)) return null

    try {
      const data =
        region === 'CA-ON' || region === 'canadacentral'
          ? await canadaCarbon.getOntarioIntensity()
          : await canadaCarbon.getQuebecIntensity()

      if (!data) return null

      return {
        carbonIntensity: data.carbonIntensity,
        isForecast: data.isForecast,
        source: 'ca_carbon' as any,
        timestamp: data.timestamp,
        estimatedFlag: true,
        syntheticFlag: false,
        confidence: 0.76,
        metadata: {
          signalType: data.method,
          zone: data.zone,
          fuelBreakdownMw: data.fuelBreakdownMw,
          sourceUrl: data.sourceUrl,
          factorMethod: 'IPCC-weighted public generation mix',
        }
      }
    } catch (error) {
      console.warn(`Canada carbon signal failed for ${region}:`, error)
      return null
    }
  }

  private static EUROPE_REGIONS = new Set([
    'EU-FR',
    'eu-west-3',
    'europe-west9',
    'francecentral',
    'EU-BE',
    'europe-west1',
  ])

  private async getEuropeSignal(region: string): Promise<ProviderSignal | null> {
    if (!ProviderRouter.EUROPE_REGIONS.has(region)) return null

    try {
      const data =
        region === 'EU-FR' || region === 'eu-west-3' || region === 'europe-west9' || region === 'francecentral'
          ? await europeCarbon.getFranceIntensity()
          : await europeCarbon.getBelgiumIntensity()

      if (!data) return null

      return {
        carbonIntensity: data.carbonIntensity,
        isForecast: data.isForecast,
        source: 'eu_carbon' as any,
        timestamp: data.timestamp,
        estimatedFlag: data.method !== 'rte-eco2mix-direct',
        syntheticFlag: false,
        confidence: data.method === 'rte-eco2mix-direct' ? 0.86 : 0.72,
        metadata: {
          signalType: data.method,
          zone: data.zone,
          fuelBreakdownMw: data.fuelBreakdownMw,
          sourceUrl: data.sourceUrl,
          factorMethod:
            data.method === 'rte-eco2mix-direct'
              ? 'RTE published direct national carbon intensity'
              : 'IPCC-weighted public generation mix',
        }
      }
    } catch (error) {
      console.warn(`Europe carbon signal failed for ${region}:`, error)
      return null
    }
  }

  private static EU_OPEN_REGIONS = new Set([
    'EU-DE',
    'eu-central-1',
    'EU-AT',
    'EU-ES',
    'EU-SE',
    'EU-NO',
    'EU-NL',
    'EU-PT',
    'EU-IT',
    'EU-PL',
    'EU-CH',
  ])

  private static EU_OPEN_REGION_MAP: Record<string, EuOpenCarbonZone> = {
    'EU-DE': 'EU-DE',
    'eu-central-1': 'EU-DE',
    'EU-AT': 'EU-AT',
    'EU-ES': 'EU-ES',
    'EU-SE': 'EU-SE',
    'EU-NO': 'EU-NO',
    'EU-NL': 'EU-NL',
    'EU-PT': 'EU-PT',
    'EU-IT': 'EU-IT',
    'EU-PL': 'EU-PL',
    'EU-CH': 'EU-CH',
  }

  private async getEuOpenSignal(region: string): Promise<ProviderSignal | null> {
    if (!ProviderRouter.EU_OPEN_REGIONS.has(region)) return null
    const zone = ProviderRouter.EU_OPEN_REGION_MAP[region]
    if (!zone) return null

    try {
      const data =
        zone === 'EU-DE'
          ? await euOpenCarbon.getGermanyIntensity()
          : zone === 'EU-AT'
            ? await euOpenCarbon.getAustriaIntensity()
            : zone === 'EU-ES'
              ? await euOpenCarbon.getSpainIntensity()
              : await euOpenCarbon.getEntsoeIntensity(zone)

      if (!data) return null

      return {
        carbonIntensity: data.carbonIntensity,
        isForecast: data.isForecast,
        source: 'eu_open_carbon' as any,
        timestamp: data.timestamp,
        estimatedFlag: data.method !== 'smard-fuel-mix-ipcc' && data.method !== 'entsoe-generation-mix-ipcc',
        syntheticFlag: false,
        confidence: data.sourceFreshness === 'hourly' ? 0.76 : 0.66,
        metadata: {
          signalType: data.method,
          zone: data.zone,
          fuelBreakdownMw: data.fuelBreakdownMw,
          sourceUrl: data.sourceUrl,
          sourceFreshness: data.sourceFreshness,
          factorMethod: 'IPCC-weighted official generation mix',
        }
      }
    } catch (error) {
      console.warn(`EU open-data carbon signal failed for ${region}:`, error)
      return null
    }
  }

  // Cloud and canonical regions with direct EIA-930 fuel mix coverage (US only)
  private static EIA930_BA_MAP: Record<string, string> = {
    'US-CAL-CISO': 'CISO',
    'US-TEX-ERCO': 'ERCO',
    'US-MIDA-PJM': 'PJM',
    'US-MIDW-MISO': 'MISO',
    'US-NW-BPAT': 'BPAT',
    'US-NE-ISNE': 'ISNE',
    'us-east-1': 'PJM', 'us-east-2': 'PJM',
    'us-west-1': 'CISO', 'us-west-2': 'BPAT',
    'us-central1': 'MISO',
    'us-east4': 'PJM', 'us-west1': 'BPAT',
    'eastus': 'PJM', 'eastus2': 'PJM',
    'westus2': 'BPAT', 'centralus': 'MISO',
    'southcentralus': 'ERCO',
  }

  // Cache fuel-mix CI for 15 minutes (matches ingestion cadence)
  private fuelMixCICache = new Map<string, { result: { carbonIntensity: number; period: string; metadata: Record<string, unknown> }; expiry: number }>()

  /**
   * Get carbon intensity derived from real EIA-930 fuel type data.
   * Returns gCO2/kWh computed from actual hourly generation by fuel type
   */
  private async getEia930FuelMixCI(region: string): Promise<{ carbonIntensity: number; period: string; metadata: Record<string, unknown> } | null> {
    const ba = ProviderRouter.EIA930_BA_MAP[region]
    if (!ba) return null

    // Check cache
    const cached = this.fuelMixCICache.get(ba)
    if (cached && cached.expiry > Date.now()) return cached.result

    try {
      const now = new Date()
      const start = new Date(now.getTime() - 6 * 60 * 60 * 1000) // Last 6 hours
      const fuelMix = await eia930.getFuelTypeData(ba, start, now)

      if (fuelMix.length === 0) return null

      // Use most recent data point — FuelMixParser computes weighted avg from IPCC factors
      const computed = FuelMixParser.estimateCarbonIntensityFromEiaFuelTypeData(fuelMix)
      if (!computed || !Number.isFinite(computed.carbonIntensity)) return null

      const result = {
        carbonIntensity: computed.carbonIntensity,
        period: computed.period,
        metadata: {
          respondent: computed.respondent,
          balancingAuthority: ba,
          fuelBreakdownMwh: computed.fuelBreakdownMwh,
          sourceDataset: 'EIA electricity/rto/fuel-type-data',
          method: 'IPCC weighted fuel mix',
        },
      }

      // Cache for 15 minutes
      this.fuelMixCICache.set(ba, { result, expiry: Date.now() + 15 * 60 * 1000 })
      return result
    } catch (error) {
      console.warn(`EIA-930 fuel-mix CI failed for ${region}/${ba}:`, error)
      return null
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
      // Determine if the signal is in gCO2/kWh or is a WattTime percentile (0-100)
      // WattTime v3 signal-index returns percentile, NOT gCO2/kWh — skip direct comparison
      const isWattTimePercentile = disagreementSignals.length === 1 && disagreementSignals[0]?.source === 'watttime'
      // GB Carbon Intensity is authoritative real-time — its deviation from yearly baseline is expected
      const isAuthoritativeRealtime = disagreementSignals.some(s =>
        s.source === 'gb_carbon_intensity' || s.source === 'electricity_maps' ||
        s.source === 'dk_carbon' || s.source === 'fi_carbon' ||
        s.source === 'ca_carbon' || s.source === 'eu_carbon' ||
        s.source === 'eu_open_carbon' || s.source === 'eia930_fuel_mix'
      )

      if (isWattTimePercentile) {
        // WattTime percentile (0-100) cannot be compared to gCO2/kWh baseline
        validationNotes = `Ember baseline: ${emberProfile.structuralCarbonBaseline.toFixed(0)} gCO2/kWh (structural reference)`
      } else if (isAuthoritativeRealtime) {
        // Real-time measured intensity — note the baseline for context but don't penalize
        validationNotes = `Ember baseline: ${emberProfile.structuralCarbonBaseline.toFixed(0)} gCO2/kWh; real-time measured: ${signal.carbonIntensity} gCO2/kWh`
      } else {
        // Derived/computed sources — apply deviation penalty
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

  // Cache structural profiles for 1 hour (Ember data is monthly/yearly, no need to refetch per-request)
  private structuralProfileCache = new Map<string, { profile: any | null; expiry: number }>()
  private static STRUCTURAL_CACHE_TTL = 3600_000 // 1 hour

  // Map cloud regions to Ember entity codes (country-level)
  private static REGION_TO_EMBER_ENTITY: Record<string, string> = {
    'US-CAL-CISO': 'USA', 'US-TEX-ERCO': 'USA', 'US-MIDA-PJM': 'USA',
    'US-MIDW-MISO': 'USA', 'US-NW-BPAT': 'USA', 'US-NE-ISNE': 'USA',
    'us-east-1': 'USA', 'us-east-2': 'USA', 'us-west-1': 'USA', 'us-west-2': 'USA',
    'us-central1': 'USA', 'us-east4': 'USA', 'us-west1': 'USA',
    'eastus': 'USA', 'eastus2': 'USA', 'westus2': 'USA', 'centralus': 'USA', 'southcentralus': 'USA',
    'CA-QC': 'CAN', 'CA-ON': 'CAN', 'CA-BC': 'CAN',
    'EU-GB': 'GBR', 'EU-FR': 'FRA', 'EU-DE': 'DEU', 'EU-SE': 'SWE',
    'EU-NO': 'NOR', 'EU-FI': 'FIN', 'EU-DK1': 'DNK', 'EU-DK2': 'DNK',
    'EU-NL': 'NLD', 'EU-BE': 'BEL', 'EU-ES': 'ESP', 'EU-PT': 'PRT',
    'EU-IT': 'ITA', 'EU-PL': 'POL', 'EU-CH': 'CHE', 'EU-AT': 'AUT',
    'eu-west-1': 'IRL', 'eu-west-2': 'GBR', 'eu-central-1': 'DEU',
    'europe-west1': 'BEL',
    'AP-SG': 'SGP', 'AP-JP-TOKYO': 'JPN', 'AP-JP-OSAKA': 'JPN',
    'AP-AU-NSW': 'AUS', 'AP-AU-VIC': 'AUS', 'AP-AU-QLD': 'AUS',
    'AP-AU-SA': 'AUS', 'AP-IN-SOUTH': 'IND', 'AP-IN-WEST': 'IND',
    'AP-KR': 'KOR', 'AP-TW': 'TWN',
    'ap-southeast-1': 'SGP', 'ap-northeast-1': 'JPN', 'ap-south-1': 'IND',
    'SA-BR-SE': 'BRA', 'SA-BR-S': 'BRA', 'SA-CL-SEN': 'CHL', 'SA-CO': 'COL',
    'AF-ZA': 'ZAF', 'ME-AE': 'ARE',
  }

  /**
   * Get structural profile from Ember (validation/context only)
   * Uses EmberClient.deriveStructuralProfile which directly queries 5 Ember endpoints
   * with correct field mappings. Cached for 1 hour (Ember data is monthly/yearly).
   */
  async getStructuralProfile(region: string): Promise<any | null> {
    const entityCode = ProviderRouter.REGION_TO_EMBER_ENTITY[region] ?? region.toUpperCase()
    const cacheKey = `ember_structural_${entityCode}`

    // Check cache
    const cached = this.structuralProfileCache.get(cacheKey)
    if (cached && cached.expiry > Date.now()) {
      return cached.profile
    }

    try {
      // Use the EmberClient's deriveStructuralProfile which has correct API field mappings
      const profile = await ember.deriveStructuralProfile(region, entityCode)

      if (!profile || !profile.structuralCarbonBaseline) {
        this.structuralProfileCache.set(cacheKey, { profile: null, expiry: Date.now() + ProviderRouter.STRUCTURAL_CACHE_TTL })
        return null
      }

      this.structuralProfileCache.set(cacheKey, { profile, expiry: Date.now() + ProviderRouter.STRUCTURAL_CACHE_TTL })
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
        value: Number.isFinite(point.emissions_intensity_gco2_per_kwh) ? point.emissions_intensity_gco2_per_kwh : null
      })),
      demand: demandYearly.map((point) => ({
        year: point.date,
        value: Number.isFinite(point.demand_twh) ? point.demand_twh : null
      })),
      capacity: capacityMonthly.map((point) => ({
        year: point.date,
        fuelTech: point.series ?? 'unknown',
        value: Number.isFinite(point.capacity_gw) ? point.capacity_gw : null
      }))
    }

    return emberData
  }

  private computeSignalStalenessSec(
    signal: Pick<RoutingSignal, 'provenance'> | undefined,
    timestamp: Date
  ): number | null {
    if (!signal?.provenance?.referenceTime) return null
    const referenceTime = new Date(signal.provenance.referenceTime).getTime()
    if (!Number.isFinite(referenceTime)) return null
    return Math.max(0, Math.round((timestamp.getTime() - referenceTime) / 1000))
  }

  private buildCachedRoutingSignalRecord(
    signal: RoutingSignal,
    timestamp: Date,
    lastLatencyMs: number | null
  ): CachedRoutingSignalRecord {
    const stalenessSec = this.computeSignalStalenessSec(signal, timestamp)
    const degraded =
      signal.provenance.fallbackUsed || signal.confidence < 0.6 || signal.signalMode === 'fallback'

    return {
      signal,
      fetchedAt: new Date().toISOString(),
      stalenessSec,
      lastLatencyMs,
      degraded,
    }
  }

  private buildConservativeLastKnownGoodRecord(
    record: CachedRoutingSignalRecord,
    timestamp: Date
  ): CachedRoutingSignalRecord {
    const safetyMargin = Math.max(
      ProviderRouter.LAST_KNOWN_GOOD_SAFETY_MARGIN_MIN,
      Math.round(record.signal.carbonIntensity * ProviderRouter.LAST_KNOWN_GOOD_SAFETY_MARGIN_FACTOR)
    )
    const adjustedSignal: RoutingSignal = {
      ...record.signal,
      carbonIntensity: Number((record.signal.carbonIntensity + safetyMargin).toFixed(3)),
      confidence: Math.max(0.05, Number((record.signal.confidence - 0.2).toFixed(3))),
      signalMode: 'fallback',
      accountingMethod: 'average',
      provenance: {
        ...record.signal.provenance,
        sourceUsed: `LKG_${record.signal.provenance.sourceUsed}`,
        fetchedAt: new Date().toISOString(),
        fallbackUsed: true,
        validationNotes: [
          record.signal.provenance.validationNotes,
          `Using last-known-good signal with +${safetyMargin} gCO2/kWh safety margin`,
        ]
          .filter(Boolean)
          .join('; '),
      },
    }

    return {
      signal: adjustedSignal,
      fetchedAt: new Date().toISOString(),
      stalenessSec: this.computeSignalStalenessSec(record.signal, timestamp),
      lastLatencyMs: record.lastLatencyMs,
      degraded: true,
    }
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
  async cacheRoutingSignal(
    region: string,
    signal: RoutingSignal | CachedRoutingSignalRecord,
    timestamp: Date
  ): Promise<void> {
    const record =
      'signal' in signal ? signal : this.buildCachedRoutingSignalRecord(signal, timestamp, null)

    await GridSignalCache.cacheRoutingSignal(region, timestamp.toISOString(), record)
    await GridSignalCache.cacheProviderDisagreement(
      region,
      timestamp.toISOString(),
      {
        level: record.signal.provenance.disagreementFlag ? 'medium' : 'none',
        disagreementPct: record.signal.provenance.disagreementPct,
        providers: [record.signal.source],
        values: [record.signal.carbonIntensity]
      }
    )
  }

  /**
   * Get cached routing signal
   */
  async getCachedRoutingSignalRecord(region: string, timestamp: Date): Promise<CachedRoutingSignalRecord | null> {
    const cachedRecord = await GridSignalCache.getCachedRoutingSignal(region, timestamp.toISOString())
    if (cachedRecord) {
      return {
        ...cachedRecord,
        stalenessSec:
          cachedRecord.stalenessSec ?? this.computeSignalStalenessSec(cachedRecord.signal, timestamp),
      }
    }

    const cachedDisagreement = await GridSignalCache.getCachedProviderDisagreement(
      region,
      timestamp.toISOString()
    )

    if (cachedDisagreement && cachedDisagreement.level !== 'severe') {
      const reconstructed: CachedRoutingSignalRecord = {
        signal: {
          carbonIntensity: cachedDisagreement.values[0] || 400,
          source: cachedDisagreement.providers[0] as any,
          isForecast: false,
          confidence: 0.35,
          signalMode: 'fallback',
          accountingMethod: 'average',
          provenance: {
            sourceUsed: `CACHED_${cachedDisagreement.providers[0]}`,
            contributingSources: cachedDisagreement.providers,
            referenceTime: timestamp.toISOString(),
            fetchedAt: new Date().toISOString(),
            fallbackUsed: true,
            disagreementFlag: cachedDisagreement.level !== 'none',
            disagreementPct: cachedDisagreement.disagreementPct,
            validationNotes: 'Reconstructed from cached provider disagreement only',
          },
        },
        fetchedAt: new Date().toISOString(),
        stalenessSec: 0,
        lastLatencyMs: null,
        degraded: true,
      }
      await GridSignalCache.cacheRoutingSignal(region, timestamp.toISOString(), reconstructed).catch(() => undefined)
      return reconstructed
    }

    return null
  }

  async getCachedRoutingSignal(region: string, timestamp: Date): Promise<RoutingSignal | null> {
    const cached = await this.getCachedRoutingSignalRecord(region, timestamp)
    return cached?.signal ?? null
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
        demandRampPct: typeof (signal as any).metadata?.demandRampPct === 'number' ? (signal as any).metadata.demandRampPct : null,
        carbonSpikeProbability:
          typeof (signal as any).metadata?.carbonSpikeProbability === 'number'
            ? (signal as any).metadata.carbonSpikeProbability
            : null,
        curtailmentProbability:
          typeof (signal as any).metadata?.curtailmentProbability === 'number'
            ? (signal as any).metadata.curtailmentProbability
            : null,
        importCarbonLeakageScore:
          typeof (signal as any).metadata?.importCarbonLeakageScore === 'number'
            ? (signal as any).metadata.importCarbonLeakageScore
            : null,
        signalQuality: signal.confidence > 0.7 ? 'high' : signal.confidence > 0.4 ? 'medium' : 'low',
        estimatedFlag: signal.provenance.sourceUsed.includes('ESTIMATED'),
        syntheticFlag: signal.provenance.sourceUsed.includes('SYNTHETIC')
      },
      signal.provenance
    )
  }
}

export const providerRouter = new ProviderRouter()
