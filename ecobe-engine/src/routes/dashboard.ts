import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db'
import { electricityMaps } from '../lib/electricity-maps'
import { getIntegrationMetric, computeIntegrationSuccessRate } from '../lib/integration-metrics'
import { getForecastRefreshSummary, getLastForecastRefreshState } from '../lib/forecast-refresh'

const router = Router()

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

    const topChosenRegion = (topChosenRegionAgg[0] as any)?.chosenRegion ?? null

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

// ─── Carbon Savings Summary ───────────────────────────────────────────────────

const savingsQuerySchema = z.object({
  window: z.enum(['24h', '7d', '30d']).default('7d'),
})

/**
 * GET /api/v1/dashboard/savings
 *
 * Surfaces the "baseline vs actual" CO₂ delta across all routing decisions —
 * the primary proof metric that ECOBE is doing something real.
 *
 * Response includes:
 *  - totalCO2SavedG / totalCO2BaselineG
 *  - savingsPct
 *  - human-readable equivalents (km driven, tree-days)
 *  - per-region breakdown
 *  - daily trend buckets
 */
router.get('/savings', async (req, res) => {
  try {
    const { window } = savingsQuerySchema.parse(req.query)
    const windowHours = window === '30d' ? 24 * 30 : window === '7d' ? 24 * 7 : 24
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000)

    const decisions = await prisma.dashboardRoutingDecision.findMany({
      where: { createdAt: { gte: since } },
      select: {
        createdAt: true,
        chosenRegion: true,
        co2BaselineG: true,
        co2ChosenG: true,
        requestCount: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Aggregate totals
    let totalCO2BaselineG = 0
    let totalCO2ActualG = 0
    let totalCO2SavedG = 0

    for (const d of decisions) {
      const base = d.co2BaselineG ?? 0
      const actual = d.co2ChosenG ?? 0
      const saved = base - actual
      totalCO2BaselineG += base
      totalCO2ActualG += actual
      if (saved > 0) totalCO2SavedG += saved
    }

    const savingsPct =
      totalCO2BaselineG > 0 ? (totalCO2SavedG / totalCO2BaselineG) * 100 : 0

    // Human-readable equivalents
    // 0.21 kg CO2 per km driven (average passenger car, IPCC)
    // 1 tree absorbs ~21 kg CO2 per year → ~57.5 g CO2 per day
    const savedKg = totalCO2SavedG / 1000
    const kmDriven = savedKg / 0.21
    const treeDays = savedKg / 0.0575

    // Per-region breakdown
    const byRegionMap = new Map<
      string,
      { decisions: number; co2Saved: number; co2Baseline: number }
    >()

    for (const d of decisions) {
      const region = d.chosenRegion
      const base = d.co2BaselineG ?? 0
      const actual = d.co2ChosenG ?? 0
      const saved = base - actual > 0 ? base - actual : 0
      const prev = byRegionMap.get(region) ?? { decisions: 0, co2Saved: 0, co2Baseline: 0 }
      byRegionMap.set(region, {
        decisions: prev.decisions + 1,
        co2Saved: prev.co2Saved + saved,
        co2Baseline: prev.co2Baseline + base,
      })
    }

    const byRegion = Array.from(byRegionMap.entries())
      .map(([region, stats]) => ({
        region,
        decisions: stats.decisions,
        co2SavedG: Math.round(stats.co2Saved),
        co2BaselineG: Math.round(stats.co2Baseline),
        savingsPct:
          stats.co2Baseline > 0
            ? Math.round((stats.co2Saved / stats.co2Baseline) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.co2SavedG - a.co2SavedG)

    // Daily trend (bucket by calendar day)
    const bucketMap = new Map<string, { co2Saved: number; co2Baseline: number; decisions: number }>()

    for (const d of decisions) {
      const day = d.createdAt.toISOString().slice(0, 10)
      const base = d.co2BaselineG ?? 0
      const actual = d.co2ChosenG ?? 0
      const saved = base - actual > 0 ? base - actual : 0
      const prev = bucketMap.get(day) ?? { co2Saved: 0, co2Baseline: 0, decisions: 0 }
      bucketMap.set(day, {
        co2Saved: prev.co2Saved + saved,
        co2Baseline: prev.co2Baseline + base,
        decisions: prev.decisions + 1,
      })
    }

    const trend = Array.from(bucketMap.entries())
      .map(([date, stats]) => ({
        date,
        co2SavedG: Math.round(stats.co2Saved),
        co2BaselineG: Math.round(stats.co2Baseline),
        decisions: stats.decisions,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return res.json({
      window,
      windowHours,
      totalDecisions: decisions.length,
      totalCO2SavedG: Math.round(totalCO2SavedG),
      totalCO2BaselineG: Math.round(totalCO2BaselineG),
      totalCO2ActualG: Math.round(totalCO2ActualG),
      savingsPct: Math.round(savingsPct * 10) / 10,
      savedEquivalents: {
        kmDriven: Math.round(kmDriven),
        treeDays: Math.round(treeDays * 10) / 10,
        savedKg: Math.round(savedKg * 100) / 100,
      },
      byRegion,
      trend,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Dashboard savings error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/regions', async (_req, res) => {
  try {
    const regions = await prisma.region.findMany({
      where: { enabled: true },
      select: { code: true, name: true, country: true },
      orderBy: { code: 'asc' },
    })

    const enriched = await Promise.all(
      regions.map(async (r) => {
        const latest = await prisma.carbonIntensity.findFirst({
          where: { region: r.code },
          orderBy: { timestamp: 'desc' },
          select: { carbonIntensity: true, timestamp: true },
        })

        return {
          ...r,
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
