import { PrismaClient, Prisma } from '@prisma/client'
import { addDays } from 'date-fns'

type ImpactWindowKey = '24h' | '7d' | '30d'

const impactWindowDays: Record<ImpactWindowKey, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
}

const IMPACT_STALE_SECONDS = 60 * 60
const CI_INTENSITY_MAX = 10000
const CI_SAVINGS_MIN = -100
const CI_SAVINGS_MAX = 100

type ImpactDecisionRow = {
  createdAt: Date
  baselineRegion: string
  chosenRegion: string
  co2BaselineG: number | null
  co2ChosenG: number | null
  fallbackUsed: boolean
  dataFreshnessSeconds: number | null
  disagreementFlag: boolean | null
  estimatedFlag: boolean | null
  syntheticFlag: boolean | null
  requestCount: number
  meta: Prisma.JsonValue
}

type ImpactCiDecisionRow = {
  createdAt: Date
  selectedRegion: string
  carbonIntensity: number
  baseline: number
  savings: number
  decisionAction: string | null
  fallbackUsed: boolean
  signalConfidence: number | null
  reasonCode: string | null
  waterImpactLiters: number | null
  waterBaselineLiters: number | null
  waterScarcityImpact: number | null
  waterStressIndex: number | null
  waterConfidence: number | null
  waterAuthorityMode: string | null
}

const percentile = (sorted: number[], p: number): number | null => {
  if (sorted.length === 0) return null
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo] ?? null
  const loVal = sorted[lo]
  const hiVal = sorted[hi]
  if (loVal === undefined || hiVal === undefined) return null
  const frac = idx - lo
  return loVal + (hiVal - loVal) * frac
}

const safeAvg = (values: number[]): number | null => {
  if (values.length === 0) return null
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length
  return Number(avg.toFixed(2))
}

const rate = (numerator: number, denominator: number): number => {
  if (!denominator) return 0
  return Number((numerator / denominator).toFixed(4))
}

const normalizeDecisionAction = (value: string) => {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'run' || normalized === 'run_now' || normalized === 'runnow') return 'run_now'
  if (normalized === 'delay' || normalized === 'delayed') return 'delay'
  if (normalized === 'deny' || normalized === 'blocked' || normalized === 'block') return 'deny'
  return normalized
}

const getMetaValue = (meta: Prisma.JsonValue, path: string[]): unknown => {
  let cursor: unknown = meta
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object') return undefined
    if (Array.isArray(cursor)) return undefined
    cursor = (cursor as Record<string, unknown>)[key]
  }
  return cursor
}

const extractDecisionAction = (meta: Prisma.JsonValue): string | null => {
  if (!meta || typeof meta !== 'object') return null
  const paths = [
    ['decision'],
    ['action'],
    ['decisionAction'],
    ['decisionPath', 'action'],
    ['decisionEnvelope', 'action'],
    ['workflowOutputs', 'decision'],
    ['replayedResponse', 'decision'],
    ['replay', 'decision'],
    ['selected', 'decision'],
  ]
  for (const path of paths) {
    const value = getMetaValue(meta, path)
    if (typeof value === 'string' && value.trim()) {
      return normalizeDecisionAction(value)
    }
  }
  return null
}

const summarizeImpactWindow = (rows: ImpactDecisionRow[], windowStart: Date, windowEnd: Date) => {
  const totals = {
    decisionCount: rows.length,
    requestCount: rows.reduce((sum, row) => sum + (row.requestCount || 0), 0),
    rerouteCount: 0,
    fallbackCount: 0,
    staleCount: 0,
    disagreementCount: 0,
    estimatedCount: 0,
    syntheticCount: 0,
    missingCo2Count: 0,
    co2BaselineG: 0,
    co2ChosenG: 0,
    co2SavingsG: 0,
    co2SavingsGrossG: 0,
    co2IncreaseCount: 0,
  }

  const actionCounts: Record<string, number> = {}
  const freshnessValues: number[] = []
  const chosenRegionCounts = new Map<string, number>()
  const rerouteCounts = new Map<string, number>()

  rows.forEach((row) => {
    const requests = row.requestCount || 0
    if (row.baselineRegion !== row.chosenRegion) {
      totals.rerouteCount += requests
      const key = `${row.baselineRegion} -> ${row.chosenRegion}`
      rerouteCounts.set(key, (rerouteCounts.get(key) ?? 0) + requests)
    }
    chosenRegionCounts.set(row.chosenRegion, (chosenRegionCounts.get(row.chosenRegion) ?? 0) + requests)

    if (row.fallbackUsed) totals.fallbackCount += requests
    if (row.dataFreshnessSeconds !== null && row.dataFreshnessSeconds >= IMPACT_STALE_SECONDS) {
      totals.staleCount += requests
    }
    if (row.dataFreshnessSeconds !== null && Number.isFinite(row.dataFreshnessSeconds)) {
      freshnessValues.push(row.dataFreshnessSeconds)
    }
    if (row.disagreementFlag) totals.disagreementCount += requests
    if (row.estimatedFlag) totals.estimatedCount += requests
    if (row.syntheticFlag) totals.syntheticCount += requests

    if (row.co2BaselineG === null || row.co2ChosenG === null) {
      totals.missingCo2Count += requests
    } else {
      totals.co2BaselineG += row.co2BaselineG
      totals.co2ChosenG += row.co2ChosenG
      const delta = row.co2BaselineG - row.co2ChosenG
      totals.co2SavingsG += delta
      if (delta > 0) {
        totals.co2SavingsGrossG += delta
      } else if (delta < 0) {
        totals.co2IncreaseCount += requests
      }
    }

    const action = extractDecisionAction(row.meta)
    if (action) {
      actionCounts[action] = (actionCounts[action] ?? 0) + requests
    } else {
      actionCounts.unknown = (actionCounts.unknown ?? 0) + requests
    }
  })

  const freshnessSorted = freshnessValues.sort((a, b) => a - b)
  const freshnessP50 = percentile(freshnessSorted, 0.5)
  const freshnessP95 = percentile(freshnessSorted, 0.95)
  const freshnessP99 = percentile(freshnessSorted, 0.99)

  const topChosenRegions = Array.from(chosenRegionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([region, count]) => ({ region, count }))

  const topReroutes = Array.from(rerouteCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([route, count]) => ({ route, count }))

  const requestCount = totals.requestCount
  const rates = {
    rerouteRate: rate(totals.rerouteCount, requestCount),
    fallbackRate: rate(totals.fallbackCount, requestCount),
    staleRate: rate(totals.staleCount, requestCount),
    disagreementRate: rate(totals.disagreementCount, requestCount),
    estimatedRate: rate(totals.estimatedCount, requestCount),
    syntheticRate: rate(totals.syntheticCount, requestCount),
    missingCo2Rate: rate(totals.missingCo2Count, requestCount),
  }

  const co2BaselineKg = totals.co2BaselineG / 1000
  const co2ChosenKg = totals.co2ChosenG / 1000
  const netSavingsKg = totals.co2SavingsG / 1000
  const grossSavingsKg = totals.co2SavingsGrossG / 1000
  const savingsRatePct =
    totals.co2BaselineG > 0
      ? Number(((totals.co2SavingsG / totals.co2BaselineG) * 100).toFixed(2))
      : 0

  return {
    source: 'routing',
    window: {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
    },
    totals,
    rates,
    freshness: {
      p50Sec: freshnessP50,
      p95Sec: freshnessP95,
      p99Sec: freshnessP99,
    },
    co2: {
      baselineKg: Number(co2BaselineKg.toFixed(3)),
      chosenKg: Number(co2ChosenKg.toFixed(3)),
      netSavingsKg: Number(netSavingsKg.toFixed(3)),
      grossSavingsKg: Number(grossSavingsKg.toFixed(3)),
      savingsRatePct,
      increaseEventCount: totals.co2IncreaseCount,
    },
    actions: actionCounts,
    regions: {
      topChosen: topChosenRegions,
      topReroutes,
    },
  }
}

const summarizeCiImpactWindow = (rows: ImpactCiDecisionRow[], windowStart: Date, windowEnd: Date) => {
  const totals = {
    decisionCount: rows.length,
    requestCount: rows.length,
    fallbackCount: 0,
    lowConfidenceCount: 0,
  }

  const actionCounts: Record<string, number> = {}
  const chosenRegionCounts = new Map<string, number>()
  const baselineIntensities: number[] = []
  const chosenIntensities: number[] = []
  const savingsPctValues: number[] = []
  let baselineOutliers = 0
  let chosenOutliers = 0
  let savingsOutliers = 0
  const waterImpactValues: number[] = []
  const waterStressValues: number[] = []
  const waterConfidenceValues: number[] = []

  rows.forEach((row) => {
    chosenRegionCounts.set(row.selectedRegion, (chosenRegionCounts.get(row.selectedRegion) ?? 0) + 1)
    if (row.fallbackUsed) totals.fallbackCount += 1
    if (typeof row.signalConfidence === 'number' && row.signalConfidence < 0.6) {
      totals.lowConfidenceCount += 1
    }

    const action = row.decisionAction ? normalizeDecisionAction(row.decisionAction) : 'unknown'
    actionCounts[action] = (actionCounts[action] ?? 0) + 1

    if (Number.isFinite(row.baseline)) {
      if (row.baseline >= 0 && row.baseline <= CI_INTENSITY_MAX) {
        baselineIntensities.push(row.baseline)
      } else {
        baselineOutliers += 1
      }
    }
    if (Number.isFinite(row.carbonIntensity)) {
      if (row.carbonIntensity >= 0 && row.carbonIntensity <= CI_INTENSITY_MAX) {
        chosenIntensities.push(row.carbonIntensity)
      } else {
        chosenOutliers += 1
      }
    }
    if (Number.isFinite(row.savings)) {
      if (row.savings >= CI_SAVINGS_MIN && row.savings <= CI_SAVINGS_MAX) {
        savingsPctValues.push(row.savings)
      } else {
        savingsOutliers += 1
      }
    }

    if (Number.isFinite(row.waterImpactLiters ?? NaN) && row.waterImpactLiters !== null) {
      waterImpactValues.push(row.waterImpactLiters)
    }
    if (Number.isFinite(row.waterStressIndex ?? NaN) && row.waterStressIndex !== null) {
      waterStressValues.push(row.waterStressIndex)
    }
    if (Number.isFinite(row.waterConfidence ?? NaN) && row.waterConfidence !== null) {
      waterConfidenceValues.push(row.waterConfidence)
    }
  })

  const topChosenRegions = Array.from(chosenRegionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([region, count]) => ({ region, count }))

  const avgBaselineIntensity = safeAvg(baselineIntensities)
  const avgChosenIntensity = safeAvg(chosenIntensities)
  const avgSavingsPct = safeAvg(savingsPctValues)
  const avgIntensityDelta =
    avgBaselineIntensity !== null && avgChosenIntensity !== null
      ? Number((avgBaselineIntensity - avgChosenIntensity).toFixed(2))
      : null

  const requestCount = totals.requestCount

  return {
    source: 'ci',
    window: {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
    },
    totals,
    rates: {
      fallbackRate: rate(totals.fallbackCount, requestCount),
      lowConfidenceRate: rate(totals.lowConfidenceCount, requestCount),
      delayRate: rate(actionCounts.delay ?? 0, requestCount),
      denyRate: rate(actionCounts.deny ?? 0, requestCount),
      runNowRate: rate(actionCounts.run_now ?? 0, requestCount),
    },
    carbonIntensity: {
      avgBaseline: avgBaselineIntensity,
      avgChosen: avgChosenIntensity,
      avgDelta: avgIntensityDelta,
      avgSavingsPct,
      baselineSampleCount: baselineIntensities.length,
      chosenSampleCount: chosenIntensities.length,
      savingsSampleCount: savingsPctValues.length,
      baselineOutlierCount: baselineOutliers,
      chosenOutlierCount: chosenOutliers,
      savingsOutlierCount: savingsOutliers,
    },
    water: {
      avgImpactLiters: safeAvg(waterImpactValues),
      avgStressIndex: safeAvg(waterStressValues),
      avgConfidence: safeAvg(waterConfidenceValues),
    },
    actions: actionCounts,
    regions: {
      topChosen: topChosenRegions,
    },
  }
}

const scoreImpactWindow = (summary: ReturnType<typeof summarizeImpactWindow>) => {
  const { rates, totals } = summary
  const volumeFactor = Math.min(1, totals.decisionCount / 1000)
  const score =
    1 -
    rates.fallbackRate * 0.4 -
    rates.disagreementRate * 0.3 -
    rates.missingCo2Rate * 0.2 -
    rates.staleRate * 0.1
  return Number(Math.max(0, Math.min(1, score * (0.7 + 0.3 * volumeFactor))).toFixed(4))
}

const scoreCiImpactWindow = (summary: ReturnType<typeof summarizeCiImpactWindow>) => {
  const { rates, totals } = summary
  const volumeFactor = Math.min(1, totals.decisionCount / 2000)
  const score = 1 - rates.fallbackRate * 0.4 - rates.lowConfidenceRate * 0.4 - rates.denyRate * 0.2
  return Number(Math.max(0, Math.min(1, score * (0.7 + 0.3 * volumeFactor))).toFixed(4))
}

const prisma = new PrismaClient()

const main = async () => {
  const now = new Date()
  const maxWindowStart = addDays(now, -impactWindowDays['30d'])

  const [routingDecisions, ciDecisions] = await Promise.all([
    prisma.dashboardRoutingDecision.findMany({
      where: { createdAt: { gte: maxWindowStart } },
      select: {
        createdAt: true,
        baselineRegion: true,
        chosenRegion: true,
        co2BaselineG: true,
        co2ChosenG: true,
        fallbackUsed: true,
        dataFreshnessSeconds: true,
        disagreementFlag: true,
        estimatedFlag: true,
        syntheticFlag: true,
        requestCount: true,
        meta: true,
      },
      orderBy: { createdAt: 'asc' },
    }) as Promise<ImpactDecisionRow[]>,
    prisma.cIDecision.findMany({
      where: { createdAt: { gte: maxWindowStart } },
      select: {
        createdAt: true,
        selectedRegion: true,
        carbonIntensity: true,
        baseline: true,
        savings: true,
        decisionAction: true,
        fallbackUsed: true,
        signalConfidence: true,
        reasonCode: true,
        waterImpactLiters: true,
        waterBaselineLiters: true,
        waterScarcityImpact: true,
        waterStressIndex: true,
        waterConfidence: true,
        waterAuthorityMode: true,
      },
      orderBy: { createdAt: 'asc' },
    }) as Promise<ImpactCiDecisionRow[]>,
  ])

  if (routingDecisions.length === 0 && ciDecisions.length === 0) {
    console.log(JSON.stringify({ ok: true, message: 'No decision data in the last 30 days.' }, null, 2))
    return
  }

  const ciCandidates = (['24h', '7d', '30d'] as ImpactWindowKey[]).map((key) => {
    const start = addDays(now, -impactWindowDays[key])
    const rows = ciDecisions.filter((row) => row.createdAt >= start)
    const summary = summarizeCiImpactWindow(rows, start, now)
    const score = scoreCiImpactWindow(summary)
    return { key, start, end: now, summary, score }
  })

  const routingCandidates = (['24h', '7d', '30d'] as ImpactWindowKey[]).map((key) => {
    const start = addDays(now, -impactWindowDays[key])
    const rows = routingDecisions.filter((row) => row.createdAt >= start)
    const summary = summarizeImpactWindow(rows, start, now)
    const score = scoreImpactWindow(summary)
    return { key, start, end: now, summary, score }
  })

  const minSamples = 50
  const hasCiRecent = ciCandidates.some((c) => c.summary.totals.decisionCount >= minSamples)
  const hasRoutingRecent = routingCandidates.some((c) => c.summary.totals.decisionCount >= minSamples)

  const dataset = hasCiRecent || !hasRoutingRecent ? 'ci' : 'routing'
  const candidates = dataset === 'ci' ? ciCandidates : routingCandidates
  const candidatesByKey = new Map(candidates.map((c) => [c.key, c]))
  const eligible = candidates.filter((c) => c.summary.totals.decisionCount >= minSamples)

  let selected = candidatesByKey.get('24h')!
  let selectionReason = 'Selected the most recent 24h window.'

  if (eligible.length > 0) {
    selected = eligible.reduce((best, current) => (current.score > best.score ? current : best))
    selectionReason = `Selected the highest-quality eligible window (${selected.key}).`
  } else {
    selected = candidates.reduce((best, current) =>
      current.summary.totals.decisionCount > best.summary.totals.decisionCount ? current : best
    )
    selectionReason = 'Selected the window with the most samples due to low volume.'
  }

  const output = {
    ok: true,
    selection: {
      reason: selectionReason,
      minSamples,
      source: dataset,
      candidates: candidates.map((candidate) => ({
        window: candidate.key,
        score: candidate.score,
        decisionCount: candidate.summary.totals.decisionCount,
        requestCount: candidate.summary.totals.requestCount,
        start: candidate.start.toISOString(),
        end: candidate.end.toISOString(),
      })),
    },
    summary: selected.summary,
  }

  console.log(JSON.stringify(output, null, 2))
}

main()
  .catch((error) => {
    console.error('Impact report script failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
