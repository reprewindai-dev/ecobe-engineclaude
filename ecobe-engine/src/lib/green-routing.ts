import { prisma } from './db'
import { redis } from './redis'
import { electricityMaps } from './electricity-maps'
import { providerRouter } from './carbon/provider-router'
import { GridSignalCache } from './grid-signals/grid-signal-cache'
import { wattTime } from './watttime'
import { randomUUID } from 'crypto'

export interface RoutingRequest {
  preferredRegions: string[]
  maxCarbonGPerKwh?: number
  latencyMsByRegion?: Record<string, number>
  costWeight?: number  // 0-1, default 0.3
  carbonWeight?: number  // 0-1, default 0.5
  latencyWeight?: number  // 0-1, default 0.2
}

export interface RoutingResult {
  selectedRegion: string
  carbonIntensity: number
  estimatedLatency?: number
  score: number
  qualityTier: 'high' | 'medium' | 'low'
  carbon_delta_g_per_kwh: number | null
  forecast_stability: 'stable' | 'medium' | 'unstable' | null
  provider_disagreement: { flag: boolean; pct: number | null }
  balancingAuthority: string | null
  demandRampPct: number | null
  carbonSpikeProbability: number | null
  curtailmentProbability: number | null
  importCarbonLeakageScore: number | null
  source_used: string | null
  validation_source: string | null
  fallback_used: boolean | null
  estimatedFlag: boolean | null
  syntheticFlag: boolean | null
  predicted_clean_window: object | null
  decisionFrameId: string | null
  alternatives: Array<{
    region: string
    carbonIntensity: number
    score: number
    reason?: string
  }>
  // Keep existing lease fields
  lease_id?: string
  lease_expires_at?: string
  must_revalidate_after?: string
  explanation?: string
  forecastAvailable?: boolean
  confidenceBand?: { low: number; mid: number; high: number; empirical: boolean }
  dataResolutionMinutes?: number
}

export async function routeGreen(request: RoutingRequest): Promise<RoutingResult> {
  const {
    preferredRegions,
    maxCarbonGPerKwh,
    latencyMsByRegion = {},
    carbonWeight = 0.5,
    latencyWeight = 0.2,
    costWeight = 0.3,
  } = request

  // Normalize weights
  const totalWeight = carbonWeight + latencyWeight + costWeight
  const normalizedCarbon = carbonWeight / totalWeight
  const normalizedLatency = latencyWeight / totalWeight
  const normalizedCost = costWeight / totalWeight

  // Get routing signals for all regions from ProviderRouter
  const regionSignals = new Map<string, any>()
  const regionData = await Promise.all(
    preferredRegions.map(async (region) => {
      try {
        // Get routing signal from provider router (uses WattTime + Electricity Maps)
        const signal = await providerRouter.getRoutingSignal(region, new Date())
        regionSignals.set(region, signal)

        return {
          region,
          carbonIntensity: signal.carbonIntensity,
          latency: latencyMsByRegion[region] ?? 100,
          signal,
        }
      } catch (error) {
        console.error(`Failed to get routing signal for ${region}:`, error)
        // Fallback to electricity maps
        const cached = await redis.get(`carbon:${region}`)
        let carbonIntensity: number

        if (cached) {
          carbonIntensity = parseInt(cached)
        } else {
          const data = await electricityMaps.getCarbonIntensity(region)
          carbonIntensity = data?.carbonIntensity ?? 400

          // Cache for 15 minutes
          await redis.setex(`carbon:${region}`, 900, carbonIntensity.toString())

          // Store in DB
          await prisma.carbonIntensity.create({
            data: {
              region,
              carbonIntensity,
              timestamp: new Date(),
              source: 'ELECTRICITY_MAPS',
            },
          }).catch(() => {}) // Ignore duplicates
        }

        return {
          region,
          carbonIntensity,
          latency: latencyMsByRegion[region] ?? 100,
          signal: null,
        }
      }
    })
  )

  // Filter by max carbon if specified
  const filtered = maxCarbonGPerKwh
    ? regionData.filter((r) => r.carbonIntensity <= maxCarbonGPerKwh)
    : regionData

  if (filtered.length === 0) {
    // All regions exceed carbon budget - pick lowest carbon anyway
    const sorted = [...regionData].sort((a, b) => a.carbonIntensity - b.carbonIntensity)
    const best = sorted[0]

    return {
      selectedRegion: best.region,
      carbonIntensity: best.carbonIntensity,
      estimatedLatency: best.latency,
      score: 0,
      qualityTier: 'low',
      carbon_delta_g_per_kwh: null,
      forecast_stability: null,
      provider_disagreement: { flag: false, pct: null },
      balancingAuthority: null,
      demandRampPct: null,
      carbonSpikeProbability: null,
      curtailmentProbability: null,
      importCarbonLeakageScore: null,
      source_used: null,
      validation_source: null,
      fallback_used: null,
      estimatedFlag: null,
      syntheticFlag: null,
      predicted_clean_window: null,
      decisionFrameId: randomUUID(),
      alternatives: sorted.slice(1, 3).map((r) => ({
        region: r.region,
        carbonIntensity: r.carbonIntensity,
        score: 0,
        reason: `Exceeds carbon budget (${maxCarbonGPerKwh} gCO2/kWh)`,
      })),
    }
  }

  // Score each region
  const scored = filtered.map((r) => {
    // Carbon score (lower is better, normalize to 0-1)
    const maxCarbon = Math.max(...filtered.map((x) => x.carbonIntensity))
    const carbonScore = 1 - r.carbonIntensity / maxCarbon

    // Latency score (lower is better, normalize to 0-1)
    const maxLatency = Math.max(...filtered.map((x) => x.latency))
    const latencyScore = 1 - r.latency / maxLatency

    // Cost score (assume cost proportional to carbon for now)
    const costScore = carbonScore

    // Overall score
    const score =
      normalizedCarbon * carbonScore +
      normalizedLatency * latencyScore +
      normalizedCost * costScore

    return {
      ...r,
      score,
      carbonScore,
      latencyScore,
      costScore,
    }
  })

  // Sort by score (highest first)
  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]
  const bestSignal = regionSignals.get(best.region)

  // Get grid snapshot for best region
  const gridSnapshot = await getLatestGridSnapshot(best.region)

  // Get predicted clean window for best region
  const cleanWindows = await getCleanWindowSafe(best.region)

  // Calculate worst intensity for delta
  const worstIntensity = Math.max(...scored.map(r => r.carbonIntensity))

  // Determine quality tier
  const qualityTier = bestSignal?.confidence >= 0.8 ? 'high' : bestSignal?.confidence >= 0.5 ? 'medium' : 'low'

  // Derive forecast stability
  const forecastStability = bestSignal ? deriveStability(bestSignal.confidence) : null

  return {
    selectedRegion: best.region,
    carbonIntensity: best.carbonIntensity,
    estimatedLatency: best.latency,
    score: best.score,
    qualityTier: qualityTier as 'high' | 'medium' | 'low',
    carbon_delta_g_per_kwh: scored.length > 1 ? worstIntensity - best.carbonIntensity : null,
    forecast_stability: forecastStability,
    provider_disagreement: bestSignal ? {
      flag: bestSignal.provenance.disagreementFlag,
      pct: bestSignal.provenance.disagreementPct
    } : { flag: false, pct: null },
    balancingAuthority: gridSnapshot?.balancingAuthority ?? null,
    demandRampPct: gridSnapshot?.demandChangePct ?? null,
    carbonSpikeProbability: gridSnapshot?.carbonSpikeProbability ?? null,
    curtailmentProbability: gridSnapshot?.curtailmentProbability ?? null,
    importCarbonLeakageScore: gridSnapshot?.importCarbonLeakageScore ?? null,
    source_used: bestSignal?.provenance.sourceUsed ?? null,
    validation_source: bestSignal?.provenance.contributingSources.length ?? 0 > 1 ? 'ember' : null,
    fallback_used: bestSignal?.provenance.fallbackUsed ?? null,
    estimatedFlag: bestSignal?.isForecast ?? null,
    syntheticFlag: bestSignal?.source === 'fallback' ?? null,
    predicted_clean_window: cleanWindows?.[0] ?? null,
    decisionFrameId: randomUUID(),
    alternatives: scored.slice(1, 3).map((r) => ({
      region: r.region,
      carbonIntensity: r.carbonIntensity,
      score: r.score,
    })),
  }
}

// Helper functions
async function getLatestGridSnapshot(region: string) {
  try {
    const cached = await GridSignalCache.getCachedSnapshots(region)
    return cached?.[0] ?? null
  } catch {
    return null
  }
}

async function getCleanWindowSafe(region: string) {
  try {
    return await wattTime.getPredictedCleanWindows(region)
  } catch {
    return null
  }
}

function deriveStability(confidence: number): 'stable' | 'medium' | 'unstable' {
  if (confidence >= 0.8) return 'stable'
  if (confidence >= 0.5) return 'medium'
  return 'unstable'
}
