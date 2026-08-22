import axios from 'axios'
import { recordIntegrationFailure, recordIntegrationSuccess } from './integration-metrics'

type FuelBreakdown = Record<string, number>

export interface CanadaCarbonData {
  zone: 'CA-ON' | 'CA-QC'
  carbonIntensity: number
  timestamp: string
  isForecast: false
  method: 'ieso-generator-output-ipcc' | 'hydro-quebec-open-data-ipcc'
  fuelBreakdownMw: FuelBreakdown
  sourceUrl: string
}

const IESO_GENERATOR_OUTPUT_URL =
  'https://reports-public.ieso.ca/public/GenOutputCapability/PUB_GenOutputCapability.xml'
const HYDRO_QUEBEC_PRODUCTION_URL =
  'https://hydroquebec.aws-ec2-ca-central-1.opendatasoft.com/api/explore/v2.1/catalog/datasets/production-electricite-quebec/records'

const FUEL_FACTORS_G_PER_KWH: Record<string, number> = {
  nuclear: 12,
  hydro: 24,
  wind: 11,
  solar: 45,
  gas: 490,
  biofuel: 230,
  thermal: 650,
  other: 100,
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

function normalizeIesoFuel(fuelType: string): string {
  const normalized = fuelType.trim().toLowerCase()
  if (normalized.includes('nuclear')) return 'nuclear'
  if (normalized.includes('hydro')) return 'hydro'
  if (normalized.includes('wind')) return 'wind'
  if (normalized.includes('solar')) return 'solar'
  if (normalized.includes('gas')) return 'gas'
  if (normalized.includes('bio')) return 'biofuel'
  return 'other'
}

function tagValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match?.[1]?.trim() ?? null
}

function parseOntarioGeneratorOutput(xml: string): CanadaCarbonData | null {
  const date = tagValue(xml, 'Date')
  const createdAt = tagValue(xml, 'CreatedAt')
  const generatorBlocks = xml.match(/<Generator>[\s\S]*?<\/Generator>/g) ?? []
  const perGenerator = generatorBlocks
    .map((block) => {
      const fuel = normalizeIesoFuel(tagValue(block, 'FuelType') ?? 'OTHER')
      const outputBlocks = block.match(/<Output>[\s\S]*?<\/Output>/g) ?? []
      const outputs = outputBlocks
        .map((outputBlock) => ({
          hour: numeric(tagValue(outputBlock, 'Hour')),
          mw: numeric(tagValue(outputBlock, 'EnergyMW')),
        }))
        .filter((output) => output.hour > 0 && output.mw >= 0)

      return { fuel, outputs }
    })
    .filter((generator) => generator.outputs.length > 0)

  const latestHour = Math.max(
    ...perGenerator.flatMap((generator) =>
      generator.outputs.filter((output) => output.mw > 0).map((output) => output.hour)
    )
  )

  if (!Number.isFinite(latestHour) || latestHour <= 0) return null

  const fuelBreakdownMw: FuelBreakdown = {}
  for (const generator of perGenerator) {
    const output = generator.outputs.find((candidate) => candidate.hour === latestHour)
    if (!output || output.mw <= 0) continue
    fuelBreakdownMw[generator.fuel] = (fuelBreakdownMw[generator.fuel] ?? 0) + output.mw
  }

  const carbonIntensity = weightedIntensity(fuelBreakdownMw)
  if (carbonIntensity == null) return null

  const timestamp = date
    ? `${date}T${String(latestHour - 1).padStart(2, '0')}:00:00-05:00`
    : createdAt ?? new Date().toISOString()

  return {
    zone: 'CA-ON',
    carbonIntensity,
    timestamp,
    isForecast: false,
    method: 'ieso-generator-output-ipcc',
    fuelBreakdownMw,
    sourceUrl: IESO_GENERATOR_OUTPUT_URL,
  }
}

export class CanadaCarbonClient {
  private async logSuccess(source: 'ON_CARBON' | 'QC_CARBON') {
    try { await recordIntegrationSuccess(source as any) } catch { /* ignore */ }
  }

  private async logFailure(source: 'ON_CARBON' | 'QC_CARBON', message: string) {
    try { await recordIntegrationFailure(source as any, message) } catch { /* ignore */ }
  }

  async getOntarioIntensity(): Promise<CanadaCarbonData | null> {
    try {
      const response = await axios.get<string>(IESO_GENERATOR_OUTPUT_URL, {
        timeout: 12000,
        responseType: 'text',
      })
      const parsed = parseOntarioGeneratorOutput(response.data)
      if (!parsed) {
        await this.logFailure('ON_CARBON', 'IESO generator report did not contain usable output')
        return null
      }

      await this.logSuccess('ON_CARBON')
      return parsed
    } catch (error: any) {
      await this.logFailure('ON_CARBON', error?.message ?? 'Ontario carbon fetch failed')
      console.warn('Ontario IESO carbon signal failed:', error?.message ?? error)
      return null
    }
  }

  async getQuebecIntensity(): Promise<CanadaCarbonData | null> {
    try {
      const response = await axios.get<{ results?: Array<Record<string, unknown>> }>(
        HYDRO_QUEBEC_PRODUCTION_URL,
        {
          params: {
            where: 'valeurs_total>0',
            order_by: 'date desc',
            limit: 1,
          },
          timeout: 12000,
        }
      )

      const latest = response.data.results?.[0]
      if (!latest) {
        await this.logFailure('QC_CARBON', 'Hydro-Quebec production API returned no usable records')
        return null
      }

      const fuelBreakdownMw: FuelBreakdown = {
        hydro: numeric(latest.valeurs_hydraulique),
        wind: numeric(latest.valeurs_eolien),
        solar: numeric(latest.valeurs_solaire),
        thermal: numeric(latest.valeurs_thermique),
        other: numeric(latest.valeurs_autres),
      }
      const carbonIntensity = weightedIntensity(fuelBreakdownMw)
      if (carbonIntensity == null) return null

      await this.logSuccess('QC_CARBON')
      return {
        zone: 'CA-QC',
        carbonIntensity,
        timestamp: String(latest.date ?? new Date().toISOString()),
        isForecast: false,
        method: 'hydro-quebec-open-data-ipcc',
        fuelBreakdownMw,
        sourceUrl: HYDRO_QUEBEC_PRODUCTION_URL,
      }
    } catch (error: any) {
      await this.logFailure('QC_CARBON', error?.message ?? 'Quebec carbon fetch failed')
      console.warn('Quebec Hydro-Quebec carbon signal failed:', error?.message ?? error)
      return null
    }
  }
}

export const canadaCarbon = new CanadaCarbonClient()
