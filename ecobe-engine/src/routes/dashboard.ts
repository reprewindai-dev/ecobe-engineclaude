import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db'
import { electricityMaps } from '../lib/electricity-maps'

const router = Router()

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

    const decisions = await prisma.dashboardRoutingDecision.findMany({
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

    const totalDecisions = decisions.length
    const totalRequests = decisions.reduce<number>((sum, d) => sum + (d.requestCount ?? 0), 0)

    const co2SavedG = decisions.reduce<number>((sum, d) => {
      const base = d.co2BaselineG ?? 0
      const chosen = d.co2ChosenG ?? 0
      const delta = base - chosen
      return sum + (delta > 0 ? delta : 0)
    }, 0)

    const greenRouteRate =
      totalDecisions > 0
        ? decisions.reduce<number>((sum, d) => {
            const base = d.co2BaselineG ?? 0
            const chosen = d.co2ChosenG ?? 0
            return sum + (base > chosen ? 1 : 0)
          }, 0) / totalDecisions
        : 0

    const fallbackRate =
      totalDecisions > 0
        ? decisions.reduce<number>((sum, d) => sum + (d.fallbackUsed ? 1 : 0), 0) / totalDecisions
        : 0

    const topChosenRegionAgg = await prisma.dashboardRoutingDecision.groupBy({
      by: ['chosenRegion'],
      where: { createdAt: { gte: since } },
      _count: { chosenRegion: true },
      orderBy: { _count: { chosenRegion: 'desc' } },
      take: 1,
    })

    const topChosenRegion = topChosenRegionAgg[0]?.chosenRegion ?? null

    const deltas = decisions
      .map((d) => {
        if (d.latencyActualMs === null || d.latencyActualMs === undefined) return null
        if (d.latencyEstimateMs === null || d.latencyEstimateMs === undefined) return null
        return d.latencyActualMs - d.latencyEstimateMs
      })
      .filter((v: number | null): v is number => typeof v === 'number' && Number.isFinite(v))
      .sort((a: number, b: number) => a - b)

    const p95LatencyDeltaMs = percentile(deltas, 0.95)

    const dataFreshnessMaxSeconds = decisions.reduce<number | null>((max, d) => {
      const v = d.dataFreshnessSeconds
      if (v === null || v === undefined) return max
      if (max === null) return v
      return v > max ? v : max
    }, null)

    const co2AvoidedPer1kRequestsG = totalRequests > 0 ? (co2SavedG / totalRequests) * 1000 : 0

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
      electricityMapsSuccessRate: null,
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
