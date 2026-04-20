import cron from 'node-cron'
import { prisma } from '../lib/db'
import { providerRouter } from '../lib/carbon/provider-router'
import { forecastCarbonIntensity } from '../lib/carbon-forecasting'
import { env } from '../config/env'
import { redis } from '../lib/redis'
import { setWorkerStatus } from '../routes/system'
import {
  DEFAULT_FORECAST_HOURS,
  DEFAULT_FORECAST_LOOKBACK_HOURS,
  FORECAST_REFRESH_STATE_KEY,
} from '../constants/forecasting'
import { REFERENCE_REGIONS } from '../constants/reference-regions'

const FALLBACK_FORECAST_REGIONS = REFERENCE_REGIONS.map((region) => region.code)

async function upsertCarbonSample(region: string, timestamp: Date, intensity: number) {
  await prisma.carbonIntensity.upsert({
    where: {
      region_timestamp: {
        region,
        timestamp,
      },
    },
    update: {
      carbonIntensity: intensity,
      source: 'PROVIDER_ROUTER',
    },
    create: {
      region,
      timestamp,
      carbonIntensity: intensity,
      source: 'PROVIDER_ROUTER',
    },
  })
}

async function ingestRegionHistory(region: string) {
  // Sample current signal from provider-router (EM history removed — disallowed provider)
  let ingested = 0
  try {
    const signal = await providerRouter.getRoutingSignal(region, new Date())
    if (signal && signal.source !== 'fallback') {
      await upsertCarbonSample(region, new Date(), Math.round(signal.carbonIntensity))
      ingested = 1
    }
  } catch (err) {
    console.warn(`forecast-poller: signal fetch failed for ${region}:`, err)
  }

  const forecasts = await forecastCarbonIntensity(region, DEFAULT_FORECAST_HOURS)

  return {
    recordsIngested: ingested,
    forecastsGenerated: forecasts.length,
  }
}

async function recordRefresh(region: string, payload: {
  recordsIngested: number
  forecastsGenerated: number
  status: 'SUCCESS' | 'FAILURE'
  message?: string
}) {
  await prisma.forecastRefresh.create({
    data: {
      region,
      recordsIngested: payload.recordsIngested,
      forecastsGenerated: payload.forecastsGenerated,
      status: payload.status,
      message: payload.message,
    },
  })
}

export async function runForecastRefresh() {
  const runStart = new Date()
  try {
    const regions = await prisma.region.findMany({ where: { enabled: true }, select: { code: true } })
    const regionCodes =
      regions.length > 0
        ? regions.map((region: { code: string }) => region.code)
        : FALLBACK_FORECAST_REGIONS
    let totalRecords = 0
    let totalForecasts = 0
    let failed = false
    let failureMessage: string | undefined

    if (regions.length === 0) {
      console.warn('Forecast refresh: Region table is empty; falling back to canonical region list')
    }

    for (const regionCode of regionCodes) {
      try {
        const result = await ingestRegionHistory(regionCode)
        totalRecords += result.recordsIngested
        totalForecasts += result.forecastsGenerated
        await recordRefresh(regionCode, {
          recordsIngested: result.recordsIngested,
          forecastsGenerated: result.forecastsGenerated,
          status: 'SUCCESS',
        })
      } catch (error: any) {
        failed = true
        failureMessage = error?.message ?? 'Unknown forecast refresh error'
        console.error(`Forecast refresh failed for ${regionCode}:`, error)
        await recordRefresh(regionCode, {
          recordsIngested: 0,
          forecastsGenerated: 0,
          status: 'FAILURE',
          message: failureMessage,
        })
      }
    }

    await redis.hset(FORECAST_REFRESH_STATE_KEY, {
      timestamp: new Date().toISOString(),
      totalRegions: regionCodes.length.toString(),
      totalRecords: totalRecords.toString(),
      totalForecasts: totalForecasts.toString(),
      status: failed ? 'FAILURE' : 'SUCCESS',
      message: failureMessage ?? '',
    })

    // Update worker status
    setWorkerStatus('forecastPoller', {
      running: true,
      lastRun: runStart.toISOString(),
      nextRun: null
    })
  } catch (error) {
    console.error('Fatal error in forecast refresh:', error)
    setWorkerStatus('forecastPoller', {
      running: false,
      lastRun: new Date().toISOString(),
      nextRun: null
    })
  }
}

export function startForecastWorker() {
  if (!env.FORECAST_REFRESH_ENABLED) {
    console.log('⏭️  Forecast refresh worker disabled')
    return
  }

  setWorkerStatus('forecastPoller', {
    running: true,
    lastRun: null,
    nextRun: null
  })

  cron.schedule(env.FORECAST_REFRESH_CRON, () => {
    runForecastRefresh().catch((error) => {
      console.error('Forecast refresh cron error:', error)
    })
  })

  runForecastRefresh().catch((error) => {
    console.error('Initial forecast refresh error:', error)
  })

  console.log(`🌀 Forecast worker scheduled (${env.FORECAST_REFRESH_CRON})`)
}
