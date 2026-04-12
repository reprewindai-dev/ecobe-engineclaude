import { redis } from '../redis'

export const REGION_RELIABILITY_HASH_KEY = 'ci:region-reliability:v1'
export const REGION_RELIABILITY_META_KEY = 'ci:region-reliability:meta:v1'
const REGION_RELIABILITY_CACHE_TTL_MS = 30_000

let regionReliabilityCache:
  | {
      expiresAt: number
      values: Record<string, number>
    }
  | null = null

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export interface RegionLearningStats {
  total: number
  denyRate: number
  fallbackRate: number
  avgSavingsPct: number
  avgSignalConfidence: number
}

export function computeRegionReliabilityMultiplier(stats: RegionLearningStats): number {
  // Baseline multiplier at 1.0 with bounded adaptive adjustments.
  const savingsSignal = stats.avgSavingsPct / 100 // 0.0 .. ~1.0
  const confidenceSignal = stats.avgSignalConfidence - 0.5 // -0.5 .. +0.5

  const adjusted =
    1 +
    savingsSignal * 0.25 +
    confidenceSignal * 0.15 -
    stats.denyRate * 0.35 -
    stats.fallbackRate * 0.25

  return Number(clamp(adjusted, 0.8, 1.2).toFixed(4))
}

export async function loadRegionReliabilityMultipliers(
  regions: string[]
): Promise<Record<string, number>> {
  const now = Date.now()
  if (regionReliabilityCache && regionReliabilityCache.expiresAt > now) {
    return regions.reduce<Record<string, number>>((acc, region) => {
      acc[region] = regionReliabilityCache?.values[region] ?? 1
      return acc
    }, {})
  }

  try {
    const hash = await redis.hgetall(REGION_RELIABILITY_HASH_KEY)
    const cachedValues = Object.entries(hash ?? {}).reduce<Record<string, number>>((acc, [region, raw]) => {
      const parsed = raw !== undefined ? Number(raw) : NaN
      acc[region] = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
      return acc
    }, {})

    regionReliabilityCache = {
      expiresAt: now + REGION_RELIABILITY_CACHE_TTL_MS,
      values: cachedValues,
    }

    return regions.reduce<Record<string, number>>((acc, region) => {
      acc[region] = cachedValues[region] ?? 1
      return acc
    }, {})
  } catch {
    return regions.reduce<Record<string, number>>((acc, region) => {
      acc[region] = 1
      return acc
    }, {})
  }
}

export function resetRegionReliabilityCache() {
  regionReliabilityCache = null
}

export async function persistRegionReliabilityMultipliers(
  scores: Record<string, number>,
  metadata: Record<string, string>
): Promise<void> {
  const entries = Object.entries(scores)
  if (entries.length === 0) return

  await redis.hset(
    REGION_RELIABILITY_HASH_KEY,
    Object.fromEntries(entries.map(([k, v]) => [k, v.toString()]))
  )
  await redis.hset(REGION_RELIABILITY_META_KEY, metadata)
}

export async function getRegionReliabilityMetadata(): Promise<Record<string, string>> {
  try {
    return (await redis.hgetall(REGION_RELIABILITY_META_KEY)) ?? {}
  } catch {
    return {}
  }
}

