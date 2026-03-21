import { randomUUID } from 'crypto'

export type NormalizedSignal = {
  region: string
  gridZone: string
  carbonValue: number
  signalType: 'moer' | 'average'
  source: string
  confidence: number
  freshness: string
  degraded: boolean
}

/**
 * Temporary static signal service
 * Returns normalized signals immediately to get system online
 */
export async function getSignal(region: string): Promise<NormalizedSignal> {
  // Temporary static implementation with slight variation
  const baseValue = 180
  const variation = Math.random() * 40 - 20 // ±20g variation
  
  return {
    region,
    gridZone: 'TEMP', // Will be replaced by real mapping
    carbonValue: Math.round(baseValue + variation),
    signalType: 'average',
    source: 'static',
    confidence: 0.3,
    freshness: new Date().toISOString(),
    degraded: true,
  }
}

/**
 * Get signals for multiple regions
 */
export async function getSignals(regions: string[]): Promise<NormalizedSignal[]> {
  return Promise.all(regions.map(region => getSignal(region)))
}
