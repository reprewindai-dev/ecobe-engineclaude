/**
 * Provider cache.
 *
 * Redis-backed.  Signals are serialised as JSON and keyed by:
 *   carbon:v2:{provider}:{region}:{mode}
 *
 * Cache TTL = CARBON_PROVIDER_MAX_STALENESS_MINUTES (default 10 min).
 * A signal is returned as-is from cache; the router checks freshness and
 * sets the `stale` flag on the ProviderResult if the TTL has been exceeded.
 */

import { redis } from '../redis'
import { carbonProviderConfig } from '../../config/carbon-providers'
import { CarbonSignal, ProviderName } from './types'

const PREFIX = 'carbon:v2'

function cacheKey(provider: ProviderName, region: string, mode: string): string {
  return `${PREFIX}:${provider}:${region}:${mode}`
}

export async function getCached(
  provider: ProviderName,
  region: string,
  mode: string
): Promise<{ signal: CarbonSignal; cachedAt: number } | null> {
  try {
    const raw = await redis.get(cacheKey(provider, region, mode))
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function setCached(
  provider: ProviderName,
  region: string,
  mode: string,
  signal: CarbonSignal
): Promise<void> {
  try {
    const ttlSeconds = carbonProviderConfig.maxStalenessMinutes * 60
    const payload = JSON.stringify({ signal, cachedAt: Date.now() })
    await redis.setex(cacheKey(provider, region, mode), ttlSeconds, payload)
  } catch {
    // Cache write failure is non-fatal
  }
}

export function isStale(cachedAt: number): boolean {
  const maxMs = carbonProviderConfig.maxStalenessMinutes * 60 * 1000
  return Date.now() - cachedAt > maxMs
}
