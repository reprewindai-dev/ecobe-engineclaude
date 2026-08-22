/**
 * Recompute Region Baselines Service
 *
 * Refreshes structural carbon, latency, and renewable baselines for every
 * canonical Region row by aggregating historical signal and routing data.
 *
 * Carbon source:  CIDecision.carbonIntensity (indexed on selectedRegion, createdAt)
 * Latency source: CarbonCommandOutcome.actualLatencyMs (indexed on actualRegion, createdAt)
 *
 * Provider doctrine is NOT changed by this job — WattTime remains the live
 * fast-path primary. This job only improves structural baselines used for
 * placement ranking and audit.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export interface RecomputeOptions {
  windowDays?: number
  minCarbonSamples?: number
  minLatencySamples?: number
  useP75Latency?: boolean
}

export interface RegionBaselineResult {
  regionCode: string
  avgCarbonIntensity: number
  typicalLatencyMs: number
  renewableCapacity: number
  waterStressIndex: number | null
  carbonSampleCount: number
  latencySampleCount: number
  estimatedFlag: boolean
  syntheticFlag: boolean
  recomputeConfidence: 'HIGH' | 'MEDIUM' | 'LOW'
  recomputeNotes: string | null
}

export async function recomputeRegionBaselines(
  options: RecomputeOptions = {}
): Promise<RegionBaselineResult[]> {
  const windowDays = options.windowDays ?? 60
  const minCarbonSamples = options.minCarbonSamples ?? 96
  const minLatencySamples = options.minLatencySamples ?? 30
  const useP75Latency = options.useP75Latency ?? true

  const windowInterval = `${windowDays} days`

  const carbonRows = await prisma.$queryRaw<
    { region: string; avg_carbon: number | null; sample_count: bigint }[]
  >`
    SELECT
      "selectedRegion" AS region,
      AVG("carbonIntensity")::float AS avg_carbon,
      COUNT(*)::bigint AS sample_count
    FROM "CIDecision"
    WHERE "createdAt" >= NOW() - (${windowInterval})::interval
      AND "carbonIntensity" IS NOT NULL
    GROUP BY "selectedRegion"
  `

  const latencyRows = await prisma.$queryRaw<
    { region: string; p50_ms: number | null; p75_ms: number | null; sample_count: bigint }[]
  >`
    SELECT
      "actualRegion" AS region,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY "actualLatencyMs") AS p50_ms,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY "actualLatencyMs") AS p75_ms,
      COUNT(*)::bigint AS sample_count
    FROM "CarbonCommandOutcome"
    WHERE "createdAt" >= NOW() - (${windowInterval})::interval
      AND "actualLatencyMs" IS NOT NULL
    GROUP BY "actualRegion"
  `

  const carbonMap = new Map(carbonRows.map(r => [r.region, r]))
  const latencyMap = new Map(latencyRows.map(r => [r.region, r]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const regions: any[] = await prisma.region.findMany()
  const results: RegionBaselineResult[] = []

  for (const region of regions) {
    try {
      const carbon = carbonMap.get(region.code)
      const latency = latencyMap.get(region.code)

      const carbonSampleCount = Number(carbon?.sample_count ?? 0)
      const latencySampleCount = Number(latency?.sample_count ?? 0)

      const avgCarbonIntensity =
        carbon?.avg_carbon != null && carbonSampleCount >= minCarbonSamples
          ? Math.round(carbon.avg_carbon)
          : (region.avgCarbonIntensity as number | null) ?? 500

      const rawLatency = useP75Latency ? latency?.p75_ms : latency?.p50_ms
      const typicalLatencyMs =
        rawLatency != null && latencySampleCount >= minLatencySamples
          ? Math.round(rawLatency)
          : (region.typicalLatencyMs as number | null) ?? 100

      const renewableCapacity = (region.renewableCapacity as number | null) ?? 0
      const waterStressIndex = (region.waterStressIndex as number | null) ?? null

      const estimatedFlag =
        carbonSampleCount < minCarbonSamples || latencySampleCount < minLatencySamples

      const syntheticFlag = carbonSampleCount === 0 && latencySampleCount === 0

      const recomputeConfidence: 'HIGH' | 'MEDIUM' | 'LOW' =
        !estimatedFlag && !syntheticFlag
          ? 'HIGH'
          : carbonSampleCount > 0 || latencySampleCount > 0
          ? 'MEDIUM'
          : 'LOW'

      const recomputeNotes: string | null = syntheticFlag
        ? 'No recent carbon or latency history; using seeded structural baselines.'
        : estimatedFlag
        ? 'Partial history; one or more values derived from structural fallback.'
        : null

      results.push({
        regionCode: region.code,
        avgCarbonIntensity,
        typicalLatencyMs,
        renewableCapacity,
        waterStressIndex,
        carbonSampleCount,
        latencySampleCount,
        estimatedFlag,
        syntheticFlag,
        recomputeConfidence,
        recomputeNotes,
      })
    } catch (error) {
      console.error(`[recompute] Failed for region ${region.code}:`, error)
      results.push({
        regionCode: region.code,
        avgCarbonIntensity: (region.avgCarbonIntensity as number | null) ?? 500,
        typicalLatencyMs: (region.typicalLatencyMs as number | null) ?? 100,
        renewableCapacity: (region.renewableCapacity as number | null) ?? 0,
        waterStressIndex: (region.waterStressIndex as number | null) ?? null,
        carbonSampleCount: 0,
        latencySampleCount: 0,
        estimatedFlag: true,
        syntheticFlag: true,
        recomputeConfidence: 'LOW',
        recomputeNotes: 'Fallback to previous baseline due to recompute error.',
      })
    }
  }

  await persistResults(results, windowDays)
  return results
}

async function persistResults(results: RegionBaselineResult[], windowDays: number) {
  const now = new Date()
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any
  const chunks = chunk(results, 20)

  for (const batch of chunks) {
    await prisma.$transaction(
      async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txDb = tx as any
        for (const row of batch) {
          await txDb.region.update({
            where: { code: row.regionCode },
            data: {
              avgCarbonIntensity: row.avgCarbonIntensity,
              typicalLatencyMs: row.typicalLatencyMs,
              renewableCapacity: row.renewableCapacity,
              waterStressIndex: row.waterStressIndex,
              estimatedFlag: row.estimatedFlag,
              syntheticFlag: row.syntheticFlag,
              sampleWindowDays: windowDays,
              carbonSampleCount: row.carbonSampleCount,
              latencySampleCount: row.latencySampleCount,
              lastRecomputedAt: now,
              recomputeConfidence: row.recomputeConfidence,
              recomputeNotes: row.recomputeNotes,
            },
          })
          await txDb.regionMetricRollup.create({
            data: {
              regionCode: row.regionCode,
              windowStart,
              windowEnd: now,
              avgCarbonIntensity: row.avgCarbonIntensity,
              p50LatencyMs: null,
              p75LatencyMs: row.typicalLatencyMs,
              renewableCapacity: row.renewableCapacity,
              waterStressIndex: row.waterStressIndex,
              carbonSampleCount: row.carbonSampleCount,
              latencySampleCount: row.latencySampleCount,
              estimatedFlag: row.estimatedFlag,
              syntheticFlag: row.syntheticFlag,
            },
          })
        }
      },
      { maxWait: 10000, timeout: 30000 }
    )
  }
  void db // suppress unused var warning
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
