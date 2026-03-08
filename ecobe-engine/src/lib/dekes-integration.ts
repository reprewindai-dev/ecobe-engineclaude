/**
 * DEKES Integration
 *
 * Carbon-aware optimization for DEKES lead generation workloads.
 * Routes queries to lowest-carbon regions and schedules batch
 * queries for optimal time windows.
 */

import { addHours } from 'date-fns'
import { prisma } from './db'
import { routeGreen } from './green-routing'
import { assembleDecisionFrame, selectBestRegion } from './decision-data-assembler'

// kWh consumed per 1 000 result records — conservative estimate for web scraping/API queries
const KWH_PER_1K_RESULTS = 0.0001

export interface DekesQuery {
  id: string
  query: string
  estimatedResults: number
}

export interface DekesOptimizeResult {
  queryId: string
  selectedRegion: string
  carbonIntensity: number       // gCO2/kWh
  estimatedCO2: number          // gCO2eq
  estimatedKwh: number
  withinBudget: boolean
  savings?: number              // % vs worst candidate
  alternatives: Array<{
    region: string
    carbonIntensity: number
    score: number
  }>
  workloadId: string
}

export interface DekesScheduleEntry {
  queryId: string
  queryString: string
  selectedRegion: string
  scheduledTime: Date
  predictedCarbonIntensity: number
  estimatedCO2: number
  estimatedKwh: number
  savings: number               // % vs immediate execution
  workloadId: string
}

export interface DekesAnalytics {
  totalWorkloads: number
  totalCO2SavedG: number
  avgActualCO2G: number | null   // average actualCO2 (grams) per completed workload — NOT carbon intensity (gCO2/kWh)
  completedWorkloads: number
  pendingWorkloads: number
  recentWorkloads: Array<{
    id: string
    queryString: string | null
    selectedRegion: string | null
    actualCO2: number | null
    status: string
    createdAt: Date
  }>
}

/**
 * Optimize a single DEKES query — picks the lowest-carbon eligible region.
 */
export async function optimizeQuery(
  query: DekesQuery,
  carbonBudget: number | undefined,
  regions: string[]
): Promise<DekesOptimizeResult> {
  const routingResult = await routeGreen({
    preferredRegions: regions,
    carbonWeight: 0.8,
    latencyWeight: 0.1,
    costWeight: 0.1,
    maxCarbonGPerKwh: carbonBudget,
  })

  const estimatedKwh = (query.estimatedResults / 1000) * KWH_PER_1K_RESULTS
  const estimatedCO2 = estimatedKwh * routingResult.carbonIntensity

  // Worst-case intensity across alternatives (for savings calc)
  const allIntensities = [
    routingResult.carbonIntensity,
    ...routingResult.alternatives.map((a) => a.carbonIntensity),
  ]
  const maxIntensity = Math.max(...allIntensities)
  const savings =
    maxIntensity > 0
      ? ((maxIntensity - routingResult.carbonIntensity) / maxIntensity) * 100
      : 0

  const withinBudget =
    carbonBudget !== undefined ? routingResult.carbonIntensity <= carbonBudget : true

  // Persist to DB
  const workload = await prisma.dekesWorkload.create({
    data: {
      dekesQueryId: query.id,
      queryString: query.query,
      estimatedQueries: 1,
      estimatedResults: query.estimatedResults,
      carbonBudget: carbonBudget ?? null,
      selectedRegion: routingResult.selectedRegion,
      status: 'ROUTED',
    },
  })

  return {
    queryId: query.id,
    selectedRegion: routingResult.selectedRegion,
    carbonIntensity: routingResult.carbonIntensity,
    estimatedCO2,
    estimatedKwh,
    withinBudget,
    savings,
    alternatives: routingResult.alternatives,
    workloadId: workload.id,
  }
}

/**
 * Schedule a batch of DEKES queries, distributing each to the lowest-carbon
 * window within the look-ahead period.
 */
export async function scheduleBatchQueries(
  queries: DekesQuery[],
  regions: string[],
  lookAheadHours: number = 24
): Promise<DekesScheduleEntry[]> {
  // Find best routing region first (one routing call covers all regions)
  const routingResult = await routeGreen({
    preferredRegions: regions,
    carbonWeight: 0.8,
    latencyWeight: 0.1,
    costWeight: 0.1,
  })

  // Use DecisionDataAssembler to find the lowest-carbon window within the
  // look-ahead period. We scan hourly slots and pick the one whose
  // forecast window avg is lowest — this is query-time alignment: all
  // signals are aligned to the candidate targetTime, not ingestion time.
  const now = new Date()
  const lookAheadMs = lookAheadHours * 60 * 60 * 1000
  const slotCount = Math.min(lookAheadHours, 48) // cap scan at 48 slots

  let bestSlotTime: Date = addHours(now, 1)
  let bestSlotIntensity = Infinity
  let bestSlotConfidence = 0.5
  let bestFrameId = ''
  let bestRegion = routingResult.selectedRegion

  // Scan hourly slots — lazy planning means each assembleDecisionFrame call
  // only fetches the columns + time-range it needs.
  for (let h = 1; h <= slotCount; h++) {
    const slotTime = addHours(now, h)
    if (slotTime.getTime() - now.getTime() > lookAheadMs) break

    const frame = await assembleDecisionFrame({
      regions,
      targetTime: slotTime,
      durationMinutes: 60,
    })

    const best = selectBestRegion(frame, { carbonWeight: 0.8, latencyWeight: 0.2 })
    if (best.windowAvgIntensity < bestSlotIntensity) {
      bestSlotIntensity = best.windowAvgIntensity
      bestSlotTime = slotTime
      bestSlotConfidence = best.forecastConfidence
      bestFrameId = frame.frameId
      bestRegion = best.region
    }
  }

  // Savings vs immediate execution (first slot)
  const immediateFrame = await assembleDecisionFrame({
    regions,
    targetTime: addHours(now, 1),
    durationMinutes: 60,
  })
  const immediateIntensity = selectBestRegion(immediateFrame).windowAvgIntensity
  const savings = bestSlotIntensity < immediateIntensity
    ? ((immediateIntensity - bestSlotIntensity) / immediateIntensity) * 100
    : 0

  const schedule: DekesScheduleEntry[] = []

  for (const query of queries) {
    const estimatedKwh = (query.estimatedResults / 1000) * KWH_PER_1K_RESULTS
    const estimatedCO2 = estimatedKwh * bestSlotIntensity

    const workload = await prisma.dekesWorkload.create({
      data: {
        dekesQueryId: query.id,
        queryString: query.query,
        estimatedQueries: 1,
        estimatedResults: query.estimatedResults,
        scheduledTime: bestSlotTime,
        selectedRegion: bestRegion,
        status: 'SCHEDULED',
      },
    })

    schedule.push({
      queryId: query.id,
      queryString: query.query,
      selectedRegion: bestRegion,
      scheduledTime: bestSlotTime,
      predictedCarbonIntensity: bestSlotIntensity,
      estimatedCO2,
      estimatedKwh,
      savings: Math.max(0, savings),
      workloadId: workload.id,
    })
  }

  return schedule
}

/**
 * Aggregate analytics from the DekesWorkload table.
 */
export async function getDekesAnalytics(): Promise<DekesAnalytics> {
  const [totalCount, completedCount, pendingCount, recent, co2Agg] = await Promise.all([
    prisma.dekesWorkload.count(),
    prisma.dekesWorkload.count({ where: { status: 'COMPLETED' } }),
    prisma.dekesWorkload.count({ where: { status: { in: ['PENDING', 'SCHEDULED', 'ROUTED'] } } }),
    prisma.dekesWorkload.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        queryString: true,
        selectedRegion: true,
        actualCO2: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.dekesWorkload.aggregate({
      _sum: { actualCO2: true },
      _avg: { actualCO2: true },
    }),
  ])

  // Estimate savings by comparing actualCO2 of completed workloads vs what a 400 g/kWh
  // baseline would have produced for the same kWh
  const completedWorkloads = await prisma.dekesWorkload.findMany({
    where: { status: 'COMPLETED', actualCO2: { not: null } },
    select: { actualCO2: true, estimatedResults: true },
  })

  const totalCO2SavedG = completedWorkloads.reduce(
    (sum: number, w: { actualCO2: number | null; estimatedResults: number }) => {
      const baselineCO2 = (w.estimatedResults / 1000) * KWH_PER_1K_RESULTS * 400
      const actual = w.actualCO2 ?? 0
      const saved = baselineCO2 - actual
      return sum + (saved > 0 ? saved : 0)
    },
    0
  )

  return {
    totalWorkloads: totalCount,
    completedWorkloads: completedCount,
    pendingWorkloads: pendingCount,
    totalCO2SavedG,
    avgActualCO2G: co2Agg._avg.actualCO2 ?? null,
    recentWorkloads: recent,
  }
}

/**
 * Mark a DEKES workload as completed and record actual CO2 emitted.
 */
export async function reportWorkloadComplete(
  queryId: string,
  actualCO2: number
): Promise<{ updated: boolean }> {
  const result = await prisma.dekesWorkload.updateMany({
    where: { dekesQueryId: queryId, status: { notIn: ['COMPLETED'] } },
    data: { actualCO2, status: 'COMPLETED', completedAt: new Date() },
  })
  return { updated: result.count > 0 }
}
