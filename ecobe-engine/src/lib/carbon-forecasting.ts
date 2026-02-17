/**
 * Carbon Forecasting (ML Moat)
 *
 * Predicts future carbon intensity using:
 * - Historical patterns
 * - Time of day
 * - Day of week
 * - Season
 * - Weather forecasts (future)
 */

import { prisma } from './db'
import { electricityMaps } from './electricity-maps'
import { addHours, subDays } from 'date-fns'

export interface CarbonForecast {
  region: string
  forecastTime: Date
  predictedIntensity: number
  confidence: number
  trend: 'increasing' | 'decreasing' | 'stable'
}

/**
 * Simple forecasting model (v1.0)
 * Uses moving average of historical data
 *
 * Future improvements:
 * - LSTM neural network
 * - Weather integration
 * - Grid dispatch data
 * - Renewable capacity forecasts
 */
export async function forecastCarbonIntensity(
  region: string,
  hoursAhead: number = 24
): Promise<CarbonForecast[]> {
  // Get historical data
  const historicalData = await prisma.carbonIntensity.findMany({
    where: {
      region,
      timestamp: {
        gte: subDays(new Date(), 7),  // Last 7 days
      },
    },
    orderBy: { timestamp: 'desc' },
  })

  if (historicalData.length < 24) {
    // Not enough data, use Electricity Maps forecast
    const forecast = await electricityMaps.getForecast(region)
    return forecast.map((f) => ({
      region: f.zone,
      forecastTime: new Date(f.datetime),
      predictedIntensity: f.carbonIntensity,
      confidence: 0.7,
      trend: 'stable' as const,
    }))
  }

  // Generate forecasts
  const forecasts: CarbonForecast[] = []
  const now = new Date()

  for (let h = 1; h <= hoursAhead; h++) {
    const forecastTime = addHours(now, h)
    const hour = forecastTime.getHours()
    const dayOfWeek = forecastTime.getDay()

    // Find similar historical periods (same hour, similar day of week)
    const similarPeriods = historicalData.filter((d) => {
      const dHour = d.timestamp.getHours()
      const dDay = d.timestamp.getDay()
      return Math.abs(dHour - hour) <= 1 && Math.abs(dDay - dayOfWeek) <= 1
    })

    if (similarPeriods.length === 0) continue

    // Calculate weighted moving average (more recent = higher weight)
    let totalWeight = 0
    let weightedSum = 0

    similarPeriods.forEach((d, idx) => {
      const weight = 1 / (idx + 1)  // More recent = higher weight
      weightedSum += d.carbonIntensity * weight
      totalWeight += weight
    })

    const predictedIntensity = Math.round(weightedSum / totalWeight)

    // Calculate confidence based on data variance
    const variance =
      similarPeriods.reduce((sum, d) => sum + Math.pow(d.carbonIntensity - predictedIntensity, 2), 0) /
      similarPeriods.length
    const stdDev = Math.sqrt(variance)
    const confidence = Math.max(0.5, Math.min(0.95, 1 - stdDev / predictedIntensity))

    // Determine trend
    const recentAvg =
      similarPeriods.slice(0, 3).reduce((sum, d) => sum + d.carbonIntensity, 0) / 3
    const olderAvg =
      similarPeriods.slice(-3).reduce((sum, d) => sum + d.carbonIntensity, 0) / 3
    const trend =
      recentAvg > olderAvg * 1.05
        ? 'increasing'
        : recentAvg < olderAvg * 0.95
          ? 'decreasing'
          : 'stable'

    forecasts.push({
      region,
      forecastTime,
      predictedIntensity,
      confidence,
      trend,
    })

    // Store forecast
    await prisma.carbonForecast.create({
      data: {
        region,
        forecastTime,
        predictedIntensity,
        confidence,
        modelVersion: 'v1.0',
        features: {
          hour,
          dayOfWeek,
          historicalCount: similarPeriods.length,
        },
      },
    }).catch(() => {}) // Ignore duplicates
  }

  return forecasts
}

/**
 * Find optimal execution window based on forecasts
 */
export async function findOptimalWindow(
  region: string,
  durationHours: number,
  lookAheadHours: number = 48
): Promise<{
  startTime: Date
  endTime: Date
  avgCarbonIntensity: number
  savings: number  // % vs immediate execution
}> {
  const forecasts = await forecastCarbonIntensity(region, lookAheadHours)

  if (forecasts.length === 0) {
    const now = new Date()
    return {
      startTime: now,
      endTime: addHours(now, durationHours),
      avgCarbonIntensity: 400,
      savings: 0,
    }
  }

  // Find best continuous window
  let bestStart = 0
  let bestAvg = Infinity

  for (let i = 0; i <= forecasts.length - durationHours; i++) {
    const windowForecasts = forecasts.slice(i, i + durationHours)
    const avg =
      windowForecasts.reduce((sum, f) => sum + f.predictedIntensity, 0) / windowForecasts.length

    if (avg < bestAvg) {
      bestAvg = avg
      bestStart = i
    }
  }

  const startTime = forecasts[bestStart].forecastTime
  const endTime = addHours(startTime, durationHours)

  // Calculate savings vs immediate execution
  const immediateAvg = forecasts.slice(0, durationHours).reduce((sum, f) => sum + f.predictedIntensity, 0) / durationHours
  const savings = ((immediateAvg - bestAvg) / immediateAvg) * 100

  return {
    startTime,
    endTime,
    avgCarbonIntensity: bestAvg,
    savings,
  }
}
