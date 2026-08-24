import * as cron from 'node-cron'

import {
  euOpenCarbon,
  getEntsoeDomain,
  getEntsoeZones,
} from '../lib/eu-open-carbon'
import { prisma } from '../lib/db'
import { storeProviderSnapshot } from '../lib/routing/provider-snapshots'
import { setWorkerStatus } from '../routes/system'

const RENEWABLE_FUELS = new Set([
  'biomass',
  'hydro',
  'wind',
  'solar',
  'geothermal',
  'marine',
  'otherRenewable',
])
const FOSSIL_FUELS = new Set([
  'lignite',
  'coal',
  'gas',
  'oil',
  'oilShale',
  'peat',
])

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function calculateRatios(fuelBreakdownMw: Record<string, number>): {
  renewableRatio: number | null
  fossilRatio: number | null
} {
  let denominator = 0
  let renewableMw = 0
  let fossilMw = 0

  for (const [fuel, value] of Object.entries(fuelBreakdownMw)) {
    if (!Number.isFinite(value) || value <= 0) continue
    denominator += value
    if (RENEWABLE_FUELS.has(fuel)) renewableMw += value
    if (FOSSIL_FUELS.has(fuel)) fossilMw += value
  }

  if (denominator === 0) {
    return { renewableRatio: null, fossilRatio: null }
  }

  return {
    renewableRatio: renewableMw / denominator,
    fossilRatio: fossilMw / denominator,
  }
}

export class EntsoeIngestionWorker {
  private isRunning = false
  private ingestionTask?: cron.ScheduledTask

  async start(schedule: string = '0 10 * * * *'): Promise<void> {
    if (!euOpenCarbon.entsoeAvailable) {
      console.warn(
        'ENTSO-E ingestion worker disabled: ENTSOE_API_TOKEN is not configured',
      )
      setWorkerStatus('entsoeIngestion', {
        running: false,
        lastRun: null,
        nextRun: null,
      })
      return
    }

    if (this.isRunning) {
      console.warn('ENTSO-E ingestion worker is already running')
      return
    }

    console.log('Starting ENTSO-E generation ingestion worker...')
    this.isRunning = true
    setWorkerStatus('entsoeIngestion', {
      running: true,
      lastRun: null,
      nextRun: null,
    })

    await this.runIngestion()

    this.ingestionTask = cron.schedule(schedule, async () => {
      try {
        await this.runIngestion()
      } catch (error) {
        console.error('ENTSO-E ingestion failed:', error)
      }
    })

    console.log(
      `ENTSO-E generation ingestion worker started with schedule: ${schedule}`,
    )
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return

    console.log('Stopping ENTSO-E generation ingestion worker...')
    this.isRunning = false
    this.ingestionTask?.stop()
    this.ingestionTask = undefined
    setWorkerStatus('entsoeIngestion', {
      running: false,
      nextRun: null,
    })
    console.log('ENTSO-E generation ingestion worker stopped')
  }

  async runIngestion(): Promise<void> {
    const runStart = new Date()
    let successCount = 0
    let skippedCount = 0
    let failureCount = 0

    try {
      const zones = getEntsoeZones()
      for (const [index, zone] of zones.entries()) {
        try {
          const domain = getEntsoeDomain(zone)
          if (!domain) {
            skippedCount++
            console.warn(`ENTSO-E ingestion skipped ${zone}: no domain configured`)
          } else {
            const data = await euOpenCarbon.getEntsoeIntensity(zone)

            if (!data) {
              skippedCount++
              console.warn(`ENTSO-E ingestion skipped ${zone}: no usable data`)
            } else {
              const observedAt = new Date(data.timestamp)
              const fetchedAt = new Date()
              const { renewableRatio, fossilRatio } = calculateRatios(
                data.fuelBreakdownMw,
              )

              await prisma.entsoeGenerationRaw.createMany({
                data: [{
                  zone,
                  domain,
                  observedAt,
                  carbonIntensityGco2Kwh: data.carbonIntensity,
                  fuelBreakdownMw: data.fuelBreakdownMw,
                  method: data.method,
                  sourceUrl: data.sourceUrl,
                  sourceFreshness: data.sourceFreshness,
                  fetchedAt,
                }],
                skipDuplicates: true,
              })

              await prisma.gridSignalSnapshot.createMany({
                data: [{
                  region: zone,
                  balancingAuthority: null,
                  timestamp: observedAt,
                  renewableRatio,
                  fossilRatio,
                  signalQuality: 'HIGH',
                  estimatedFlag: false,
                  syntheticFlag: false,
                  source: 'entsoe',
                  metadata: {
                    carbonIntensityGco2Kwh: data.carbonIntensity,
                    method: data.method,
                    sourceUrl: data.sourceUrl,
                    sourceFreshness: data.sourceFreshness,
                    fuelBreakdownMw: data.fuelBreakdownMw,
                  },
                }],
                skipDuplicates: true,
              })

              await storeProviderSnapshot({
                provider: 'entsoe',
                zone,
                signalType: 'intensity',
                signalValue: data.carbonIntensity,
                observedAt,
                freshnessSec: Math.floor(
                  (fetchedAt.getTime() - observedAt.getTime()) / 1000,
                ),
                metadata: {
                  method: data.method,
                  sourceUrl: data.sourceUrl,
                },
              })

              successCount++
              console.log(`ENTSO-E ingestion stored ${zone}`)
            }
          }
        } catch (error) {
          failureCount++
          console.error(`ENTSO-E ingestion failed for ${zone}:`, error)
        }

        if (index < zones.length - 1) {
          await sleep(1000)
        }
      }
    } catch (error) {
      console.error('ENTSO-E ingestion failed:', error)
    } finally {
      console.log(
        `ENTSO-E ingestion completed: ${successCount} successful, ${skippedCount} skipped, ${failureCount} failed`,
      )
      setWorkerStatus('entsoeIngestion', {
        running: this.isRunning,
        lastRun: runStart.toISOString(),
        nextRun: null,
      })
    }
  }

  getStatus(): {
    isRunning: boolean
    zones: string[]
    schedule: string
  } {
    return {
      isRunning: this.isRunning,
      zones: getEntsoeZones(),
      schedule:
        (this.ingestionTask as any)?.getOptions?.()?.scheduled ||
        '0 10 * * * *',
    }
  }
}

let entsoeWorker: EntsoeIngestionWorker | null = null

export async function startEntsoeIngestionWorker(): Promise<void> {
  if (!entsoeWorker) {
    entsoeWorker = new EntsoeIngestionWorker()
  }
  await entsoeWorker.start()
}

export async function stopEntsoeIngestionWorker(): Promise<void> {
  if (entsoeWorker) {
    await entsoeWorker.stop()
    entsoeWorker = null
  }
}

export function getEntsoeWorker(): EntsoeIngestionWorker | null {
  return entsoeWorker
}
