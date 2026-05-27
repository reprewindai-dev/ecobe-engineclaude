import axios from 'axios'
import { env } from '../config/env'
import { recordIntegrationFailure, recordIntegrationSuccess } from './integration-metrics'

type FuelBreakdown = Record<string, number>

export type EuOpenCarbonZone =
  | 'EU-DE'
  | 'EU-AT'
  | 'EU-ES'
  | 'EU-SE'
  | 'EU-NO'
  | 'EU-NL'
  | 'EU-PT'
  | 'EU-IT'
  | 'EU-PL'
  | 'EU-CH'

export interface EuOpenCarbonData {
  zone: EuOpenCarbonZone
  carbonIntensity: number
  timestamp: string
  isForecast: false
  method: 'smard-fuel-mix-ipcc' | 'ree-daily-generation-mix-ipcc' | 'entsoe-generation-mix-ipcc'
  fuelBreakdownMw: FuelBreakdown
  sourceUrl: string
  sourceFreshness: 'hourly' | 'daily'
}

const SMARD_BASE_URL = 'https://www.smard.de/app/chart_data'
const REE_GENERATION_STRUCTURE_URL =
  'https://apidatos.ree.es/es/datos/generacion/estructura-generacion'
const ENTSOE_BASE_URL = 'https://web-api.tp.entsoe.eu/api'

const SMARD_MAX_STALENESS_MS = 6 * 60 * 60 * 1000
const REE_DAILY_MAX_STALENESS_MS = 36 * 60 * 60 * 1000
const ENTSOE_MAX_STALENESS_MS = 8 * 60 * 60 * 1000

const FUEL_FACTORS_G_PER_KWH: Record<string, number> = {
  biomass: 230,
  lignite: 1054,
  coal: 820,
  gas: 490,
  oil: 840,
  oilShale: 900,
  peat: 900,
  nuclear: 12,
  hydro: 24,
  wind: 11,
  solar: 45,
  geothermal: 38,
  marine: 17,
  waste: 400,
  storage: 90,
  otherRenewable: 80,
  otherConventional: 400,
  other: 400,
}

const SMARD_FUEL_FILTERS: Array<{ filter: number; fuel: string }> = [
  { filter: 4066, fuel: 'biomass' },
  { filter: 1226, fuel: 'hydro' },
  { filter: 1225, fuel: 'wind' },
  { filter: 4067, fuel: 'wind' },
  { filter: 4068, fuel: 'solar' },
  { filter: 1228, fuel: 'otherRenewable' },
  { filter: 1224, fuel: 'nuclear' },
  { filter: 1223, fuel: 'lignite' },
  { filter: 4069, fuel: 'coal' },
  { filter: 4071, fuel: 'gas' },
  { filter: 4070, fuel: 'storage' },
  { filter: 1227, fuel: 'otherConventional' },
]

const ENTSOE_DOMAINS: Record<string, string> = {
  'EU-DE': '10Y1001A1001A82H',
  'EU-SE': '10YSE-1--------K',
  'EU-NO': '10YNO-1--------2',
  'EU-NL': '10YNL----------L',
  'EU-PT': '10YPT-REN------W',
  'EU-IT': '10Y1001A1001A73I',
  'EU-PL': '10YPL-AREA-----S',
  'EU-CH': '10YCH-SWISSGRIDZ',
  'EU-AT': '10YAT-APG------L',
}

const ENTSOE_PSR_TO_FUEL: Record<string, string> = {
  B01: 'biomass',
  B02: 'lignite',
  B03: 'coal',
  B04: 'gas',
  B05: 'coal',
  B06: 'oil',
  B07: 'oilShale',
  B08: 'peat',
  B09: 'geothermal',
  B10: 'hydro',
  B11: 'hydro',
  B12: 'hydro',
  B13: 'marine',
  B14: 'nuclear',
  B15: 'otherRenewable',
  B16: 'solar',
  B17: 'waste',
  B18: 'wind',
  B19: 'wind',
  B20: 'otherConventional',
  B25: 'storage',
}

function numeric(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function addFuel(fuels: FuelBreakdown, fuel: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) return
  fuels[fuel] = (fuels[fuel] ?? 0) + value
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

function isFreshEnough(timestamp: string, maxAgeMs: number): boolean {
  const parsed = new Date(timestamp).getTime()
  if (!Number.isFinite(parsed)) return false
  return Date.now() - parsed <= maxAgeMs
}

function compactDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
  ].join('')
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function parseIsoDurationMinutes(duration: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(duration)
  if (!match) return 60
  return numeric(match[1]) * 60 + numeric(match[2])
}

function extractTag(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`).exec(block)
  return match?.[1] ?? null
}

function normalizeReeFuel(title: unknown): string {
  const value = String(title ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (value.includes('hidraul')) return 'hydro'
  if (value.includes('nuclear')) return 'nuclear'
  if (value.includes('carbon')) return 'coal'
  if (value.includes('diesel') || value.includes('fuel') || value.includes('fioul')) return 'oil'
  if (value.includes('turbina de gas') || value.includes('ciclo combinado') || value === 'gas') return 'gas'
  if (value.includes('eolica')) return 'wind'
  if (value.includes('solar')) return 'solar'
  if (value.includes('otras renovables')) return 'otherRenewable'
  if (value.includes('residu')) return 'waste'
  if (value.includes('biomasa') || value.includes('biogas')) return 'biomass'
  if (value.includes('cogeneracion')) return 'gas'
  if (value.includes('bombeo')) return 'storage'
  if (value.includes('generacion total')) return 'ignore'
  return 'other'
}

export class EuOpenCarbonClient {
  get entsoeAvailable() {
    return Boolean(env.ENTSOE_API_TOKEN)
  }

  private async logSuccess(source: string) {
    try { await recordIntegrationSuccess(source as any) } catch { /* ignore */ }
  }

  private async logFailure(source: string, message: string) {
    try { await recordIntegrationFailure(source as any, message) } catch { /* ignore */ }
  }

  async getGermanyIntensity(): Promise<EuOpenCarbonData | null> {
    return this.getSmardIntensity('EU-DE', 'DE')
  }

  async getAustriaIntensity(): Promise<EuOpenCarbonData | null> {
    return this.getSmardIntensity('EU-AT', 'AT')
  }

  async getSpainIntensity(): Promise<EuOpenCarbonData | null> {
    const now = new Date()
    const start = new Date(now.getTime() - 48 * 60 * 60 * 1000)
    const format = (date: Date) =>
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T00:00`

    try {
      const response = await axios.get<{ included?: Array<Record<string, any>> }>(
        REE_GENERATION_STRUCTURE_URL,
        {
          params: {
            start_date: format(start),
            end_date: format(now),
            time_trunc: 'day',
          },
          timeout: 12000,
        }
      )

      const fuelBreakdownMw: FuelBreakdown = {}
      let latestTimestamp = ''

      for (const entry of response.data.included ?? []) {
        const fuel = normalizeReeFuel(entry?.attributes?.title ?? entry?.type)
        if (fuel === 'ignore') continue
        const latestValue = Array.isArray(entry?.attributes?.values)
          ? entry.attributes.values[entry.attributes.values.length - 1]
          : null
        const value = numeric(latestValue?.value)
        const timestamp = String(latestValue?.datetime ?? '')
        if (!timestamp || value <= 0) continue
        latestTimestamp = latestTimestamp && latestTimestamp > timestamp ? latestTimestamp : timestamp
        addFuel(fuelBreakdownMw, fuel, value)
      }

      if (!latestTimestamp || !isFreshEnough(latestTimestamp, REE_DAILY_MAX_STALENESS_MS)) {
        await this.logFailure('ES_REE_OPEN_DATA', `REE daily generation mix is stale or empty: ${latestTimestamp || 'none'}`)
        return null
      }

      const carbonIntensity = weightedIntensity(fuelBreakdownMw)
      if (carbonIntensity == null) {
        await this.logFailure('ES_REE_OPEN_DATA', 'REE generation mix returned no usable fuel breakdown')
        return null
      }

      await this.logSuccess('ES_REE_OPEN_DATA')
      return {
        zone: 'EU-ES',
        carbonIntensity,
        timestamp: latestTimestamp,
        isForecast: false,
        method: 'ree-daily-generation-mix-ipcc',
        fuelBreakdownMw,
        sourceUrl: REE_GENERATION_STRUCTURE_URL,
        sourceFreshness: 'daily',
      }
    } catch (error: any) {
      await this.logFailure('ES_REE_OPEN_DATA', error?.message ?? 'Spain REE carbon fetch failed')
      console.warn('Spain REE carbon signal failed:', error?.message ?? error)
      return null
    }
  }

  async getEntsoeIntensity(zone: EuOpenCarbonZone): Promise<EuOpenCarbonData | null> {
    if (!env.ENTSOE_API_TOKEN) return null
    const domain = ENTSOE_DOMAINS[zone]
    if (!domain) return null

    const now = new Date()
    const start = new Date(now.getTime() - 10 * 60 * 60 * 1000)
    const params = {
      securityToken: env.ENTSOE_API_TOKEN,
      documentType: 'A75',
      processType: 'A16',
      in_Domain: domain,
      periodStart: compactDate(start),
      periodEnd: compactDate(now),
    }

    try {
      const response = await axios.get<string>(ENTSOE_BASE_URL, {
        params,
        responseType: 'text',
        timeout: 15000,
      })
      const parsed = this.parseEntsoeGenerationMix(String(response.data), now)

      if (!parsed || !isFreshEnough(parsed.timestamp, ENTSOE_MAX_STALENESS_MS)) {
        await this.logFailure('ENTSOE_TRANSPARENCY', `ENTSO-E generation mix is stale or empty for ${zone}`)
        return null
      }

      const carbonIntensity = weightedIntensity(parsed.fuelBreakdownMw)
      if (carbonIntensity == null) {
        await this.logFailure('ENTSOE_TRANSPARENCY', `ENTSO-E generation mix has no usable fuels for ${zone}`)
        return null
      }

      await this.logSuccess('ENTSOE_TRANSPARENCY')
      return {
        zone,
        carbonIntensity,
        timestamp: parsed.timestamp,
        isForecast: false,
        method: 'entsoe-generation-mix-ipcc',
        fuelBreakdownMw: parsed.fuelBreakdownMw,
        sourceUrl: ENTSOE_BASE_URL,
        sourceFreshness: 'hourly',
      }
    } catch (error: any) {
      await this.logFailure('ENTSOE_TRANSPARENCY', error?.message ?? `ENTSO-E fetch failed for ${zone}`)
      console.warn(`ENTSO-E carbon signal failed for ${zone}:`, error?.message ?? error)
      return null
    }
  }

  private async getSmardIntensity(zone: 'EU-DE' | 'EU-AT', smardRegion: 'DE' | 'AT'): Promise<EuOpenCarbonData | null> {
    const source = zone === 'EU-DE' ? 'DE_SMARD_OPEN_DATA' : 'AT_SMARD_OPEN_DATA'

    try {
      const fuelBreakdownMw: FuelBreakdown = {}
      let latestTimestampMs = 0

      await Promise.all(
        SMARD_FUEL_FILTERS.map(async ({ filter, fuel }) => {
          const point = await this.getLatestSmardPoint(filter, smardRegion)
          if (!point) return
          latestTimestampMs = Math.max(latestTimestampMs, point.timestampMs)
          addFuel(fuelBreakdownMw, fuel, point.value)
        })
      )

      const latestTimestamp = latestTimestampMs > 0 ? new Date(latestTimestampMs).toISOString() : ''
      if (!latestTimestamp || !isFreshEnough(latestTimestamp, SMARD_MAX_STALENESS_MS)) {
        await this.logFailure(source, `SMARD generation mix is stale or empty for ${smardRegion}: ${latestTimestamp || 'none'}`)
        return null
      }

      const carbonIntensity = weightedIntensity(fuelBreakdownMw)
      if (carbonIntensity == null) {
        await this.logFailure(source, `SMARD generation mix has no usable fuel data for ${smardRegion}`)
        return null
      }

      await this.logSuccess(source)
      return {
        zone,
        carbonIntensity,
        timestamp: latestTimestamp,
        isForecast: false,
        method: 'smard-fuel-mix-ipcc',
        fuelBreakdownMw,
        sourceUrl: `${SMARD_BASE_URL}/.../${smardRegion}`,
        sourceFreshness: 'hourly',
      }
    } catch (error: any) {
      await this.logFailure(source, error?.message ?? `SMARD fetch failed for ${smardRegion}`)
      console.warn(`SMARD carbon signal failed for ${smardRegion}:`, error?.message ?? error)
      return null
    }
  }

  private async getLatestSmardPoint(
    filter: number,
    region: string
  ): Promise<{ timestampMs: number; value: number } | null> {
    try {
      const indexUrl = `${SMARD_BASE_URL}/${filter}/${region}/index_hour.json`
      const index = await axios.get<{ timestamps?: number[] }>(indexUrl, { timeout: 8000 })
      const timestamp = index.data.timestamps?.[index.data.timestamps.length - 1]
      if (!timestamp) return null

      const seriesUrl = `${SMARD_BASE_URL}/${filter}/${region}/${filter}_${region}_hour_${timestamp}.json`
      const series = await axios.get<{ series?: Array<[number, number | null]> }>(seriesUrl, { timeout: 8000 })
      const latest = [...(series.data.series ?? [])]
        .reverse()
        .find(([pointTimestamp, value]) => Number.isFinite(pointTimestamp) && Number.isFinite(value))

      if (!latest || latest[1] == null) return null
      return { timestampMs: latest[0], value: latest[1] }
    } catch {
      return null
    }
  }

  private parseEntsoeGenerationMix(
    xml: string,
    now: Date
  ): { timestamp: string; fuelBreakdownMw: FuelBreakdown } | null {
    const timeSeriesBlocks = xml.match(/<TimeSeries[\s\S]*?<\/TimeSeries>/g) ?? []
    const latestByFuel: Record<string, { timestamp: Date; value: number }> = {}

    for (const block of timeSeriesBlocks) {
      const psrType = extractTag(block, 'psrType')
      const fuel = psrType ? ENTSOE_PSR_TO_FUEL[psrType] : null
      if (!fuel) continue

      const periodBlock = block.match(/<Period[\s\S]*?<\/Period>/)?.[0]
      if (!periodBlock) continue

      const start = extractTag(periodBlock, 'start')
      const resolution = extractTag(periodBlock, 'resolution') ?? 'PT60M'
      if (!start) continue

      const startDate = new Date(start)
      if (!Number.isFinite(startDate.getTime())) continue

      const intervalMinutes = parseIsoDurationMinutes(resolution)
      const pointBlocks = periodBlock.match(/<Point[\s\S]*?<\/Point>/g) ?? []
      for (const pointBlock of pointBlocks) {
        const position = numeric(extractTag(pointBlock, 'position'))
        const quantity = numeric(extractTag(pointBlock, 'quantity'))
        if (position <= 0 || quantity <= 0) continue

        const pointTime = addMinutes(startDate, (position - 1) * intervalMinutes)
        if (pointTime.getTime() > now.getTime()) continue

        const previous = latestByFuel[fuel]
        if (!previous || pointTime.getTime() >= previous.timestamp.getTime()) {
          latestByFuel[fuel] = { timestamp: pointTime, value: quantity }
        }
      }
    }

    const fuelBreakdownMw: FuelBreakdown = {}
    let latestTimestamp: Date | null = null
    for (const [fuel, point] of Object.entries(latestByFuel)) {
      addFuel(fuelBreakdownMw, fuel, point.value)
      if (!latestTimestamp || point.timestamp.getTime() > latestTimestamp.getTime()) {
        latestTimestamp = point.timestamp
      }
    }

    if (!latestTimestamp || Object.keys(fuelBreakdownMw).length === 0) return null
    return {
      timestamp: latestTimestamp.toISOString(),
      fuelBreakdownMw,
    }
  }
}

export const euOpenCarbon = new EuOpenCarbonClient()
