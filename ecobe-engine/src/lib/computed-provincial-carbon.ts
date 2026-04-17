import { env } from '../config/env'
import { recordIntegrationFailure, recordIntegrationSuccess } from './integration-metrics'

export interface ProvincialFuelMixEntry {
  source: string
  sharePct: number
  emissionFactorGPerKwh: number
}

export interface ProvincialCarbonReading {
  provider: 'ON_CARBON' | 'QC_CARBON' | 'BC_CARBON'
  zone: 'ON' | 'QC' | 'BC'
  carbonIntensity: number
  timestamp: string
  isForecast: false
  confidence: number
  authorityStatus: 'healthy' | 'degraded' | 'offline'
  authorityMode: 'computed_provincial'
  metadata: Record<string, unknown>
}

type ProvincialProviderConfig = {
  provider: ProvincialCarbonReading['provider']
  zone: ProvincialCarbonReading['zone']
  label: string
  defaultConfidence: number
  defaultFuelMix: ProvincialFuelMixEntry[]
  mixOverrideJson?: string
  intensityOverride?: number
  confidenceOverride?: number
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits))
}

function normalizeFuelMix(entries: ProvincialFuelMixEntry[]) {
  const totalShare = entries.reduce((sum, entry) => sum + entry.sharePct, 0)
  if (!Number.isFinite(totalShare) || totalShare <= 0) {
    throw new Error('fuel mix share total must be positive')
  }

  return entries.map((entry) => ({
    ...entry,
    sharePct: round((entry.sharePct / totalShare) * 100, 4),
  }))
}

function parseFuelMixOverride(raw: string | undefined, fallback: ProvincialFuelMixEntry[]) {
  if (!raw?.trim()) return normalizeFuelMix(fallback)

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('fuel mix override must be a non-empty array')
    }

    const validated = parsed.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error('fuel mix entries must be objects')
      }

      const candidate = entry as Record<string, unknown>
      const source = typeof candidate.source === 'string' ? candidate.source.trim() : ''
      const sharePct = Number(candidate.sharePct)
      const emissionFactorGPerKwh = Number(candidate.emissionFactorGPerKwh)

      if (!source) {
        throw new Error('fuel mix entries require source')
      }
      if (!Number.isFinite(sharePct) || sharePct < 0) {
        throw new Error(`invalid sharePct for ${source}`)
      }
      if (!Number.isFinite(emissionFactorGPerKwh) || emissionFactorGPerKwh < 0) {
        throw new Error(`invalid emissionFactorGPerKwh for ${source}`)
      }

      return {
        source,
        sharePct,
        emissionFactorGPerKwh,
      } satisfies ProvincialFuelMixEntry
    })

    return normalizeFuelMix(validated)
  } catch (error) {
    throw new Error(
      `invalid provincial fuel mix override: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function computeWeightedIntensity(entries: ProvincialFuelMixEntry[]) {
  const total = entries.reduce(
    (sum, entry) => sum + (entry.sharePct / 100) * entry.emissionFactorGPerKwh,
    0,
  )
  return round(total, 2)
}

export class ComputedProvincialCarbonClient {
  constructor(private readonly config: ProvincialProviderConfig) {}

  private async logSuccess(latencyMs?: number) {
    try {
      await recordIntegrationSuccess(this.config.provider as any, { latencyMs })
    } catch {
      // ignore metrics logging failures
    }
  }

  private async logFailure(message: string, latencyMs?: number) {
    try {
      await recordIntegrationFailure(this.config.provider as any, message, { latencyMs })
    } catch {
      // ignore metrics logging failures
    }
  }

  async getCurrentIntensity(): Promise<ProvincialCarbonReading | null> {
    const startedAt = Date.now()

    try {
      const normalizedFuelMix = parseFuelMixOverride(
        this.config.mixOverrideJson,
        this.config.defaultFuelMix,
      )
      const carbonIntensity =
        this.config.intensityOverride !== undefined &&
        this.config.intensityOverride !== null &&
        Number.isFinite(this.config.intensityOverride)
          ? round(this.config.intensityOverride, 2)
          : computeWeightedIntensity(normalizedFuelMix)
      const confidence = this.config.confidenceOverride ?? this.config.defaultConfidence
      const timestamp = new Date().toISOString()

      await this.logSuccess(Date.now() - startedAt)

      return {
        provider: this.config.provider,
        zone: this.config.zone,
        carbonIntensity,
        timestamp,
        isForecast: false,
        confidence,
        authorityStatus: 'healthy',
        authorityMode: 'computed_provincial',
        metadata: {
          label: this.config.label,
          computed: true,
          methodology: 'province_generation_mix_weighted_average',
          signalType: 'province_computed_intensity',
          fuelMix: normalizedFuelMix,
          structuralAverageGPerKwh: carbonIntensity,
        },
      }
    } catch (error) {
      await this.logFailure(
        error instanceof Error ? error.message : String(error),
        Date.now() - startedAt,
      )
      return null
    }
  }
}

const ONTARIO_DEFAULT_FUEL_MIX: ProvincialFuelMixEntry[] = [
  { source: 'nuclear', sharePct: 51, emissionFactorGPerKwh: 12 },
  { source: 'hydro', sharePct: 24, emissionFactorGPerKwh: 6 },
  { source: 'wind', sharePct: 10, emissionFactorGPerKwh: 14 },
  { source: 'solar', sharePct: 2, emissionFactorGPerKwh: 48 },
  { source: 'gas', sharePct: 12, emissionFactorGPerKwh: 490 },
  { source: 'biofuel', sharePct: 1, emissionFactorGPerKwh: 230 },
]

const QUEBEC_DEFAULT_FUEL_MIX: ProvincialFuelMixEntry[] = [
  { source: 'hydro', sharePct: 94, emissionFactorGPerKwh: 4 },
  { source: 'wind', sharePct: 5, emissionFactorGPerKwh: 14 },
  { source: 'biofuel', sharePct: 1, emissionFactorGPerKwh: 230 },
]

const BC_DEFAULT_FUEL_MIX: ProvincialFuelMixEntry[] = [
  { source: 'hydro', sharePct: 92, emissionFactorGPerKwh: 5 },
  { source: 'wind', sharePct: 3, emissionFactorGPerKwh: 14 },
  { source: 'solar', sharePct: 1, emissionFactorGPerKwh: 48 },
  { source: 'gas', sharePct: 3, emissionFactorGPerKwh: 490 },
  { source: 'biofuel', sharePct: 1, emissionFactorGPerKwh: 230 },
]

export const ontarioCarbonClient = new ComputedProvincialCarbonClient({
  provider: 'ON_CARBON',
  zone: 'ON',
  label: 'Ontario Carbon',
  defaultConfidence: Number(env.ON_CARBON_CONFIDENCE ?? '0.84'),
  defaultFuelMix: ONTARIO_DEFAULT_FUEL_MIX,
  mixOverrideJson: env.ON_CARBON_FUEL_MIX_JSON,
  intensityOverride: env.ON_CARBON_INTENSITY_G_PER_KWH,
  confidenceOverride: env.ON_CARBON_CONFIDENCE,
})

export const quebecCarbonClient = new ComputedProvincialCarbonClient({
  provider: 'QC_CARBON',
  zone: 'QC',
  label: 'Quebec Carbon',
  defaultConfidence: Number(env.QC_CARBON_CONFIDENCE ?? '0.88'),
  defaultFuelMix: QUEBEC_DEFAULT_FUEL_MIX,
  mixOverrideJson: env.QC_CARBON_FUEL_MIX_JSON,
  intensityOverride: env.QC_CARBON_INTENSITY_G_PER_KWH,
  confidenceOverride: env.QC_CARBON_CONFIDENCE,
})

export const bcCarbonClient = new ComputedProvincialCarbonClient({
  provider: 'BC_CARBON',
  zone: 'BC',
  label: 'BC Carbon',
  defaultConfidence: Number(env.BC_CARBON_CONFIDENCE ?? '0.82'),
  defaultFuelMix: BC_DEFAULT_FUEL_MIX,
  mixOverrideJson: env.BC_CARBON_FUEL_MIX_JSON,
  intensityOverride: env.BC_CARBON_INTENSITY_G_PER_KWH,
  confidenceOverride: env.BC_CARBON_CONFIDENCE,
})
