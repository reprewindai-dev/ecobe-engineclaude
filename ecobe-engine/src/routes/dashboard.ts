import { Router } from 'express'
import { z } from 'zod'
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  addDays,
  addWeeks,
  addMonths,
  formatISO,
} from 'date-fns'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/db'
import { electricityMaps } from '../lib/electricity-maps'
import { getIntegrationMetric, computeIntegrationSuccessRate } from '../lib/integration-metrics'
import { getForecastRefreshSummary, getLastForecastRefreshState } from '../lib/forecast-refresh'

const router = Router()

type AccuracyRange = '7d' | '30d' | '90d' | 'custom'
type AccuracyGroupBy = 'day' | 'week' | 'month'

const rangeToDurationDays: Record<Exclude<AccuracyRange, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

const resolveAccuracyRange = (
  range: AccuracyRange,
  startDate?: string,
  endDate?: string
): { start: Date; end: Date } => {
  if (range === 'custom') {
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required for custom range')
    }
    return { start: new Date(startDate), end: new Date(endDate) }
  }
  const days = rangeToDurationDays[range]
  const end = new Date()
  const start = addDays(end, -days)
  return { start, end }
}

const groupAdders: Record<AccuracyGroupBy, (date: Date, amount: number) => Date> = {
  day: addDays,
  week: addWeeks,
  month: addMonths,
}

const groupStarts: Record<AccuracyGroupBy, (date: Date) => Date> = {
  day: startOfDay,
  week: startOfWeek,
  month: startOfMonth,
}

interface AccuracySummary {
  totalCommands: number
  completedCommands: number
  regionMatchRate: number
  slaMetRate: number
  avgEmissionsVariancePct: number | null
  avgLatencyVariancePct: number | null
  avgCostVariancePct: number | null
  predictionQuality: {
    high: number
    medium: number
    low: number
  }
  totalEstimatedSavingsKgCo2e: number
  totalVerifiedSavingsKgCo2e: number
}

interface TrendRow {
  date: string
  commands: number
  completed: number
  regionMatchRate: number
  slaMetRate: number
  avgEmissionsVariancePct: number | null
  verifiedSavingsKgCo2e: number
}

interface BreakdownRow {
  key: string
  commands: number
  completed: number
  avgEmissionsVariancePct: number | null
  verifiedSavingsKgCo2e: number
  regionMatchRate?: number
}

const safeAvg = (values: (number | null)[]): number | null => {
  const filtered = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (filtered.length === 0) return null
  const avg = filtered.reduce((sum, v) => sum + v, 0) / filtered.length
  return Number(avg.toFixed(2))
}

const rate = (numerator: number, denominator: number): number => {
  if (!denominator) return 0
  return Number((numerator / denominator).toFixed(4))
}

const buildInsightMessages = (
  summary: AccuracySummary,
  breakdowns: { byRegion: BreakdownRow[]; byWorkloadType: BreakdownRow[] }
): string[] => {
  const insights: string[] = []
  if (summary.avgEmissionsVariancePct !== null && summary.avgEmissionsVariancePct < 10) {
    insights.push('Prediction accuracy remained strong (emissions variance under 10%).')
  }
  if (summary.regionMatchRate < 0.85) {
    insights.push('Region execution drifted from recommendations; review fallback behavior.')
  }
  const topSavingsRegion = breakdowns.byRegion[0]
  if (topSavingsRegion && topSavingsRegion.verifiedSavingsKgCo2e > 0) {
    insights.push(`Region ${topSavingsRegion.key} delivered the highest verified carbon savings.`)
  }
  if (summary.totalVerifiedSavingsKgCo2e > summary.totalEstimatedSavingsKgCo2e * 0.9) {
    insights.push('Verified savings closely tracked projected savings in this window.')
  }
  if (insights.length === 0) {
    insights.push('Collect more completed workloads to generate actionable insights.')
  }
  return insights
}

type DecisionMetricsRow = {
  createdAt: Date
  chosenRegion: string | null
  requestCount: number | null
  co2BaselineG: number | null
  co2ChosenG: number | null
  fallbackUsed: boolean | null
  latencyEstimateMs: number | null
  latencyActualMs: number | null
  dataFreshnessSeconds: number | null
}

const listDecisionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

router.get('/decisions', async (req, res) => {
  try {
    const { limit } = listDecisionsQuerySchema.parse(req.query)

    const decisions = await prisma.dashboardRoutingDecision.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    res.json({ decisions })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Dashboard decisions error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const exportDecisionsQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
})

router.get('/decisions/export', async (req, res) => {
  try {
    const { format, limit } = exportDecisionsQuerySchema.parse(req.query)

    const decisions = await prisma.dashboardRoutingDecision.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="ecobe-receipts.json"')
      return res.send(JSON.stringify({ decisions }, null, 2))
    }

    const columns = [
      'createdAt',
      'workloadName',
      'opName',
      'baselineRegion',
      'chosenRegion',
      'zoneBaseline',
      'zoneChosen',
      'carbonIntensityBaselineGPerKwh',
      'carbonIntensityChosenGPerKwh',
      'estimatedKwh',
      'co2BaselineG',
      'co2ChosenG',
      'latencyEstimateMs',
      'latencyActualMs',
      'fallbackUsed',
      'dataFreshnessSeconds',
      'requestCount',
      'reason',
      'id',
    ] as const

    const escape = (v: unknown) => {
      if (v === null || v === undefined) return ''
      const s = String(v)
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
      return s
    }

    const lines: string[] = []
    lines.push(columns.join(','))
    for (const d of decisions) {
      lines.push(columns.map((c) => escape((d as any)[c])).join(','))
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="ecobe-receipts.csv"')
    return res.send(lines.join('\n'))
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Dashboard export error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const metricsQuerySchema = z.object({
  window: z.enum(['24h', '7d']).default('24h'),
})

const accuracyQuerySchema = z
  .object({
    orgId: z.string().min(1, 'orgId is required'),
    range: z.enum(['7d', '30d', '90d', 'custom']).default('30d'),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    workloadType: z.string().optional(),
    region: z.string().optional(),
    modelFamily: z.string().optional(),
    groupBy: z.enum(['day', 'week', 'month']).default('day'),
  })
  .superRefine((value, ctx) => {
    if (value.range === 'custom') {
      if (!value.startDate || !value.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'startDate and endDate are required when range=custom',
        })
      }
    }
  })

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

router.get('/metrics', async (req, res) => {
  try {
    const { window } = metricsQuerySchema.parse(req.query)
    const windowHours = window === '7d' ? 24 * 7 : 24

    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000)

    const decisionsPromise = prisma.dashboardRoutingDecision.findMany({
      where: { createdAt: { gte: since } },
      select: {
        createdAt: true,
        chosenRegion: true,
        requestCount: true,
        co2BaselineG: true,
        co2ChosenG: true,
        fallbackUsed: true,
        latencyEstimateMs: true,
        latencyActualMs: true,
        dataFreshnessSeconds: true,
      },
    })

    const topChosenRegionPromise = prisma.dashboardRoutingDecision.groupBy({
      by: ['chosenRegion'],
      where: { createdAt: { gte: since } },
      _count: { chosenRegion: true },
      orderBy: { _count: { chosenRegion: 'desc' } },
      take: 1,
    })

    const integrationMetricPromise = getIntegrationMetric('ELECTRICITY_MAPS')
    const refreshSummaryPromise = getForecastRefreshSummary(windowHours)
    const refreshStatePromise = getLastForecastRefreshState()

    const [decisions, topChosenRegionAgg, integrationMetric, refreshSummary, refreshState] =
      await Promise.all([
        decisionsPromise,
        topChosenRegionPromise,
        integrationMetricPromise,
        refreshSummaryPromise,
        refreshStatePromise,
      ])

    const totalDecisions = decisions.length
    const totalRequests = decisions.reduce<number>(
      (sum: number, d: DecisionMetricsRow) => sum + (d.requestCount ?? 0),
      0
    )

    const co2SavedG = decisions.reduce<number>((sum: number, d: DecisionMetricsRow) => {
      const base = d.co2BaselineG ?? 0
      const chosen = d.co2ChosenG ?? 0
      const delta = base - chosen
      return sum + (delta > 0 ? delta : 0)
    }, 0)

    const greenRouteRate =
      totalDecisions > 0
        ? decisions.reduce<number>((sum: number, d: DecisionMetricsRow) => {
            const base = d.co2BaselineG ?? 0
            const chosen = d.co2ChosenG ?? 0
            return sum + (base > chosen ? 1 : 0)
          }, 0) / totalDecisions
        : 0

    const fallbackRate =
      totalDecisions > 0
        ?
          decisions.reduce<number>(
            (sum: number, d: DecisionMetricsRow) => sum + (d.fallbackUsed ? 1 : 0),
            0
          ) / totalDecisions
        : 0

    const topChosenRegion = topChosenRegionAgg[0]?.chosenRegion ?? null

    const deltas = decisions
      .map((d: DecisionMetricsRow) => {
        if (d.latencyActualMs === null || d.latencyActualMs === undefined) return null
        if (d.latencyEstimateMs === null || d.latencyEstimateMs === undefined) return null
        return d.latencyActualMs - d.latencyEstimateMs
      })
      .filter((v: number | null): v is number => typeof v === 'number' && Number.isFinite(v))
      .sort((a: number, b: number) => a - b)

    const p95LatencyDeltaMs = percentile(deltas, 0.95)

    const dataFreshnessMaxSeconds = decisions.reduce<number | null>((max: number | null, d: DecisionMetricsRow) => {
      const v = d.dataFreshnessSeconds
      if (v === null || v === undefined) return max
      if (max === null) return v
      return v > max ? v : max
    }, null)

    const co2AvoidedPer1kRequestsG = totalRequests > 0 ? (co2SavedG / totalRequests) * 1000 : 0

    const electricityMapsMetric = integrationMetric
      ? {
          successRate: computeIntegrationSuccessRate(integrationMetric) ?? null,
          successCount: integrationMetric.successCount,
          failureCount: integrationMetric.failureCount,
          lastSuccessAt: integrationMetric.lastSuccessAt ?? null,
          lastFailureAt: integrationMetric.lastFailureAt ?? null,
          lastError: integrationMetric.lastError ?? null,
        }
      : null

    const forecastRefresh = {
      ...refreshSummary,
      lastRun: refreshState
        ? {
            timestamp: refreshState.timestamp,
            totalRegions: refreshState.totalRegions,
            totalRecords: refreshState.totalRecords,
            totalForecasts: refreshState.totalForecasts,
            status: refreshState.status,
            message: refreshState.message ?? null,
          }
        : null,
    }

    return res.json({
      window,
      windowHours,
      totalDecisions,
      totalRequests,
      co2SavedG,
      co2AvoidedPer1kRequestsG,
      greenRouteRate,
      fallbackRate,
      topChosenRegion,
      p95LatencyDeltaMs,
      dataFreshnessMaxSeconds,
      electricityMapsSuccessRate: electricityMapsMetric?.successRate ?? null,
      electricityMaps: electricityMapsMetric,
      forecastRefresh,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Dashboard metrics error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/accuracy', async (req, res) => {
  try {
    const { orgId, range, startDate, endDate, workloadType, region, modelFamily, groupBy } =
      accuracyQuerySchema.parse(req.query)

    const { start, end } = resolveAccuracyRange(range, startDate, endDate)

    const commandWhere: Prisma.CarbonCommandWhereInput = {
      orgId,
      createdAt: { gte: start, lte: end },
    }
    if (workloadType) {
      commandWhere.workloadType = workloadType
    }
    if (modelFamily) {
      commandWhere.modelFamily = modelFamily
    }

    const commands = await prisma.carbonCommand.findMany({
      where: commandWhere,
      select: {
        id: true,
        createdAt: true,
        workloadType: true,
        modelFamily: true,
        selectedRegion: true,
        estimatedSavingsKgCo2e: true,
        executionMode: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    if (commands.length === 0) {
      return res.json({
        success: true,
        range: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          groupBy,
        },
        summary: {
          totalCommands: 0,
          completedCommands: 0,
          regionMatchRate: 0,
          slaMetRate: 0,
          avgEmissionsVariancePct: null,
          avgLatencyVariancePct: null,
          avgCostVariancePct: null,
          predictionQuality: { high: 0, medium: 0, low: 0 },
          totalEstimatedSavingsKgCo2e: 0,
          totalVerifiedSavingsKgCo2e: 0,
        },
        trends: [],
        breakdowns: { byWorkloadType: [], byRegion: [] },
        insights: ['No command data available for the selected period.'],
      })
    }

    const commandIds = commands.map((cmd) => cmd.id)
    const outcomes = await prisma.carbonCommandOutcome.findMany({
      where: {
        commandId: { in: commandIds },
        orgId,
        createdAt: { gte: start, lte: end },
      },
      select: {
        commandId: true,
        actualRegion: true,
        regionMatch: true,
        slaMet: true,
        emissionsVariancePct: true,
        latencyVariancePct: true,
        costVariancePct: true,
        predictedEmissionsKgCo2e: true,
        actualEmissionsKgCo2e: true,
        predictionQuality: true,
      },
    })

    let filteredCommands = commands
    let filteredOutcomes = outcomes

    if (region) {
      const regionCommandIds = new Set(
        outcomes.filter((o) => o.actualRegion === region).map((o) => o.commandId)
      )
      filteredOutcomes = outcomes.filter((o) => o.actualRegion === region)
      filteredCommands = commands.filter((cmd) => regionCommandIds.has(cmd.id))
    }

    if (filteredCommands.length === 0) {
      return res.json({
        success: true,
        range: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          groupBy,
        },
        summary: {
          totalCommands: 0,
          completedCommands: 0,
          regionMatchRate: 0,
          slaMetRate: 0,
          avgEmissionsVariancePct: null,
          avgLatencyVariancePct: null,
          avgCostVariancePct: null,
          predictionQuality: { high: 0, medium: 0, low: 0 },
          totalEstimatedSavingsKgCo2e: 0,
          totalVerifiedSavingsKgCo2e: 0,
        },
        trends: [],
        breakdowns: { byWorkloadType: [], byRegion: [] },
        insights: ['No command data available for the selected filters.'],
      })
    }

    const bucketStats = new Map<
      string,
      {
        start: Date
        commands: number
        completed: number
        regionMatchCount: number
        slaMetCount: number
        emissionsVariance: (number | null)[]
        verifiedSavings: number[]
      }
    >()
    const workloadStats = new Map<
      string,
      {
        commands: number
        completed: number
        emissionsVariance: (number | null)[]
        verifiedSavings: number[]
      }
    >()
    const regionStats = new Map<
      string,
      {
        commands: number
        completed: number
        regionMatchCount: number
        emissionsVariance: (number | null)[]
        verifiedSavings: number[]
      }
    >()
    const commandMeta = new Map<
      string,
      {
        createdAt: Date
        workloadType: string | null
        selectedRegion: string | null
        estimatedSavings: number
      }
    >()

    const groupStartFn = groupStarts[groupBy]

    const getBucket = (date: Date) => {
      const bucketStart = groupStartFn(date)
      const key = formatISO(bucketStart)
      if (!bucketStats.has(key)) {
        bucketStats.set(key, {
          start: bucketStart,
          commands: 0,
          completed: 0,
          regionMatchCount: 0,
          slaMetCount: 0,
          emissionsVariance: [],
          verifiedSavings: [],
        })
      }
      return bucketStats.get(key)!
    }

    const ensureWorkloadStat = (key: string) => {
      if (!workloadStats.has(key)) {
        workloadStats.set(key, {
          commands: 0,
          completed: 0,
          emissionsVariance: [],
          verifiedSavings: [],
        })
      }
      return workloadStats.get(key)!
    }

    const ensureRegionStat = (key: string) => {
      if (!regionStats.has(key)) {
        regionStats.set(key, {
          commands: 0,
          completed: 0,
          regionMatchCount: 0,
          emissionsVariance: [],
          verifiedSavings: [],
        })
      }
      return regionStats.get(key)!
    }

    filteredCommands.forEach((command) => {
      commandMeta.set(command.id, {
        createdAt: command.createdAt,
        workloadType: command.workloadType ?? null,
        selectedRegion: command.selectedRegion ?? null,
        estimatedSavings: command.estimatedSavingsKgCo2e ?? 0,
      })
      const bucket = getBucket(command.createdAt)
      bucket.commands += 1
      const workloadKey = command.workloadType ?? 'unknown'
      ensureWorkloadStat(workloadKey).commands += 1
    })

    let regionMatchCount = 0
    let slaMetCount = 0
    let slaConsidered = 0
    const emissionsVarianceValues: (number | null)[] = []
    const latencyVarianceValues: (number | null)[] = []
    const costVarianceValues: (number | null)[] = []
    let verifiedSavingsTotal = 0

    filteredOutcomes.forEach((outcome) => {
      const command = commandMeta.get(outcome.commandId)
      if (!command) return

      const bucket = getBucket(command.createdAt)
      bucket.completed += 1

      if (outcome.regionMatch) {
        bucket.regionMatchCount += 1
        regionMatchCount += 1
      }
      if (typeof outcome.slaMet === 'boolean') {
        slaConsidered += 1
        if (outcome.slaMet) {
          bucket.slaMetCount += 1
          slaMetCount += 1
        }
      }

      if (typeof outcome.emissionsVariancePct === 'number') {
        bucket.emissionsVariance.push(outcome.emissionsVariancePct)
        emissionsVarianceValues.push(outcome.emissionsVariancePct)
      } else {
        bucket.emissionsVariance.push(null)
        emissionsVarianceValues.push(null)
      }
      latencyVarianceValues.push(
        typeof outcome.latencyVariancePct === 'number' ? outcome.latencyVariancePct : null
      )
      costVarianceValues.push(
        typeof outcome.costVariancePct === 'number' ? outcome.costVariancePct : null
      )

      const predicted = outcome.predictedEmissionsKgCo2e ?? 0
      const actual = outcome.actualEmissionsKgCo2e ?? predicted
      const verifiedSavings = Math.max(predicted - actual, 0)
      bucket.verifiedSavings.push(verifiedSavings)
      verifiedSavingsTotal += verifiedSavings

      const workloadKey = command.workloadType ?? 'unknown'
      const workloadStat = ensureWorkloadStat(workloadKey)
      workloadStat.completed += 1
      workloadStat.emissionsVariance.push(outcome.emissionsVariancePct ?? null)
      workloadStat.verifiedSavings.push(verifiedSavings)

      const regionKey = outcome.actualRegion ?? command.selectedRegion ?? 'unknown'
      const regionStat = ensureRegionStat(regionKey)
      regionStat.commands += 1
      regionStat.completed += 1
      if (outcome.regionMatch) {
        regionStat.regionMatchCount += 1
      }
      regionStat.emissionsVariance.push(outcome.emissionsVariancePct ?? null)
      regionStat.verifiedSavings.push(verifiedSavings)
    })

    const totalEstimatedSavings = filteredCommands.reduce(
      (sum, cmd) => sum + (cmd.estimatedSavingsKgCo2e ?? 0),
      0
    )

    const summary: AccuracySummary = {
      totalCommands: filteredCommands.length,
      completedCommands: filteredOutcomes.length,
      regionMatchRate: rate(regionMatchCount, filteredOutcomes.length),
      slaMetRate: rate(slaMetCount, slaConsidered || filteredOutcomes.length),
      avgEmissionsVariancePct: safeAvg(emissionsVarianceValues),
      avgLatencyVariancePct: safeAvg(latencyVarianceValues),
      avgCostVariancePct: safeAvg(costVarianceValues),
      predictionQuality: {
        high: filteredOutcomes.filter((o) => o.predictionQuality === 'HIGH').length,
        medium: filteredOutcomes.filter((o) => o.predictionQuality === 'MEDIUM').length,
        low: filteredOutcomes.filter((o) => o.predictionQuality === 'LOW').length,
      },
      totalEstimatedSavingsKgCo2e: Number(totalEstimatedSavings.toFixed(3)),
      totalVerifiedSavingsKgCo2e: Number(verifiedSavingsTotal.toFixed(3)),
    }

    const trends: TrendRow[] = Array.from(bucketStats.values())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((bucket) => ({
        date: formatISO(bucket.start, { representation: 'date' }),
        commands: bucket.commands,
        completed: bucket.completed,
        regionMatchRate: rate(bucket.regionMatchCount, bucket.completed),
        slaMetRate: rate(bucket.slaMetCount, bucket.completed || bucket.slaMetCount),
        avgEmissionsVariancePct: safeAvg(bucket.emissionsVariance),
        verifiedSavingsKgCo2e: Number(
          bucket.verifiedSavings.reduce((sum, v) => sum + v, 0).toFixed(3)
        ),
      }))

    const breakdowns = {
      byWorkloadType: Array.from(workloadStats.entries())
        .map(([workloadType, stats]) => ({
          key: workloadType || 'unknown',
          workloadType,
          commands: stats.commands,
          completed: stats.completed,
          avgEmissionsVariancePct: safeAvg(stats.emissionsVariance),
          verifiedSavingsKgCo2e: Number(
            stats.verifiedSavings.reduce((sum, v) => sum + v, 0).toFixed(3)
          ),
        }))
        .sort((a, b) => b.verifiedSavingsKgCo2e - a.verifiedSavingsKgCo2e),
      byRegion: Array.from(regionStats.entries())
        .map(([region, stats]) => ({
          key: region || 'unknown',
          region,
          commands: stats.commands,
          completed: stats.completed,
          avgEmissionsVariancePct: safeAvg(stats.emissionsVariance),
          verifiedSavingsKgCo2e: Number(
            stats.verifiedSavings.reduce((sum, v) => sum + v, 0).toFixed(3)
          ),
          regionMatchRate: rate(stats.regionMatchCount, stats.completed),
        }))
        .sort((a, b) => b.verifiedSavingsKgCo2e - a.verifiedSavingsKgCo2e),
    }

    const insights = buildInsightMessages(summary, breakdowns)

    return res.json({
      success: true,
      range: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        groupBy,
      },
      summary,
      trends,
      breakdowns,
      insights,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Invalid request', details: error.errors },
      })
    }
    console.error('Dashboard accuracy error:', error)
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Internal server error' },
    })
  }
})

router.get('/region-mapping', async (_req, res) => {
  try {
    const decisions = await prisma.dashboardRoutingDecision.findMany({
      orderBy: { createdAt: 'desc' },
      take: 2000,
      select: {
        createdAt: true,
        baselineRegion: true,
        chosenRegion: true,
        zoneBaseline: true,
        zoneChosen: true,
      },
    })

    type MappingKey = string
    type Mapping = {
      cloudRegion: string
      zone: string
      lastSeenAt: Date
      carbonIntensityGPerKwh: number | null
      fetchedAt: Date | null
    }

    const map = new Map<MappingKey, Mapping>()
    const consider = (cloudRegion: string, zone: string | null, createdAt: Date) => {
      const z = (zone ?? '').trim()
      if (!z) return
      const key = `${cloudRegion}::${z}`
      const prev = map.get(key)
      if (!prev || createdAt > prev.lastSeenAt) {
        map.set(key, {
          cloudRegion,
          zone: z,
          lastSeenAt: createdAt,
          carbonIntensityGPerKwh: null,
          fetchedAt: null,
        })
      }
    }

    for (const d of decisions) {
      consider(d.baselineRegion, d.zoneBaseline, d.createdAt)
      consider(d.chosenRegion, d.zoneChosen, d.createdAt)
    }

    const mappings: Mapping[] = []
    for (const m of map.values()) {
      const latest = await prisma.carbonIntensity.findFirst({
        where: { region: m.zone },
        orderBy: { timestamp: 'desc' },
        select: { carbonIntensity: true, timestamp: true },
      })

      mappings.push({
        ...m,
        carbonIntensityGPerKwh: latest?.carbonIntensity ?? null,
        fetchedAt: latest?.timestamp ?? null,
      })
    }

    mappings.sort((a, b) => a.cloudRegion.localeCompare(b.cloudRegion) || a.zone.localeCompare(b.zone))
    return res.json({ mappings })
  } catch (error) {
    console.error('Dashboard region-mapping error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

const whatIfSchema = z.object({
  zones: z.array(z.string().min(1)).min(1).max(50),
})

router.post('/what-if/intensities', async (req, res) => {
  try {
    const { zones } = whatIfSchema.parse(req.body)

    const intensities = await Promise.all(
      zones.map(async (zone) => {
        const latest = await prisma.carbonIntensity.findFirst({
          where: { region: zone },
          orderBy: { timestamp: 'desc' },
          select: { carbonIntensity: true, timestamp: true },
        })

        if (latest) {
          return { zone, carbonIntensity: latest.carbonIntensity }
        }

        const resp = await electricityMaps.getCarbonIntensity(zone)
        const carbonIntensity = resp?.carbonIntensity ?? 400
        return { zone, carbonIntensity }
      })
    )

    return res.json({ intensities })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Dashboard what-if error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/regions', async (_req, res) => {
  try {
    const regions = (await prisma.region.findMany({
      where: { enabled: true },
      select: { code: true, name: true, country: true },
      orderBy: { code: 'asc' },
    })) as { code: string; name: string | null; country: string | null }[]

    const enriched = await Promise.all(
      regions.map(async (regionRecord: { code: string; name: string | null; country: string | null }) => {
        const latest = await prisma.carbonIntensity.findFirst({
          where: { region: regionRecord.code },
          orderBy: { timestamp: 'desc' },
          select: { carbonIntensity: true, timestamp: true },
        })

        return {
          ...regionRecord,
          carbonIntensityGPerKwh: latest?.carbonIntensity ?? null,
          fetchedAt: latest?.timestamp ?? null,
        }
      })
    )

    return res.json({ regions: enriched })
  } catch (error) {
    console.error('Dashboard regions error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
