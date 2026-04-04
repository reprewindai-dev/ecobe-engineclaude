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
import {
  getDecisionProjectionFreshness,
  normalizeLegacySavingsRatio,
  type DecisionProjectionDataStatus,
} from '../lib/ci/decision-projection'
import { persistLegacyCanonicalDecision } from '../lib/ci/legacy-canonical-ingest'
import { getIntegrationMetricsSummary, computeIntegrationSuccessRate } from '../lib/integration-metrics'
import { getForecastRefreshSummary, getLastForecastRefreshState } from '../lib/forecast-refresh'
import { getTelemetrySnapshot } from '../lib/observability/telemetry'
import { getProviderFreshness, getCapacityOverview } from '../lib/routing'
import { summarizeWaterProviders } from '../lib/water/bundle'

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

type IntegrationMetricRecord = {
  source: string
  successCount: number
  failureCount: number
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  lastLatencyMs: number | null
  lastError: string | null
  alertActive: boolean
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

const LIVE_SIGNAL_SOURCES = [
  'WATTTIME',
  'GRIDSTATUS',
  'EIA_930',
  'EMBER',
  'GB_CARBON',
  'DK_CARBON',
  'FI_CARBON',
] as const

function normalizeProviderIdentity(provider: string) {
  const normalized = provider.trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (normalized === 'WATTTIME') return 'WATTTIME_MOER'
  if (normalized === 'EMBER' || normalized === 'EMBER_STRUCTURAL') return 'EMBER_STRUCTURAL_BASELINE'
  return normalized
}

const isoLatest = (...values: Array<Date | null | undefined>) => {
  const valid = values.filter((value): value is Date => value instanceof Date)
  if (valid.length === 0) return null
  return new Date(Math.max(...valid.map((value) => value.getTime()))).toISOString()
}

type WaterProviderTrustRow = {
  provider: string
  authorityRole?: string
  authorityStatus?: 'authoritative' | 'advisory' | 'fallback'
  region?: string | null
  scenario?: string | null
  authorityMode?: string | null
  confidence?: number | null
  observedAt?: string | null
  evidenceRefs?: string[]
  metadata?: Record<string, unknown> | null
  freshnessSec?: number | null
  datasetVersion?: string | null
}

function normalizeWaterProviderKey(provider: string) {
  return provider.trim().toLowerCase()
}

function summarizeWaterProviderTrust(
  snapshots: Array<{
    provider: string
    authorityRole: string
    region: string
    scenario: string
    authorityMode: string
    confidence: number | null
    evidenceRefs: Prisma.JsonValue
    observedAt: Date
    metadata: Prisma.JsonValue
  }>
): WaterProviderTrustRow[] {
  const summaryRows = summarizeWaterProviders()
  const summaryByProvider = new Map(summaryRows.map((row) => [normalizeWaterProviderKey(row.provider), row]))
  const latestSnapshotByProvider = new Map<string, typeof snapshots[number]>()

  for (const snapshot of snapshots) {
    const key = normalizeWaterProviderKey(snapshot.provider)
    if (!latestSnapshotByProvider.has(key)) {
      latestSnapshotByProvider.set(key, snapshot)
    }
  }

  const keys = new Set<string>([
    ...summaryByProvider.keys(),
    ...latestSnapshotByProvider.keys(),
  ])

  return Array.from(keys)
    .map((key) => {
      const summary = summaryByProvider.get(key)
      const snapshot = latestSnapshotByProvider.get(key)
      const metadata =
        snapshot?.metadata && typeof snapshot.metadata === 'object' && !Array.isArray(snapshot.metadata)
          ? { ...(snapshot.metadata as Record<string, unknown>) }
          : {}

      if (summary?.fileHash) {
        metadata.fileHash = summary.fileHash
      }
      if (summary?.datasetVersion) {
        metadata.datasetVersion = summary.datasetVersion
      }
      if (summary?.authorityStatus) {
        metadata.authorityStatus = summary.authorityStatus
      }

      return {
        provider: summary?.provider ?? snapshot?.provider ?? key,
        authorityRole: summary?.authorityRole ?? snapshot?.authorityRole ?? 'overlay',
        authorityStatus: summary?.authorityStatus ?? undefined,
        region: snapshot?.region ?? null,
        scenario: snapshot?.scenario ?? 'current',
        authorityMode: snapshot?.authorityMode ?? 'basin',
        confidence: snapshot?.confidence ?? null,
        observedAt: summary?.lastObservedAt ?? snapshot?.observedAt.toISOString() ?? null,
        evidenceRefs: Array.isArray(snapshot?.evidenceRefs)
          ? (snapshot?.evidenceRefs as string[])
          : [],
        metadata,
        freshnessSec:
          summary?.freshnessSec ??
          Math.max(0, Math.round((Date.now() - (snapshot?.observedAt?.getTime() ?? Date.now())) / 1000)),
        datasetVersion:
          summary?.datasetVersion ??
          (typeof metadata.datasetVersion === 'string' ? metadata.datasetVersion : null),
      } satisfies WaterProviderTrustRow
    })
    .sort((a, b) => a.provider.localeCompare(b.provider))
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

type ImpactWindowKey = '24h' | '7d' | '30d'

const impactWindowDays: Record<ImpactWindowKey, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
}

const IMPACT_STALE_SECONDS = 60 * 60
const CI_INTENSITY_MAX = 2000
const CI_SAVINGS_MIN = -100
const CI_SAVINGS_MAX = 100

const impactReportQuerySchema = z.object({
  window: z.enum(['auto', '24h', '7d', '30d']).default('auto'),
  minSamples: z.coerce.number().int().min(10).max(100000).default(50),
})

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
  carbonSavingsRatio?: number | null
  estimatedKwh?: number | null
  decisionAction: string | null
  fallbackUsed: boolean
  lowConfidence?: boolean | null
  signalConfidence: number | null
  reasonCode: string | null
  waterImpactLiters: number | null
  waterBaselineLiters: number | null
  waterScarcityImpact: number | null
  waterStressIndex: number | null
  waterConfidence: number | null
  waterAuthorityMode: string | null
}

const normalizeDecisionAction = (value: string) => {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'run' || normalized === 'run_now' || normalized === 'runnow') return 'run_now'
  if (normalized === 'delay' || normalized === 'delayed') return 'delay'
  if (normalized === 'deny' || normalized === 'blocked' || normalized === 'block') return 'deny'
  return normalized
}

const getMetaValue = (meta: Prisma.JsonValue, path: Array<string | number>): unknown => {
  let cursor: unknown = meta
  for (const key of path) {
    if (Array.isArray(cursor)) {
      if (typeof key !== 'number') return undefined
      cursor = cursor[key]
      continue
    }
    if (!cursor || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[String(key)]
  }
  return cursor
}

type ProjectionResponseMetadata = {
  dataSource: 'projection' | 'canonical_fallback'
  dataStatus: DecisionProjectionDataStatus
  projectionLagSec: number | null
  latestProjectionAt: string | null
  latestCanonicalAt: string | null
}

type CanonicalMetricsRow = {
  createdAt: Date
  selectedRegion: string
  baseline: number
  carbonIntensity: number
  fallbackUsed: boolean
  signalConfidence: number | null
  lowConfidence?: boolean | null
  estimatedKwh?: number | null
  metadata: Prisma.JsonValue
}

const buildProjectionResponseMetadata = (
  freshness: Awaited<ReturnType<typeof getDecisionProjectionFreshness>>,
  dataSource: ProjectionResponseMetadata['dataSource']
): ProjectionResponseMetadata => ({
  dataSource,
  dataStatus: freshness.dataStatus,
  projectionLagSec: freshness.projectionLagSec,
  latestProjectionAt: freshness.latestProjectionAt?.toISOString() ?? null,
  latestCanonicalAt: freshness.latestCanonicalAt?.toISOString() ?? null,
})

const shouldUseCanonicalFallback = (status: DecisionProjectionDataStatus) =>
  status === 'stale' || status === 'broken'

const getCiEstimatedKwh = (row: {
  estimatedKwh?: number | null
  metadata: Prisma.JsonValue
}) => {
  const explicit = typeof row.estimatedKwh === 'number' && Number.isFinite(row.estimatedKwh)
    ? row.estimatedKwh
    : null
  if (explicit !== null) return explicit

  const candidates = [
    getMetaValue(row.metadata, ['request', 'estimatedEnergyKwh']),
    getMetaValue(row.metadata, ['request', 'estimatedKwh']),
    getMetaValue(row.metadata, ['request', 'energyKwh']),
    getMetaValue(row.metadata, ['request', 'metadata', 'estimatedEnergyKwh']),
    getMetaValue(row.metadata, ['request', 'metadata', 'estimatedKwh']),
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate
    }
  }

  return null
}

const getCiLatencySnapshot = (meta: Prisma.JsonValue) => {
  const compute = getMetaValue(meta, ['response', 'latencyMs', 'compute'])
  const total = getMetaValue(meta, ['response', 'latencyMs', 'total'])
  return {
    compute: typeof compute === 'number' && Number.isFinite(compute) ? compute : null,
    total: typeof total === 'number' && Number.isFinite(total) ? total : null,
  }
}

const getCiFreshnessSeconds = (meta: Prisma.JsonValue) => {
  const waterFreshness = getMetaValue(meta, ['response', 'mss', 'waterFreshnessSec'])
  if (typeof waterFreshness === 'number' && Number.isFinite(waterFreshness)) return waterFreshness
  const carbonFreshness = getMetaValue(meta, ['response', 'mss', 'carbonFreshnessSec'])
  return typeof carbonFreshness === 'number' && Number.isFinite(carbonFreshness)
    ? carbonFreshness
    : null
}

const normalizeCiSavingsPct = (row: ImpactCiDecisionRow) => {
  const ratio =
    typeof row.carbonSavingsRatio === 'number' && Number.isFinite(row.carbonSavingsRatio)
      ? row.carbonSavingsRatio
      : normalizeLegacySavingsRatio(row.savings)
  if (ratio === null) return null
  return Number((ratio * 100).toFixed(4))
}

const summarizeCanonicalMetricsRows = (rows: CanonicalMetricsRow[]) => {
  const totalDecisions = rows.length
  const totalRequests = rows.length
  let co2SavedG = 0
  let greenRouteCount = 0
  let fallbackCount = 0
  const chosenRegionCounts = new Map<string, number>()
  const latencyDeltas: number[] = []
  let dataFreshnessMaxSeconds: number | null = null

  rows.forEach((row) => {
    chosenRegionCounts.set(row.selectedRegion, (chosenRegionCounts.get(row.selectedRegion) ?? 0) + 1)
    if (row.fallbackUsed) fallbackCount += 1

    const estimatedKwh = getCiEstimatedKwh(row)
    if (
      Number.isFinite(row.baseline) &&
      Number.isFinite(row.carbonIntensity) &&
      estimatedKwh !== null
    ) {
      const baselineG = row.baseline * estimatedKwh
      const chosenG = row.carbonIntensity * estimatedKwh
      const delta = baselineG - chosenG
      if (delta > 0) co2SavedG += delta
      if (baselineG > chosenG) greenRouteCount += 1
    }

    const latency = getCiLatencySnapshot(row.metadata)
    if (latency.compute !== null && latency.total !== null) {
      latencyDeltas.push(latency.total - latency.compute)
    }

    const freshnessSec = getCiFreshnessSeconds(row.metadata)
    if (freshnessSec !== null) {
      dataFreshnessMaxSeconds =
        dataFreshnessMaxSeconds === null
          ? freshnessSec
          : Math.max(dataFreshnessMaxSeconds, freshnessSec)
    }
  })

  latencyDeltas.sort((a, b) => a - b)

  return {
    totalDecisions,
    totalRequests,
    co2SavedG: Number(co2SavedG.toFixed(3)),
    co2AvoidedPer1kRequestsG:
      totalRequests > 0 ? Number(((co2SavedG / totalRequests) * 1000).toFixed(3)) : 0,
    greenRouteRate: totalDecisions > 0 ? greenRouteCount / totalDecisions : 0,
    fallbackRate: totalDecisions > 0 ? fallbackCount / totalDecisions : 0,
    topChosenRegion:
      Array.from(chosenRegionCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    p95LatencyDeltaMs: percentile(latencyDeltas, 0.95),
    dataFreshnessMaxSeconds,
  }
}

const summarizeCanonicalSavingsRows = (
  rows: Array<{
    createdAt: Date
    baseline: number
    carbonIntensity: number
    estimatedKwh?: number | null
    metadata: Prisma.JsonValue
  }>
) => {
  let totalBaseline = 0
  let totalChosen = 0
  let totalKwh = 0
  const dailyMap = new Map<string, { baseline: number; chosen: number; count: number }>()

  rows.forEach((row) => {
    const estimatedKwh = getCiEstimatedKwh(row)
    if (
      estimatedKwh === null ||
      !Number.isFinite(row.baseline) ||
      !Number.isFinite(row.carbonIntensity)
    ) {
      return
    }

    const baselineG = row.baseline * estimatedKwh
    const chosenG = row.carbonIntensity * estimatedKwh
    totalBaseline += baselineG
    totalChosen += chosenG
    totalKwh += estimatedKwh

    const day = row.createdAt.toISOString().split('T')[0]
    const existing = dailyMap.get(day) || { baseline: 0, chosen: 0, count: 0 }
    existing.baseline += baselineG
    existing.chosen += chosenG
    existing.count += 1
    dailyMap.set(day, existing)
  })

  return {
    totalBaseline: Number(totalBaseline.toFixed(3)),
    totalChosen: Number(totalChosen.toFixed(3)),
    totalAvoided: Number((totalBaseline - totalChosen).toFixed(3)),
    totalKwh: Number(totalKwh.toFixed(6)),
    dailyTrend: Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        baselineG: Math.round(data.baseline),
        chosenG: Math.round(data.chosen),
        avoidedG: Math.round(data.baseline - data.chosen),
        decisions: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
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

const summarizeImpactWindow = (
  rows: ImpactDecisionRow[],
  windowStart: Date,
  windowEnd: Date
) => {
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

const summarizeCiImpactWindow = (
  rows: ImpactCiDecisionRow[],
  windowStart: Date,
  windowEnd: Date
) => {
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
    if (
      row.lowConfidence === true ||
      (typeof row.signalConfidence === 'number' && row.signalConfidence < 0.6)
    ) {
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
    const normalizedSavingsPct = normalizeCiSavingsPct(row)
    if (normalizedSavingsPct !== null) {
      if (normalizedSavingsPct >= CI_SAVINGS_MIN && normalizedSavingsPct <= CI_SAVINGS_MAX) {
        savingsPctValues.push(normalizedSavingsPct)
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

    const integrationMetricsPromise = getIntegrationMetricsSummary()
    const refreshSummaryPromise = getForecastRefreshSummary(windowHours)
    const refreshStatePromise = getLastForecastRefreshState()
    const freshnessPromise = getDecisionProjectionFreshness()

    const [decisions, topChosenRegionAgg, integrationMetrics, refreshSummary, refreshState, freshness] =
      await Promise.all([
        decisionsPromise,
        topChosenRegionPromise,
        integrationMetricsPromise,
        refreshSummaryPromise,
        refreshStatePromise,
        freshnessPromise,
      ])

    const totalDecisions = decisions.length
    const typedDecisions = decisions as DecisionMetricsRow[]
    const totalRequests = typedDecisions.reduce(
      (sum: number, d) => sum + (d.requestCount ?? 0),
      0
    )

    const co2SavedG = typedDecisions.reduce((sum: number, d) => {
      const base = d.co2BaselineG ?? 0
      const chosen = d.co2ChosenG ?? 0
      const delta = base - chosen
      return sum + (delta > 0 ? delta : 0)
    }, 0)

    const greenRouteRate =
      totalDecisions > 0
        ? typedDecisions.reduce((sum: number, d) => {
            const base = d.co2BaselineG ?? 0
            const chosen = d.co2ChosenG ?? 0
            return sum + (base > chosen ? 1 : 0)
          }, 0) / totalDecisions
        : 0

    const fallbackRate =
      totalDecisions > 0
        ?
          typedDecisions.reduce(
            (sum: number, d) => sum + (d.fallbackUsed ? 1 : 0),
            0
          ) / totalDecisions
        : 0

    const topChosenRegion = topChosenRegionAgg[0]?.chosenRegion ?? null

    const deltas = typedDecisions
      .map((d: DecisionMetricsRow) => {
        if (d.latencyActualMs === null || d.latencyActualMs === undefined) return null
        if (d.latencyEstimateMs === null || d.latencyEstimateMs === undefined) return null
        return d.latencyActualMs - d.latencyEstimateMs
      })
      .filter((v: number | null): v is number => typeof v === 'number' && Number.isFinite(v))
      .sort((a: number, b: number) => a - b)

    const p95LatencyDeltaMs = percentile(deltas, 0.95)

    const dataFreshnessMaxSeconds = typedDecisions.reduce((max: number | null, d: DecisionMetricsRow) => {
      const v = d.dataFreshnessSeconds
      if (v === null || v === undefined) return max
      if (max === null) return v
      return v > max ? v : max
    }, null)

    const co2AvoidedPer1kRequestsG = totalRequests > 0 ? (co2SavedG / totalRequests) * 1000 : 0

    const typedIntegrationMetrics = integrationMetrics as IntegrationMetricRecord[]

    const providerMetrics = typedIntegrationMetrics.filter((metric: IntegrationMetricRecord) =>
      LIVE_SIGNAL_SOURCES.includes(metric.source as (typeof LIVE_SIGNAL_SOURCES)[number])
    )

    const successCount = providerMetrics.reduce(
      (sum: number, metric: any) => sum + metric.successCount,
      0
    )
    const failureCount = providerMetrics.reduce(
      (sum: number, metric: any) => sum + metric.failureCount,
      0
    )
    const providerSignalsMetric =
      providerMetrics.length > 0
        ? {
            successRate:
              successCount + failureCount > 0
                ? Number((successCount / (successCount + failureCount)).toFixed(4))
                : null,
            successCount,
            failureCount,
            lastSuccessAt: isoLatest(...providerMetrics.map((metric: IntegrationMetricRecord) => metric.lastSuccessAt)),
            lastFailureAt: isoLatest(...providerMetrics.map((metric: IntegrationMetricRecord) => metric.lastFailureAt)),
            lastError:
              providerMetrics.find((metric: IntegrationMetricRecord) => metric.lastError)?.lastError ?? null,
            activeSources: providerMetrics
              .filter((metric: IntegrationMetricRecord) => (computeIntegrationSuccessRate(metric) ?? 0) >= 0.8)
              .map((metric: IntegrationMetricRecord) => metric.source),
            degradedSources: providerMetrics
              .filter((metric: IntegrationMetricRecord) => (computeIntegrationSuccessRate(metric) ?? 0) < 0.8)
              .map((metric: IntegrationMetricRecord) => metric.source),
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

    const projectionResponseMeta = buildProjectionResponseMetadata(freshness, 'projection')

    if (shouldUseCanonicalFallback(freshness.dataStatus)) {
      const ciDecisions = await prisma.cIDecision.findMany({
        where: { createdAt: { gte: since } },
        select: {
          createdAt: true,
          selectedRegion: true,
          baseline: true,
          carbonIntensity: true,
          fallbackUsed: true,
          signalConfidence: true,
          lowConfidence: true,
          estimatedKwh: true,
          metadata: true,
        },
      }) as CanonicalMetricsRow[]

      const fallbackMetrics = summarizeCanonicalMetricsRows(ciDecisions)
      return res.json({
        ...fallbackMetrics,
        window,
        windowHours,
        ...buildProjectionResponseMetadata(freshness, 'canonical_fallback'),
        providerSignals: providerSignalsMetric,
        forecastRefresh,
        observability: getTelemetrySnapshot(),
      })
    }

    return res.json({
      window,
      windowHours,
      ...projectionResponseMeta,
      totalDecisions,
      totalRequests,
      co2SavedG,
      co2AvoidedPer1kRequestsG,
      greenRouteRate,
      fallbackRate,
      topChosenRegion,
      p95LatencyDeltaMs,
      dataFreshnessMaxSeconds,
      providerSignals: providerSignalsMetric,
      forecastRefresh,
      observability: getTelemetrySnapshot(),
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Dashboard metrics error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/impact-report', async (req, res) => {
  try {
    const { window, minSamples } = impactReportQuerySchema.parse(req.query)
    const now = new Date()
    const maxWindowStart = addDays(now, -impactWindowDays['30d'])

    const [routingDecisions, ciDecisions, freshness] = await Promise.all([
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
          carbonSavingsRatio: true,
          estimatedKwh: true,
          decisionAction: true,
          fallbackUsed: true,
          lowConfidence: true,
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
      getDecisionProjectionFreshness(),
    ])

    const routingResponseMeta = buildProjectionResponseMetadata(freshness, 'projection')
    const fallbackResponseMeta = buildProjectionResponseMetadata(freshness, 'canonical_fallback')

    if (routingDecisions.length === 0 && ciDecisions.length === 0) {
      return res.json({
        success: true,
        ...fallbackResponseMeta,
        window: { start: maxWindowStart.toISOString(), end: now.toISOString() },
        summary: null,
        selection: {
          strategy: window,
          reason: 'No decision data available in the last 30 days.',
          candidates: [],
        },
      })
    }

    const ciCandidates: Array<{
      key: ImpactWindowKey
      start: Date
      end: Date
      summary: ReturnType<typeof summarizeCiImpactWindow>
      score: number
    }> = (['24h', '7d', '30d'] as ImpactWindowKey[]).map((key) => {
      const start = addDays(now, -impactWindowDays[key])
      const rows = ciDecisions.filter((row) => row.createdAt >= start)
      const summary = summarizeCiImpactWindow(rows, start, now)
      const score = scoreCiImpactWindow(summary)
      return { key, start, end: now, summary, score }
    })

    const routingCandidates: Array<{
      key: ImpactWindowKey
      start: Date
      end: Date
      summary: ReturnType<typeof summarizeImpactWindow>
      score: number
    }> = (['24h', '7d', '30d'] as ImpactWindowKey[]).map((key) => {
      const start = addDays(now, -impactWindowDays[key])
      const rows = routingDecisions.filter((row) => row.createdAt >= start)
      const summary = summarizeImpactWindow(rows, start, now)
      const score = scoreImpactWindow(summary)
      return { key, start, end: now, summary, score }
    })

    const hasCiRecent = ciCandidates.some((c) => c.summary.totals.decisionCount >= minSamples)
    const hasRoutingRecent = routingCandidates.some((c) => c.summary.totals.decisionCount >= minSamples)

    const dataset = hasCiRecent || !hasRoutingRecent ? 'ci' : 'routing'
    const responseMeta =
      dataset === 'routing' && !shouldUseCanonicalFallback(freshness.dataStatus)
        ? routingResponseMeta
        : fallbackResponseMeta
    const candidates = dataset === 'ci' ? ciCandidates : routingCandidates
    const candidatesByKey = new Map(candidates.map((c) => [c.key, c]))
    const eligible = candidates.filter((c) => c.summary.totals.decisionCount >= minSamples)

    let selected = candidatesByKey.get('24h')!
    let selectionReason = 'Selected the most recent 24h window.'

    if (window !== 'auto') {
      const explicit = candidatesByKey.get(window as ImpactWindowKey)
      if (explicit) {
        selected = explicit
        selectionReason = `Explicit window override (${window}).`
      }
    } else if (eligible.length > 0) {
      selected = eligible.reduce((best, current) => (current.score > best.score ? current : best))
      selectionReason = `Selected the highest-quality eligible window (${selected.key}).`
    } else {
      selected = candidates.reduce((best, current) =>
        current.summary.totals.decisionCount > best.summary.totals.decisionCount ? current : best
      )
      selectionReason = 'Selected the window with the most samples due to low volume.'
    }

    return res.json({
      success: true,
      ...responseMeta,
      selection: {
        strategy: window,
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
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Impact report error:', error)
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

    const commandIds = commands.map((cmd: any) => cmd.id)
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
        outcomes.filter((o: any) => o.actualRegion === region).map((o: any) => o.commandId)
      )
      filteredOutcomes = outcomes.filter((o: any) => o.actualRegion === region)
      filteredCommands = commands.filter((cmd: any) => regionCommandIds.has(cmd.id))
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

    filteredCommands.forEach((command: any) => {
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

    filteredOutcomes.forEach((outcome: any) => {
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
      (sum: number, cmd: any) => sum + (cmd.estimatedSavingsKgCo2e ?? 0),
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
        high: filteredOutcomes.filter((o: any) => o.predictionQuality === 'HIGH').length,
        medium: filteredOutcomes.filter((o: any) => o.predictionQuality === 'MEDIUM').length,
        low: filteredOutcomes.filter((o: any) => o.predictionQuality === 'LOW').length,
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

        // Use static fallback since Electricity Maps is disabled
        const carbonIntensity = 400 // Static fallback value
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

const savingsQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d'),
})

router.get('/savings', async (req, res) => {
  try {
    const { range } = savingsQuerySchema.parse(req.query)
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const freshness = await getDecisionProjectionFreshness()
    let totalBaseline = 0
    let totalChosen = 0
    let totalKwh = 0
    let dailyTrend: Array<{
      date: string
      baselineG: number
      chosenG: number
      avoidedG: number
      decisions?: number
    }> = []
    let totalDecisions = 0
    let responseMeta = buildProjectionResponseMetadata(freshness, 'projection')

    if (shouldUseCanonicalFallback(freshness.dataStatus)) {
      const decisions = await prisma.cIDecision.findMany({
        where: { createdAt: { gte: since } },
        select: {
          createdAt: true,
          baseline: true,
          carbonIntensity: true,
          estimatedKwh: true,
          metadata: true,
        },
      })

      const fallback = summarizeCanonicalSavingsRows(decisions)
      totalBaseline = fallback.totalBaseline
      totalChosen = fallback.totalChosen
      totalKwh = fallback.totalKwh
      dailyTrend = fallback.dailyTrend
      totalDecisions = decisions.length
      responseMeta = buildProjectionResponseMetadata(freshness, 'canonical_fallback')
    } else {
      const decisions = await prisma.dashboardRoutingDecision.findMany({
        where: { createdAt: { gte: since } },
        select: {
          co2BaselineG: true,
          co2ChosenG: true,
          estimatedKwh: true,
          createdAt: true,
        },
      })

      totalBaseline = decisions.reduce((sum: number, d: any) => sum + (d.co2BaselineG ?? 0), 0)
      totalChosen = decisions.reduce((sum: number, d: any) => sum + (d.co2ChosenG ?? 0), 0)
      totalKwh = decisions.reduce((sum: number, d: any) => sum + (d.estimatedKwh ?? 0), 0)
      totalDecisions = decisions.length

      const dailyMap = new Map<string, { baseline: number; chosen: number; count: number }>()
      for (const d of decisions) {
        const day = d.createdAt.toISOString().split('T')[0]
        const existing = dailyMap.get(day) || { baseline: 0, chosen: 0, count: 0 }
        existing.baseline += d.co2BaselineG ?? 0
        existing.chosen += d.co2ChosenG ?? 0
        existing.count++
        dailyMap.set(day, existing)
      }

      dailyTrend = Array.from(dailyMap.entries())
        .map(([date, data]) => ({
          date,
          baselineG: Math.round(data.baseline),
          chosenG: Math.round(data.chosen),
          avoidedG: Math.round(data.baseline - data.chosen),
          decisions: data.count,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
    }

    const totalAvoided = totalBaseline - totalChosen

    res.json({
      ...responseMeta,
      window: range,
      co2AvoidedKg: Math.round(totalAvoided / 1000 * 100) / 100, // Convert g to kg
      avgMultiplier: totalChosen > 0 ? Math.round((totalBaseline / totalChosen) * 100) / 100 : 1.34,
      bestToday: 1.91, // Temporary static value
      last100AvgDelta: totalDecisions > 0 ? Math.round(totalAvoided / Math.min(totalDecisions, 100) * 100) / 100 : 0,
      timeRange: range,
      totalBaselineG: Math.round(totalBaseline),
      totalChosenG: Math.round(totalChosen),
      totalAvoidedG: Math.round(totalAvoided),
      reductionPct:
        totalBaseline > 0
          ? Math.round((totalAvoided / totalBaseline) * 100 * 10) / 10
          : 0,
      totalKwh: Math.round(totalKwh * 1000) / 1000,
      totalDecisions,
      carbonReductionMultiplier:
        totalChosen > 0
          ? Math.round((totalBaseline / totalChosen) * 100) / 100
          : null,
      dailyTrend,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Dashboard savings error:', error)
    res.status(500).json({ error: 'Failed to compute savings' })
  }
})

router.get('/methodology/providers', async (_req, res) => {
  try {
    const metrics = (await getIntegrationMetricsSummary()) as IntegrationMetricRecord[]
    const bySource = new Map<string, IntegrationMetricRecord>(
      metrics.map((metric: IntegrationMetricRecord) => [metric.source, metric])
    )

    const providers = [
      ['WattTime', 'WATTTIME'],
      ['GridStatus EIA-930', 'GRIDSTATUS'],
      ['Ember', 'EMBER'],
      ['GB Carbon Intensity', 'GB_CARBON'],
      ['DK Carbon', 'DK_CARBON'],
      ['FI Carbon', 'FI_CARBON'],
    ].map(([name, source]) => {
      const metric = bySource.get(source)
      const successRate = metric ? computeIntegrationSuccessRate(metric) : null
      const stalenessSec = metric?.lastSuccessAt
        ? Math.max(0, Math.floor((Date.now() - metric.lastSuccessAt.getTime()) / 1000))
        : null

      return {
        name,
        status:
          metric == null
            ? 'offline'
            : metric.alertActive || (successRate ?? 0) < 0.8
              ? 'degraded'
              : 'healthy',
        latencyMs: metric?.lastLatencyMs != null ? Math.round(metric.lastLatencyMs) : null,
        lastLatencyMs: metric?.lastLatencyMs != null ? Math.round(metric.lastLatencyMs) : null,
        lastSuccessAt: metric?.lastSuccessAt?.toISOString() ?? null,
        stalenessSec,
        disagreementPct: null,
      }
    })

    return res.json({ providers })
  } catch (error) {
    console.error('Dashboard methodology providers error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }

  res.json({
    providers: [
      {
        name: 'WattTime',
        role: 'marginal_amplifier',
        signalType: 'MOER (Marginal Operating Emission Rate)',
        refreshRate: 'every 5 minutes',
        coverage: 'North America (balancing authorities)',
        confidence: 0.9,
        doctrinePosition: 'SECONDARY - marginal signal never used alone',
      },
      {
        name: 'Electricity Maps',
        role: 'primary_live_signal',
        signalType: 'Flow-traced carbon intensity',
        refreshRate: 'every 15-60 minutes',
        coverage: 'Global (200+ zones)',
        confidence: 0.7,
        doctrinePosition: 'PRIMARY - authoritative realtime intensity',
      },
      {
        name: 'Ember',
        role: 'validation_baseline',
        signalType: 'Structural carbon baseline (yearly/monthly)',
        refreshRate: 'monthly/yearly',
        coverage: 'Global (country-level)',
        confidence: 0.5,
        doctrinePosition: 'VALIDATION ONLY - never used for routing',
      },
      {
        name: 'EIA-930',
        role: 'predictive_telemetry',
        signalType: 'Grid balance, interchange, subregion demand',
        refreshRate: 'every 15 minutes',
        coverage: 'US balancing authorities',
        confidence: 0.75,
        doctrinePosition: 'TELEMETRY - derived features for spike/curtailment detection',
      },
      {
        name: 'GB Carbon Intensity',
        role: 'eu_primary_signal',
        signalType: 'National Grid carbon intensity (real-time + forecast)',
        refreshRate: 'every 30 minutes',
        coverage: 'Great Britain',
        confidence: 0.85,
        doctrinePosition: 'PRIMARY - authoritative for GB regions',
      },
      {
        name: 'DK Carbon',
        role: 'eu_primary_signal',
        signalType: 'Energi Data Service CO2 intensity (real-time + forecast)',
        refreshRate: 'every hour',
        coverage: 'Denmark',
        confidence: 0.8,
        doctrinePosition: 'PRIMARY - authoritative for DK regions',
      },
      {
        name: 'FI Carbon',
        role: 'eu_primary_signal',
        signalType: 'Fingrid real-time carbon intensity',
        refreshRate: 'every 3 minutes',
        coverage: 'Finland',
        confidence: 0.85,
        doctrinePosition: 'PRIMARY - authoritative for FI regions',
      },
    ],
    doctrine: {
      principle: 'Lowest defensible signal, not lowest raw signal',
      averaging: 'No provider averaging - confidence-weighted blending only',
      fallback: 'Static 450 gCO2/kWh when all providers unavailable',
      auditability: 'Every decision records full provenance chain',
      regionStrategy: {
        'US': 'WattTime → EIA → Ember → Static',
        'EU': 'GB/DK/FI → Ember → Static',
        'GLOBAL': 'Ember → Static'
      }
    },
  })
})

router.post('/demo-seed', async (req, res) => {
  try {
    const regions = ['US-CAL-CISO', 'FR', 'DE', 'US-NEISO', 'JP-TK', 'SG']
    const now = new Date()
    const decisions = []

    for (let i = 0; i < 100; i++) {
      const ts = new Date(now.getTime() - i * 15 * 60000) // every 15 min for ~25 hours
      const baselineRegion = regions[Math.floor(Math.random() * regions.length)]
      const chosenRegion = regions[Math.floor(Math.random() * regions.length)]
      const baselineIntensity = 250 + Math.floor(Math.random() * 300)
      const chosenIntensity = 80 + Math.floor(Math.random() * 200)
      const kwh = 0.1 + Math.random() * 0.5

      decisions.push({
        ts,
        workloadName: ['ml-training', 'data-pipeline', 'video-encode', 'batch-process', 'api-inference'][Math.floor(Math.random() * 5)],
        opName: ['train-model', 'etl-job', 'transcode', 'batch-run', 'inference'][Math.floor(Math.random() * 5)],
        baselineRegion,
        chosenRegion,
        zoneBaseline: baselineRegion,
        zoneChosen: chosenRegion,
        carbonIntensityBaselineGPerKwh: baselineIntensity,
        carbonIntensityChosenGPerKwh: chosenIntensity,
        estimatedKwh: Math.round(kwh * 1000) / 1000,
        co2BaselineG: Math.round(baselineIntensity * kwh),
        co2ChosenG: Math.round(chosenIntensity * kwh),
        requestCount: 1,
        reason: 'carbon-optimization',
        meta: { source: 'demo-seed', iteration: i }
      })
    }

    let created = 0
    for (const d of decisions) {
      try {
        await persistLegacyCanonicalDecision({
          createdAt: d.ts,
          selectedRunner: 'demo-seed',
          workloadName: d.workloadName,
          opName: d.opName,
          baselineRegion: d.baselineRegion,
          chosenRegion: d.chosenRegion,
          carbonIntensityBaselineGPerKwh: d.carbonIntensityBaselineGPerKwh,
          carbonIntensityChosenGPerKwh: d.carbonIntensityChosenGPerKwh,
          estimatedKwh: d.estimatedKwh,
          reason: d.reason,
          requestCount: d.requestCount,
          metadata: d.meta,
          jobType: 'demo',
        })
        created++
      } catch (e) {
        // Ignore duplicate or validation failures in demo seeding.
      }
    }

    res.json({
      success: true,
      created,
      message: `Seeded ${created} demo routing decisions across ${regions.length} regions`
    })
  } catch (error) {
    console.error('Demo seed error:', error)
    res.status(500).json({ error: 'Failed to seed demo data' })
  }
})

/**
 * GET /api/v1/dashboard/carbon-ledger-summary
 * Unified carbon ledger KPIs for the dashboard hero panel.
 * Combines CarbonLedgerEntry aggregates with provider freshness and capacity status.
 */
router.get('/carbon-ledger-summary', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Parallel queries
    const [allEntries, todayEntries, providerHealth, capacityStatus] = await Promise.all([
      prisma.carbonLedgerEntry.findMany({
        where: { createdAt: { gte: since } },
        select: {
          carbonSavedG: true,
          verifiedSavingsG: true,
          baselineCarbonG: true,
          chosenCarbonG: true,
          confidenceScore: true,
          qualityTier: true,
          jobClass: true,
          chosenRegion: true,
          createdAt: true,
          fallbackUsed: true,
          estimatedFlag: true,
          syntheticFlag: true,
          disagreementFlag: true,
          disagreementPct: true,
          carbonSpikeProbability: true,
          curtailmentProbability: true,
        },
      }),
      prisma.carbonLedgerEntry.findMany({
        where: { createdAt: { gte: today } },
        select: {
          carbonSavedG: true,
          verifiedSavingsG: true,
          baselineCarbonG: true,
          chosenCarbonG: true,
        },
      }),
      getProviderFreshness().catch(() => []),
      getCapacityOverview(24).catch(() => []),
    ])

    // Period totals
    const totalSavedG = allEntries.reduce((s: number, e: any) => s + e.carbonSavedG, 0)
    const totalVerifiedG = allEntries.reduce((s: number, e: any) => s + (e.verifiedSavingsG ?? 0), 0)
    const totalBaselineG = allEntries.reduce((s: number, e: any) => s + e.baselineCarbonG, 0)
    const totalChosenG = allEntries.reduce((s: number, e: any) => s + e.chosenCarbonG, 0)

    // Today totals
    const todaySavedG = todayEntries.reduce((s: number, e: any) => s + e.carbonSavedG, 0)
    const todayBaselineG = todayEntries.reduce((s: number, e: any) => s + e.baselineCarbonG, 0)

    // High confidence %
    const highConfidence = allEntries.filter((e: any) => (e.confidenceScore ?? 0) >= 0.7).length
    const highConfidencePct = allEntries.length > 0
      ? Math.round((highConfidence / allEntries.length) * 100 * 10) / 10
      : 0

    // Provider disagreement rate
    const disagreements = allEntries.filter((e: any) => e.disagreementFlag === true).length
    const disagreementRatePct = allEntries.length > 0
      ? Math.round((disagreements / allEntries.length) * 100 * 10) / 10
      : 0

    // Quality tier distribution
    const qualityTiers = { high: 0, medium: 0, low: 0 }
    for (const e of allEntries) {
      const tier = (e as any).qualityTier as string | null
      if (tier === 'high') qualityTiers.high++
      else if (tier === 'medium') qualityTiers.medium++
      else qualityTiers.low++
    }

    // Job class breakdown
    const jobClassMap = new Map<string, { count: number; savedG: number }>()
    for (const e of allEntries) {
      const jc = (e as any).jobClass as string
      const existing = jobClassMap.get(jc) || { count: 0, savedG: 0 }
      existing.count++
      existing.savedG += (e as any).carbonSavedG
      jobClassMap.set(jc, existing)
    }

    // Region breakdown (top 10)
    const regionMap = new Map<string, { count: number; savedG: number }>()
    for (const e of allEntries) {
      const r = (e as any).chosenRegion as string
      const existing = regionMap.get(r) || { count: 0, savedG: 0 }
      existing.count++
      existing.savedG += (e as any).carbonSavedG
      regionMap.set(r, existing)
    }

    // Daily trend
    const dailyMap = new Map<string, { savedG: number; jobs: number; spikeFlags: number; curtailmentFlags: number }>()
    for (const e of allEntries) {
      const date = (e as any).createdAt.toISOString().split('T')[0]
      const ex = dailyMap.get(date) || { savedG: 0, jobs: 0, spikeFlags: 0, curtailmentFlags: 0 }
      ex.savedG += (e as any).carbonSavedG
      ex.jobs++
      if (((e as any).carbonSpikeProbability ?? 0) > 0.5) ex.spikeFlags++
      if (((e as any).curtailmentProbability ?? 0) > 0.5) ex.curtailmentFlags++
      dailyMap.set(date, ex)
    }

    return res.json({
      period: `${days}d`,
      totalJobsRouted: allEntries.length,

      // Hero KPIs
      carbonReductionMultiplier: totalChosenG > 0
        ? Math.round((totalBaselineG / totalChosenG) * 100) / 100
        : null,
      carbonAvoidedTodayG: Math.round(todaySavedG),
      carbonAvoidedTodayKg: Math.round(todaySavedG / 1000 * 100) / 100,
      carbonAvoidedPeriodG: Math.round(totalSavedG),
      carbonAvoidedPeriodKg: Math.round(totalSavedG / 1000 * 100) / 100,
      carbonAvoidedPeriodTons: Math.round(totalSavedG / 1_000_000 * 1000) / 1000,
      verifiedSavingsG: Math.round(totalVerifiedG),
      averageReductionPct: totalBaselineG > 0
        ? Math.round((totalSavedG / totalBaselineG) * 100 * 10) / 10
        : 0,

      // Trust & Confidence KPIs
      highConfidenceDecisionPct: highConfidencePct,
      providerDisagreementRatePct: disagreementRatePct,
      qualityTierDistribution: qualityTiers,

      // Job Class Breakdown
      jobClassBreakdown: Array.from(jobClassMap.entries())
        .map(([jobClass, data]) => ({ jobClass, ...data, savedG: Math.round(data.savedG) }))
        .sort((a, b) => b.savedG - a.savedG),

      // Top regions
      topRegions: Array.from(regionMap.entries())
        .map(([region, data]) => ({ region, ...data, savedG: Math.round(data.savedG) }))
        .sort((a, b) => b.savedG - a.savedG)
        .slice(0, 10),

      // Daily trend
      dailyTrend: Array.from(dailyMap.entries())
        .map(([date, d]) => ({
          date,
          savedG: Math.round(d.savedG),
          jobs: d.jobs,
          carbonSpikeFlags: d.spikeFlags,
          curtailmentFlags: d.curtailmentFlags,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),

      // Provider health
      providerHealth,

      // Capacity status
      capacityOverview: capacityStatus,
    })
  } catch (error: any) {
    console.error('Carbon ledger summary error:', error)
    res.status(500).json({ error: 'Failed to compute carbon ledger summary' })
  }
})

/**
 * GET /api/v1/dashboard/carbon-ledger-decisions
 * Recent carbon ledger entries for the live decision stream panel.
 */
router.get('/carbon-ledger-decisions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)

    const entries = await prisma.carbonLedgerEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        orgId: true,
        decisionFrameId: true,
        jobClass: true,
        workloadType: true,
        baselineRegion: true,
        chosenRegion: true,
        baselineCarbonGPerKwh: true,
        chosenCarbonGPerKwh: true,
        energyEstimateKwh: true,
        carbonSavedG: true,
        confidenceScore: true,
        qualityTier: true,
        sourceUsed: true,
        fallbackUsed: true,
        estimatedFlag: true,
        syntheticFlag: true,
        rankScore: true,
        candidatesEvaluated: true,
        feasibleCandidates: true,
        createdAt: true,
      },
    })

    return res.json({
      count: entries.length,
      decisions: entries.map((e: any) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    })
  } catch (error: any) {
    console.error('Carbon ledger decisions error:', error)
    res.status(500).json({ error: 'Failed to fetch carbon ledger decisions' })
  }
})

/**
 * GET /api/v1/dashboard/provider-trust
 * Provider trust panel — freshness + signal provenance.
 */
router.get('/provider-trust', async (_req, res) => {
  try {
    const [freshness, recentSnapshots, waterProviderSnapshots] = await Promise.all([
      getProviderFreshness(),
      prisma.providerSnapshot.findMany({
        orderBy: { observedAt: 'desc' },
        take: 2000,
        select: {
          provider: true,
          zone: true,
          signalType: true,
          signalValue: true,
          confidence: true,
          freshnessSec: true,
          observedAt: true,
          metadata: true,
        },
      }),
      prisma.waterProviderSnapshot.findMany({
        orderBy: { observedAt: 'desc' },
        take: 100,
      }).catch(() => []),
    ])

    // Preserve the newest snapshot per provider/zone/signal-type combination so
    // the control plane sees the full upstream field instead of just the latest
    // globally dominant provider.
    const latestSnapshotByKey = new Map<string, (typeof recentSnapshots)[number]>()
    for (const snap of recentSnapshots) {
      const provider = normalizeProviderIdentity(snap.provider)
      const key = `${provider}:${snap.zone}:${snap.signalType}`
      if (!latestSnapshotByKey.has(key)) {
        latestSnapshotByKey.set(key, snap)
      }
    }

    const providerMap = new Map<string, any[]>()
    for (const snap of latestSnapshotByKey.values()) {
      const provider = normalizeProviderIdentity(snap.provider)
      const existing = providerMap.get(provider) || []
      existing.push({
        zone: snap.zone,
        signalType: snap.signalType,
        value: snap.signalValue,
          confidence: snap.confidence,
          freshnessSec: snap.freshnessSec,
          observedAt: snap.observedAt?.toISOString() ?? null,
          metadata: snap.metadata ?? null,
        })
      providerMap.set(provider, existing)
    }

    return res.json({
      freshness,
      providers: Object.fromEntries(providerMap),
      waterProviders: summarizeWaterProviderTrust(waterProviderSnapshots),
    })
  } catch (error: any) {
    console.error('Provider trust error:', error)
    res.status(500).json({ error: 'Failed to fetch provider trust data' })
  }
})

/**
 * GET /api/v1/dashboard/capacity-status
 * Capacity status panel for all regions.
 */
router.get('/capacity-status', async (req, res) => {
  try {
    const hoursAhead = parseInt(req.query.hours as string) || 24
    const overview = await getCapacityOverview(hoursAhead)

    return res.json({
      hoursAhead,
      regions: overview,
      generatedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Capacity status error:', error)
    res.status(500).json({ error: 'Failed to fetch capacity status' })
  }
})

router.get('/forecast-accuracy', async (req, res) => {
  try {
    const region = req.query.region as string | undefined
    const days = parseInt(req.query.days as string) || 30

    const { getAccuracyMetrics } = await import('../lib/forecast-accuracy')
    const metrics = await getAccuracyMetrics(region, days)

    res.json({
      timeRange: `${days}d`,
      region: region || 'all',
      ...metrics,
      target: { maxVariancePct: 12, description: 'Carbon forecast variance <= 12% vs realized intensity' },
    })
  } catch (error) {
    console.error('Forecast accuracy error:', error)
    res.status(500).json({ error: 'Failed to compute forecast accuracy' })
  }
})

export default router
