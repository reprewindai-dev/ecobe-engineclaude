import cron from 'node-cron'
import { subHours, addHours } from 'date-fns'
import { prisma } from '../lib/db'
import { electricityMaps } from '../lib/electricity-maps'
import { forecastCarbonIntensity } from '../lib/carbon-forecasting'
import { getForecastSignals } from '../lib/carbon/provider-router'
import { env } from '../config/env'
import { redis } from '../lib/redis'
import {
  DEFAULT_FORECAST_HOURS,
  DEFAULT_FORECAST_LOOKBACK_HOURS,
  FORECAST_REFRESH_STATE_KEY,
} from '../constants/forecasting'

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
      source: 'ELECTRICITY_MAPS',
    },
    create: {
      region,
      timestamp,
      carbonIntensity: intensity,
      source: 'ELECTRICITY_MAPS',
    },
  })
}

async function ingestRegionHistory(region: string) {
  const end = new Date()
  const start = subHours(end, DEFAULT_FORECAST_LOOKBACK_HOURS)
  const history = await electricityMaps.getCarbonIntensityHistory(region, start, end)

  let ingested = 0
  for (const sample of history) {
    const timestamp = new Date(sample.datetime)
    const carbonIntensity = Math.round(sample.carbonIntensity)
    await upsertCarbonSample(sample.zone ?? region, timestamp, carbonIntensity)
    ingested += 1
  }

  // Internal statistical model forecasts (as before)
  const internalForecasts = await forecastCarbonIntensity(region, DEFAULT_FORECAST_HOURS)

  // Real provider forecasts from Electricity Maps — persist to CarbonForecast
  const now = new Date()
  const forecastTo = addHours(now, DEFAULT_FORECAST_HOURS)
  let providerForecastCount = 0

  try {
    const signals = await getForecastSignals(region, now, forecastTo)
    for (const signal of signals) {
      if (!signal.forecast_time || signal.intensity_gco2_per_kwh <= 0) continue
      const referenceTime = signal.observed_time ? new Date(signal.observed_time) : now
      const forecastTime = new Date(signal.forecast_time)
      const horizonHours = (forecastTime.getTime() - referenceTime.getTime()) / (1000 * 60 * 60)

      await prisma.carbonForecast.upsert({
        where: {
          region_forecastTime_source: {
            region: signal.region,
            forecastTime,
            source: signal.source,
          },
        },
        update: {
          predictedIntensity: Math.round(signal.intensity_gco2_per_kwh),
          confidence: signal.confidence ?? 0.75,
          referenceTime,
          horizonHours: Math.max(0, horizonHours ?? 0),
        },
        create: {
          region: signal.region,
          source: signal.source,
          forecastTime,
          predictedIntensity: Math.round(signal.intensity_gco2_per_kwh),
          confidence: signal.confidence ?? 0.75,
          referenceTime,
          horizonHours: Math.max(0, horizonHours ?? 0),
          modelVersion: 'provider-live',
          features: signal.metadata ?? {},
        },
      })
      providerForecastCount++
    }
  } catch (err: any) {
    console.warn(`[forecast-poller] Provider forecast ingestion failed for ${region}:`, err?.message)
    // Non-fatal — internal model forecasts are still available
  }

  return {
    recordsIngested: ingested,
    forecastsGenerated: internalForecasts.length + providerForecastCount,
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
  const regions = await prisma.region.findMany({ where: { enabled: true }, select: { code: true } })
  let totalRecords = 0
  let totalForecasts = 0
  let failed = false
  let failureMessage: string | undefined

  for (const region of regions) {
    try {
      const result = await ingestRegionHistory(region.code)
      totalRecords += result.recordsIngested
      totalForecasts += result.forecastsGenerated
      await recordRefresh(region.code, {
        recordsIngested: result.recordsIngested,
        forecastsGenerated: result.forecastsGenerated,
        status: 'SUCCESS',
      })
    } catch (error: any) {
      failed = true
      failureMessage = error?.message ?? 'Unknown forecast refresh error'
      console.error(`Forecast refresh failed for ${region.code}:`, error)
      await recordRefresh(region.code, {
        recordsIngested: 0,
        forecastsGenerated: 0,
        status: 'FAILURE',
        message: failureMessage,
      })
    }
  }

  await redis.hset(FORECAST_REFRESH_STATE_KEY, {
    timestamp: new Date().toISOString(),
    totalRegions: regions.length.toString(),
    totalRecords: totalRecords.toString(),
    totalForecasts: totalForecasts.toString(),
    status: failed ? 'FAILURE' : 'SUCCESS',
    message: failureMessage ?? '',
  })
}

export function startForecastWorker() {
  if (!env.FORECAST_REFRESH_ENABLED) {
    console.log('⏭️  Forecast refresh worker disabled')
    return
  }

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
