/**
 * Market Intelligence Service — Day-Ahead Electricity Price
 *
 * Day-ahead prices are wholesale electricity costs published the previous day.
 * They are a strong proxy for grid carbon intensity: high prices often correlate
 * with fossil peaker plants being dispatched.
 *
 * Key use cases:
 *   - Energy cost optimization for compute workloads
 *   - Price + carbon joint optimization
 *   - EV charging cost minimization
 *   - Energy trading signal integration
 *
 * Coverage: ~142 zones worldwide (concentrated in Europe, Australia, parts of US)
 */

import { emClient } from './client'
import type { EM_DayAheadPriceResponse } from './types'

export interface DayAheadPriceSnapshot {
  zone: string
  datetime: string
  value: number
  currency: string              // extracted from unit, e.g. 'EUR'
  unit: string                  // full unit string, e.g. 'EUR/MWh'
  source: string
  temporalGranularity: string
}

function normalizePrice(p: EM_DayAheadPriceResponse): DayAheadPriceSnapshot {
  // Extract currency from unit: 'EUR/MWh' → 'EUR'
  const currency = p.unit?.split('/')[0] ?? 'UNKNOWN'
  return {
    zone: p.zone,
    datetime: p.datetime,
    value: p.value,
    currency,
    unit: p.unit,
    source: p.source,
    temporalGranularity: p.temporalGranularity,
  }
}

/**
 * Get the most recent day-ahead price for a zone.
 */
export async function getDayAheadPrice(zone: string): Promise<DayAheadPriceSnapshot | null> {
  const res = await emClient.getDayAheadPriceLatest(zone)
  if (!res) return null
  return normalizePrice(res)
}

/**
 * Get the day-ahead price for a specific historical datetime.
 */
export async function getDayAheadPricePast(
  zone: string,
  datetime: Date,
): Promise<DayAheadPriceSnapshot | null> {
  const res = await emClient.getDayAheadPricePast(zone, datetime.toISOString())
  if (!res) return null
  return normalizePrice(res)
}

/**
 * Get day-ahead prices for a date range.
 */
export async function getDayAheadPriceRange(
  zone: string,
  start: Date,
  end: Date,
): Promise<DayAheadPriceSnapshot[]> {
  const res = await emClient.getDayAheadPricePastRange(
    zone,
    start.toISOString(),
    end.toISOString(),
  )
  if (!res) return []
  return (res.data ?? []).map(normalizePrice)
}

/**
 * Get forecast day-ahead prices (next 24h typically).
 */
export async function getDayAheadPriceForecast(zone: string): Promise<DayAheadPriceSnapshot[]> {
  const res = await emClient.getDayAheadPriceForecast(zone)
  if (!res) return []
  return (res.data ?? []).map(normalizePrice)
}

/**
 * Find the cheapest hour in a forecast window.
 * Used for scheduling cost-sensitive workloads.
 */
export function findCheapestHour(
  forecast: DayAheadPriceSnapshot[],
): DayAheadPriceSnapshot | null {
  if (forecast.length === 0) return null
  return forecast.reduce((min, p) => (p.value < min.value ? p : min), forecast[0])
}
