import { prisma } from './db'
import { getBestCarbonSignal } from './carbon/provider-router'
import { assembleDecisionFrame, selectBestRegion } from './decision-data-assembler'

export interface RoutingRequest {
  preferredRegions: string[]
  maxCarbonGPerKwh?: number
  latencyMsByRegion?: Record<string, number>
  costWeight?: number    // 0-1, default 0.3
  carbonWeight?: number  // 0-1, default 0.5
  latencyWeight?: number // 0-1, default 0.2
  /**
   * When the workload is scheduled to run (defaults to now).
   * When set to a future time, routing uses DecisionDataAssembler's
   * forecast-based path (query-time alignment, lazy query planning)
   * instead of the live Redis/Electricity Maps path.
   */
  targetTime?: Date
  /** Expected workload duration in minutes — used by forecast-based path */
  durationMinutes?: number
}

export interface RoutingResult {
  selectedRegion: string
  carbonIntensity: number
  estimatedLatency?: number
  score: number
  alternatives: Array<{
    region: string
    carbonIntensity: number
    score: number
    reason?: string
  }>
  /** Present when the forecast-based assembler path was used */
  decisionFrameId?: string
  forecastAvailable?: boolean
}

export async function routeGreen(request: RoutingRequest): Promise<RoutingResult> {
  const {
    preferredRegions,
    maxCarbonGPerKwh,
    latencyMsByRegion = {},
    carbonWeight = 0.5,
    latencyWeight = 0.2,
    costWeight = 0.3,
    targetTime,
    durationMinutes,
  } = request

  // ── FORECAST PATH (future targetTime) ───────────────────────────────────────
  // When the caller supplies a targetTime in the future (scheduled workloads,
  // DEKES jobs, CI pipelines), use DecisionDataAssembler to align all inputs to
  // that window with lazy query planning + query-time resolution alignment.
  const now = new Date()
  const isFuture = targetTime && targetTime.getTime() > now.getTime() + 60_000 // >1 min ahead

  if (isFuture && targetTime) {
    const frame = await assembleDecisionFrame({
      regions: preferredRegions,
      targetTime,
      durationMinutes: durationMinutes ?? 60,
      latencyMsByRegion,
    })

    const best = selectBestRegion(frame, {
      maxCarbonGPerKwh,
      carbonWeight,
      latencyWeight,
    })

    const others = frame.regions.filter((r) => r.region !== best.region)
    return {
      selectedRegion: best.region,
      carbonIntensity: best.targetCarbonIntensity,
      estimatedLatency: best.latencyMs,
      score: best.forecastConfidence,
      decisionFrameId: frame.frameId,
      forecastAvailable: best.forecastAvailable,
      alternatives: others.slice(0, 2).map((r) => ({
        region: r.region,
        carbonIntensity: r.targetCarbonIntensity,
        score: r.forecastConfidence,
        reason: best.forecastAvailable
          ? `Forecast window avg: ${r.windowAvgIntensity} gCO2/kWh`
          : 'Historical fallback used',
      })),
    }
  }

  // ── LIVE PATH (immediate execution) ─────────────────────────────────────────
  // Normalize weights
  const totalWeight = carbonWeight + latencyWeight + costWeight
  const normalizedCarbon = carbonWeight / totalWeight
  const normalizedLatency = latencyWeight / totalWeight
  const normalizedCost = costWeight / totalWeight

  // Get current carbon intensity via multi-provider router (handles cache, fallback, validation)
  const regionData = await Promise.all(
    preferredRegions.map(async (region) => {
      const result = await getBestCarbonSignal(region, 'realtime')
      const carbonIntensity = result.ok && result.signal
        ? result.signal.intensity_gco2_per_kwh
        : 400 // hard fallback if all providers fail

      // Persist to CarbonIntensity history table at native resolution
      await prisma.carbonIntensity.create({
        data: {
          region,
          carbonIntensity,
          timestamp: new Date(),
          source: result.signal?.source?.toUpperCase() ?? 'UNKNOWN',
          resolutionMinutes: 60,
        },
      }).catch((err: any) => {
        if (err?.code !== 'P2002') {
          console.error('[green-routing] carbonIntensity DB write failed:', err?.message ?? err)
        }
      })

      return {
        region,
        carbonIntensity,
        latency: latencyMsByRegion[region] ?? 100,
        providerSignal: result.signal,
      }
    })
  )

  // Filter by max carbon if specified
  const filtered = maxCarbonGPerKwh
    ? regionData.filter((r) => r.carbonIntensity <= maxCarbonGPerKwh)
    : regionData

  if (filtered.length === 0) {
    const sorted = [...regionData].sort((a, b) => a.carbonIntensity - b.carbonIntensity)
    const best = sorted[0]
    return {
      selectedRegion: best.region,
      carbonIntensity: best.carbonIntensity,
      estimatedLatency: best.latency,
      score: 0,
      alternatives: sorted.slice(1, 3).map((r) => ({
        region: r.region,
        carbonIntensity: r.carbonIntensity,
        score: 0,
        reason: `Exceeds carbon budget (${maxCarbonGPerKwh} gCO2/kWh)`,
      })),
    }
  }

  const scored = filtered.map((r) => {
    const maxCarbon = Math.max(...filtered.map((x) => x.carbonIntensity))
    const carbonScore = 1 - r.carbonIntensity / maxCarbon

    const maxLatency = Math.max(...filtered.map((x) => x.latency))
    const latencyScore = 1 - r.latency / maxLatency

    const costScore = carbonScore // cost ∝ carbon for now

    const score =
      normalizedCarbon * carbonScore +
      normalizedLatency * latencyScore +
      normalizedCost * costScore

    return { ...r, score, carbonScore, latencyScore, costScore }
  })

  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]

  return {
    selectedRegion: best.region,
    carbonIntensity: best.carbonIntensity,
    estimatedLatency: best.latency,
    score: best.score,
    alternatives: scored.slice(1, 3).map((r) => ({
      region: r.region,
      carbonIntensity: r.carbonIntensity,
      score: r.score,
    })),
  }
}
