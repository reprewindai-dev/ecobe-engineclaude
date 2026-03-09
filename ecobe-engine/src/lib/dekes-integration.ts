/**
 * DEKES Integration
 *
 * Carbon-aware optimization for DEKES lead generation workloads.
 * Routes queries to lowest-carbon regions and schedules batch
 * queries for optimal time windows.
 */

import { addHours, addMinutes } from 'date-fns'
import { prisma } from './db'
import { routeGreen } from './green-routing'
import { getForecastSignals } from './carbon/provider-router'
import { CarbonSignal } from './carbon/types'

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
  /** Human-readable explanation of why this slot/region was chosen */
  explanation: string
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
 *
 * Performance model (bounded, single-pass):
 *   1. Fetch forecast signals for ALL regions for the FULL window — ONE API call per region.
 *   2. Fetch recent historical readings — ONE DB query covering all regions.
 *   3. Scan up to 48 hourly slots entirely in-memory — zero additional I/O.
 *
 * This replaces the previous implementation which called assembleDecisionFrame
 * 48+ times sequentially, causing 48 DB queries and 48×N API calls.
 */
export async function scheduleBatchQueries(
  queries: DekesQuery[],
  regions: string[],
  lookAheadHours: number = 24
): Promise<DekesScheduleEntry[]> {
  const now = new Date()
  const slotCount = Math.min(lookAheadHours, 48) // hard cap at 48 slots
  const windowEnd = addHours(now, slotCount + 1)

  // ── 1. Fetch all forecast signals for all regions in one pass ─────────────
  // Each region makes ONE provider call that returns the full forecast window.
  // The slot scan below filters this in-memory — no additional API calls.
  const allSignalsByRegion = new Map<string, CarbonSignal[]>()
  await Promise.all(
    regions.map(async (region) => {
      const signals = await getForecastSignals(region, addHours(now, 1), windowEnd)
      allSignalsByRegion.set(region, signals)
      if (signals.length === 0) {
        console.warn(`[dekes] No forecast signals for region ${region} — will use historical fallback`)
      }
    })
  )

  // ── 2. Fetch historical baseline once — fallback when forecasts are absent ─
  const historyRows = await (prisma as any).carbonIntensity.findMany({
    where: { region: { in: regions } },
    select: { region: true, carbonIntensity: true, timestamp: true },
    orderBy: { timestamp: 'desc' },
    take: regions.length * 5,
  }) as Array<{ region: string; carbonIntensity: number; timestamp: Date }>

  const historyByRegion = new Map<string, number>()
  for (const row of historyRows) {
    if (!historyByRegion.has(row.region)) {
      historyByRegion.set(row.region, row.carbonIntensity)
    }
  }

  // ── 3. Scan slots in-memory — no I/O ─────────────────────────────────────
  // For each hourly slot, compute the avg intensity for each region across
  // the 60-minute window, then pick the globally best region × slot pair.
  function avgIntensityForSlot(region: string, slotStart: Date): number {
    const slotEnd = addMinutes(slotStart, 60)
    const startIso = slotStart.toISOString()
    const endIso = slotEnd.toISOString()
    const signals = allSignalsByRegion.get(region) ?? []
    const inWindow = signals.filter((s) => {
      const t = s.forecast_time ?? s.observed_time ?? ''
      return t >= startIso && t <= endIso
    })
    if (inWindow.length === 0) return historyByRegion.get(region) ?? 400
    return inWindow.reduce((sum, s) => sum + s.intensity_gco2_per_kwh, 0) / inWindow.length
  }

  let bestSlotTime: Date = addHours(now, 1)
  let bestSlotIntensity: number = Infinity
  let bestRegion: string = regions[0]

  for (let h = 1; h <= slotCount; h++) {
    const slotTime = addHours(now, h)
    for (const region of regions) {
      const avg = avgIntensityForSlot(region, slotTime)
      if (avg < bestSlotIntensity) {
        bestSlotIntensity = avg
        bestSlotTime = slotTime
        bestRegion = region
      }
    }
  }

  // Savings vs immediate execution (h=1, best region at that slot)
  const immediateIntensity = Math.min(...regions.map((r) => avgIntensityForSlot(r, addHours(now, 1))))
  const savings = bestSlotIntensity < immediateIntensity && immediateIntensity > 0
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

    const startLabel = bestSlotTime.toISOString().slice(11, 16) + ' UTC'
    const reductionLabel = savings > 0 ? ` — ${Math.round(savings)}% vs immediate execution` : ''
    const explanation =
      `${bestRegion} scheduled at ${startLabel}: predicted ${Math.round(bestSlotIntensity)} gCO2/kWh` +
      reductionLabel +
      `. Estimated ${(estimatedKwh * 1000).toFixed(3)} Wh / ${(estimatedCO2 * 1000).toFixed(1)} mgCO2 for "${query.query}".`

    schedule.push({
      queryId: query.id,
      queryString: query.query,
      selectedRegion: bestRegion,
      scheduledTime: bestSlotTime,
      predictedCarbonIntensity: Math.round(bestSlotIntensity),
      estimatedCO2,
      estimatedKwh,
      savings: Math.max(0, savings),
      workloadId: workload.id,
      explanation,
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
