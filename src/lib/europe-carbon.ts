import axios from 'axios'
import { recordIntegrationFailure, recordIntegrationSuccess } from './integration-metrics'

type FuelBreakdown = Record<string, number>

export type EuropeCarbonZone = 'EU-FR' | 'EU-BE'

export interface EuropeCarbonData {
  zone: EuropeCarbonZone
  carbonIntensity: number
  timestamp: string
  isForecast: false
  method: 'rte-eco2mix-direct' | 'elia-open-data-fuel-mix-ipcc'
  fuelBreakdownMw: FuelBreakdown
  sourceUrl: string
}

const FRANCE_ECO2MIX_URL =
  'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/eco2mix-national-tr/records'

const BELGIUM_ELIA_GENERATION_URL =
  'https://opendata.elia.be/api/explore/v2.1/catalog/datasets/ods201/records'

const FRANCE_MAX_STALENESS_MS = 6 * 60 * 60 * 1000
const BELGIUM_MAX_STALENESS_MS = 6 * 60 * 60 * 1000

const FUEL_FACTORS_G_PER_KWH: Record<string, number> = {
  nuclear: 12,
  hydro: 24,
  wind: 11,
  solar: 45,
  gas: 490,
  biomass: 230,
  storage: 90,
  waste: 400,
  oil: 840,
  coal: 820,
  other: 400,
}

function numeric(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function weightedIntensity(fuelBreakdownMw: FuelBreakdown): number | null {
  let totalMw = 0
  let weighted = 0

  for (const [fuel, mw] of Object.entries(fuelBreakdownMw)) {
    if (!Number.isFinite(mw) || mw <= 0) continue
    const factor = FUEL_FACTORS_G_PER_KWH[fuel] ?? FUEL_FACTORS_G_PER_KWH.other
    totalMw += mw
    weighted += mw * factor
  }

  if (totalMw <= 0) return null
  return Math.round(weighted / totalMw)
}

function normalizeEliaFuel(value: unknown): string {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized.includes('nuclear')) return 'nuclear'
  if (normalized.includes('hydro') || normalized.includes('water')) return 'hydro'
  if (normalized.includes('wind')) return 'wind'
  if (normalized.includes('solar')) return 'solar'
  if (normalized.includes('gas')) return 'gas'
  if (normalized.includes('biomass') || normalized.includes('biofuel')) return 'biomass'
  if (normalized.includes('storage')) return 'storage'
  if (normalized.includes('waste')) return 'waste'
  if (normalized.includes('oil') || normalized.includes('fossil fuel')) return 'oil'
  if (normalized.includes('coal')) return 'coal'
  return 'other'
}

function isFreshEnough(timestamp: string, maxAgeMs: number): boolean {
  const parsed = new Date(timestamp).getTime()
  if (!Number.isFinite(parsed)) return false
  return Date.now() - parsed <= maxAgeMs
}

export class EuropeCarbonClient {
  private async logSuccess(source: 'FR_RTE_ECO2MIX' | 'BE_ELIA_OPEN_DATA') {
    try { await recordIntegrationSuccess(source as any) } catch { /* ignore */ }
  }

  private async logFailure(source: 'FR_RTE_ECO2MIX' | 'BE_ELIA_OPEN_DATA', message: string) {
    try { await recordIntegrationFailure(source as any, message) } catch { /* ignore */ }
  }

  async getFranceIntensity(): Promise<EuropeCarbonData | null> {
    try {
      const response = await axios.get<{ results?: Array<Record<string, unknown>> }>(
        FRANCE_ECO2MIX_URL,
        {
          params: {
            where: 'taux_co2 is not null',
            order_by: 'date_heure desc',
            limit: 1,
            select:
              'date_heure,taux_co2,consommation,nucleaire,eolien,solaire,hydraulique,gaz,charbon,fioul,bioenergies',
          },
          timeout: 12000,
        }
      )

      const latest = response.data.results?.[0]
      const timestamp = String(latest?.date_heure ?? '')
      const carbonIntensity = numeric(latest?.taux_co2)
      if (!latest || !timestamp || carbonIntensity <= 0) {
        await this.logFailure('FR_RTE_ECO2MIX', 'RTE eCO2mix returned no usable current carbon intensity')
        return null
      }
      if (!isFreshEnough(timestamp, FRANCE_MAX_STALENESS_MS)) {
        await this.logFailure('FR_RTE_ECO2MIX', `RTE eCO2mix latest row is stale: ${timestamp}`)
        return null
      }

      await this.logSuccess('FR_RTE_ECO2MIX')
      return {
        zone: 'EU-FR',
        carbonIntensity: Math.round(carbonIntensity),
        timestamp,
        isForecast: false,
        method: 'rte-eco2mix-direct',
        fuelBreakdownMw: {
          nuclear: numeric(latest.nucleaire),
          wind: numeric(latest.eolien),
          solar: numeric(latest.solaire),
          hydro: numeric(latest.hydraulique),
          gas: numeric(latest.gaz),
          coal: numeric(latest.charbon),
          oil: numeric(latest.fioul),
          biomass: numeric(latest.bioenergies),
        },
        sourceUrl: FRANCE_ECO2MIX_URL,
      }
    } catch (error: any) {
      await this.logFailure('FR_RTE_ECO2MIX', error?.message ?? 'France RTE eCO2mix fetch failed')
      console.warn('France RTE eCO2mix carbon signal failed:', error?.message ?? error)
      return null
    }
  }

  async getBelgiumIntensity(): Promise<EuropeCarbonData | null> {
    try {
      const response = await axios.get<{ results?: Array<Record<string, unknown>> }>(
        BELGIUM_ELIA_GENERATION_URL,
        {
          params: {
            where: 'generatedpower is not null',
            order_by: 'datetime desc',
            limit: 40,
          },
          timeout: 12000,
        }
      )

      const rows = response.data.results ?? []
      const latestTimestamp = String(rows[0]?.datetime ?? '')
      if (!latestTimestamp) {
        await this.logFailure('BE_ELIA_OPEN_DATA', 'Elia open data returned no current generation rows')
        return null
      }

      if (!isFreshEnough(latestTimestamp, BELGIUM_MAX_STALENESS_MS)) {
        await this.logFailure(
          'BE_ELIA_OPEN_DATA',
          `Elia open data latest row is stale: ${latestTimestamp}`
        )
        return null
      }

      const latestRows = rows.filter((row) => String(row.datetime ?? '') === latestTimestamp)
      const fuelBreakdownMw: FuelBreakdown = {}
      for (const row of latestRows) {
        const fuel = normalizeEliaFuel(row.fueltypepublication ?? row.fueltypeentsoe)
        const mw = numeric(row.generatedpower)
        if (mw <= 0) continue
        fuelBreakdownMw[fuel] = (fuelBreakdownMw[fuel] ?? 0) + mw
      }

      const carbonIntensity = weightedIntensity(fuelBreakdownMw)
      if (carbonIntensity == null) {
        await this.logFailure('BE_ELIA_OPEN_DATA', 'Elia fuel mix did not contain usable generation power')
        return null
      }

      await this.logSuccess('BE_ELIA_OPEN_DATA')
      return {
        zone: 'EU-BE',
        carbonIntensity,
        timestamp: latestTimestamp,
        isForecast: false,
        method: 'elia-open-data-fuel-mix-ipcc',
        fuelBreakdownMw,
        sourceUrl: BELGIUM_ELIA_GENERATION_URL,
      }
    } catch (error: any) {
      await this.logFailure('BE_ELIA_OPEN_DATA', error?.message ?? 'Belgium Elia carbon fetch failed')
      console.warn('Belgium Elia carbon signal failed:', error?.message ?? error)
      return null
    }
  }
}

export const europeCarbon = new EuropeCarbonClient()
