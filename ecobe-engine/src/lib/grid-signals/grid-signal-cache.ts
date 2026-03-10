/**
 * Grid Signal Cache
 *
 * Redis-backed cache for GridSignalSnapshot objects.
 * TTL: 5 minutes (300 seconds) — EIA-930 publishes hourly; 5-min cache is safe.
 *
 * Key scheme: grid:signal:<region>
 *
 * All Redis errors are caught and logged — cache miss is the safe failure mode.
 */

import { redis } from '../redis'
import { logger } from '../logger'
import type { GridSignalSnapshot, GridSignalCacheEntry } from './types'

const CACHE_TTL_SECONDS = 300        // 5 minutes
const KEY_PREFIX = 'grid:signal:'

function cacheKey(region: string): string {
  return `${KEY_PREFIX}${region}`
}

/**
 * Store a GridSignalSnapshot in Redis.
 * Returns true on success, false on any error.
 */
export async function cacheGridSignal(snapshot: GridSignalSnapshot): Promise<boolean> {
  const entry: GridSignalCacheEntry = {
    snapshot,
    cachedAt: Date.now(),
    ttlSeconds: CACHE_TTL_SECONDS,
  }
  try {
    await redis.setex(cacheKey(snapshot.region), CACHE_TTL_SECONDS, JSON.stringify(entry))
    return true
  } catch (err) {
    logger.warn({ region: snapshot.region, err }, '[grid-cache] write failed')
    return false
  }
}

/**
 * Retrieve a GridSignalSnapshot from cache.
 * Returns null on cache miss or any error.
 */
export async function getCachedGridSignal(region: string): Promise<GridSignalSnapshot | null> {
  try {
    const raw = await redis.get(cacheKey(region))
    if (!raw) return null
    const entry: GridSignalCacheEntry = JSON.parse(raw)
    return entry.snapshot
  } catch (err) {
    logger.warn({ region, err }, '[grid-cache] read failed')
    return null
  }
}

/**
 * Retrieve or compute a GridSignalSnapshot with cache-aside pattern.
 * If cache miss, calls the provided fetcher and stores the result.
 */
export async function getOrFetchGridSignal(
  region: string,
  fetcher: () => Promise<GridSignalSnapshot | null>,
): Promise<GridSignalSnapshot | null> {
  const cached = await getCachedGridSignal(region)
  if (cached) return cached

  const fresh = await fetcher()
  if (fresh) {
    void cacheGridSignal(fresh)   // fire-and-forget
  }
  return fresh
}

/**
 * Invalidate cache for a specific region.
 */
export async function invalidateGridSignal(region: string): Promise<void> {
  try {
    await redis.del(cacheKey(region))
  } catch (err) {
    logger.warn({ region, err }, '[grid-cache] invalidate failed')
  }
}

/**
 * Get the remaining TTL (seconds) for a cached signal.
 * Returns -1 if key does not exist (or error).
 */
export async function getCacheTtl(region: string): Promise<number> {
  try {
    return await redis.ttl(cacheKey(region))
  } catch {
    return -1
  }
}
