import { Router } from 'express'
import { z } from 'zod'

import { prisma } from '../../lib/db'
import { GridSignalCache } from '../../lib/grid-signals/grid-signal-cache'
import { CurtailmentDetector } from '../../lib/grid-signals/curtailment-detector'
import { RampDetector } from '../../lib/grid-signals/ramp-detector'
import { InterchangeAnalyzer } from '../../lib/grid-signals/interchange-analyzer'

const router = Router()

const GridSummarySchema = z.object({
  timestamp: z.string(),
  regions: z.array(
    z.object({
      region: z.string(),
      balancingAuthority: z.string().nullable(),
      carbonIntensity: z.number().nullable(),
      source: z.string().nullable(),
      demandRampPct: z.number().nullable(),
      renewableRatio: z.number().nullable(),
      fossilRatio: z.number().nullable(),
      carbonSpikeProbability: z.number().nullable(),
      curtailmentProbability: z.number().nullable(),
      importCarbonLeakageScore: z.number().nullable(),
      signalQuality: z.enum(['high', 'medium', 'low']),
    }),
  ),
})

const OpportunitiesSchema = z.object({
  timestamp: z.string(),
  topCurtailmentWindows: z.array(
    z.object({
      region: z.string(),
      balancingAuthority: z.string().nullable(),
      startTime: z.string(),
      endTime: z.string(),
      curtailmentProbability: z.number(),
      expectedCarbonIntensity: z.number().nullable(),
      confidence: z.enum(['high', 'medium', 'low']),
    }),
  ),
  topCarbonSpikeRisks: z.array(
    z.object({
      region: z.string(),
      balancingAuthority: z.string().nullable(),
      carbonSpikeProbability: z.number(),
      expectedRampPct: z.number().nullable(),
      confidence: z.enum(['high', 'medium', 'low']),
    }),
  ),
})

const RegionDetailSchema = z.object({
  region: z.string(),
  balancingAuthority: z.string().nullable(),
  latest: z.object({
    timestamp: z.string(),
    demandRampPct: z.number().nullable(),
    renewableRatio: z.number().nullable(),
    fossilRatio: z.number().nullable(),
    netInterchangeMwh: z.number().nullable(),
    carbonSpikeProbability: z.number().nullable(),
    curtailmentProbability: z.number().nullable(),
    importCarbonLeakageScore: z.number().nullable(),
    signalQuality: z.enum(['high', 'medium', 'low']),
  }),
  history: z.array(
    z.object({
      timestamp: z.string(),
      demandRampPct: z.number().nullable(),
      renewableRatio: z.number().nullable(),
      fossilRatio: z.number().nullable(),
      carbonSpikeProbability: z.number().nullable(),
      curtailmentProbability: z.number().nullable(),
      importCarbonLeakageScore: z.number().nullable(),
      signalQuality: z.enum(['high', 'medium', 'low']),
    }),
  ),
})

const HeroMetricsSchema = z.object({
  timestamp: z.string(),
  carbonReductionMultiplier: z.number(),
  carbonAvoidedKgToday: z.number(),
  carbonAvoidedKgMonth: z.number(),
  highConfidenceDecisionPct: z.number(),
  providerDisagreementRatePct: z.number(),
})

const CLOUD_REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-northeast-1']

function normalizeSignalQuality(value: unknown): 'high' | 'medium' | 'low' {
  const quality = String(value ?? '').toLowerCase()
  if (quality === 'high' || quality === 'medium' || quality === 'low') return quality
  return 'medium'
}

function toStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()]
  }
  return undefined
}

async function getRegionMapping(region: string) {
  const { getRegionMapping: resolveRegionMapping } = await import('../../lib/grid-signals/region-mapping')
  return resolveRegionMapping(region)
}

async function getLatestSnapshots(region: string, baCode: string | null, take: number) {
  try {
    const cached = baCode
      ? (await GridSignalCache.getCachedSnapshots(baCode) || await GridSignalCache.getCachedSnapshots(region))
      : await GridSignalCache.getCachedSnapshots(region)
    if (cached && cached.length > 0) return cached
  } catch (error) {
    console.warn(`Grid cache lookup failed for ${region}:`, error)
  }

  try {
    return await prisma.gridSignalSnapshot.findMany({
      where: { region: baCode || region },
      orderBy: { timestamp: 'desc' },
      take,
    })
  } catch (error) {
    console.warn(`Grid DB lookup failed for ${region}:`, error)
    return []
  }
}

async function getRoutingSignal(region: string) {
  try {
    const { providerRouter } = await import('../../lib/carbon/provider-router')
    return await providerRouter.getRoutingSignal(region, new Date())
  } catch (error) {
    console.warn(`Routing signal fallback failed for ${region}:`, error)
    return null
  }
}

router.get('/summary', async (req, res) => {
  try {
    const targetRegions = toStringArray(req.query.regions) || CLOUD_REGIONS
    const regions = await Promise.all(
      targetRegions.map(async (region) => {
        try {
          const mapping = await getRegionMapping(region)
          const baCode = mapping?.balancingAuthority ?? null
          const snapshots = await getLatestSnapshots(region, baCode, 1)

          if (snapshots.length > 0) {
            const latest = snapshots[0] as any
            return {
              region,
              balancingAuthority: latest.balancingAuthority || baCode,
              carbonIntensity: null,
              source: 'eia-930',
              demandRampPct: latest.demandChangePct ?? null,
              renewableRatio: latest.renewableRatio ?? null,
              fossilRatio: latest.fossilRatio ?? null,
              carbonSpikeProbability: latest.carbonSpikeProbability ?? null,
              curtailmentProbability: latest.curtailmentProbability ?? null,
              importCarbonLeakageScore: latest.importCarbonLeakageScore ?? null,
              signalQuality: normalizeSignalQuality(latest.signalQuality),
            }
          }

          const signal = await getRoutingSignal(region)
          if (signal) {
            return {
              region,
              balancingAuthority: null,
              carbonIntensity: signal.carbonIntensity,
              source: signal.provenance?.sourceUsed ?? null,
              demandRampPct: null,
              renewableRatio: null,
              fossilRatio: null,
              carbonSpikeProbability: null,
              curtailmentProbability: null,
              importCarbonLeakageScore: null,
              signalQuality: normalizeSignalQuality(signal.confidence >= 0.7 ? 'high' : signal.confidence >= 0.4 ? 'medium' : 'low'),
            }
          }
        } catch (error) {
          console.warn(`Grid summary failed for ${region}:`, error)
        }

        return null
      }),
    )

    const response = {
      timestamp: new Date().toISOString(),
      regions: regions.filter((region): region is NonNullable<typeof region> => region !== null),
    }

    return res.json(GridSummarySchema.parse(response))
  } catch (error) {
    console.error('Grid summary error:', error)
    return res.json({
      timestamp: new Date().toISOString(),
      regions: [],
    })
  }
})

router.get('/opportunities', async (req, res) => {
  try {
    const targetRegions = toStringArray(req.query.regions) || ['PJM', 'ERCOT', 'CAISO', 'MISO', 'NYISO', 'ISO-NE', 'SPP']

    const allSnapshots = await Promise.all(
      targetRegions.map(async (region) => {
        const snapshots = await getLatestSnapshots(region, null, 48)
        return snapshots
      }),
    )

    const flatSnapshots = allSnapshots.flat().map((snapshot: any) => ({
      ...snapshot,
      timestamp: typeof snapshot.timestamp === 'string' ? snapshot.timestamp : snapshot.timestamp.toISOString(),
      signalQuality: normalizeSignalQuality(snapshot.signalQuality),
    }))

    if (flatSnapshots.length === 0) {
      return res.json({
        timestamp: new Date().toISOString(),
        topCurtailmentWindows: [],
        topCarbonSpikeRisks: [],
      })
    }

    const curtailmentWindows = CurtailmentDetector.getTopCurtailmentWindows(
      CurtailmentDetector.detectCurtailmentWindows(flatSnapshots as any, 0.6),
      5,
    )

    const curtailmentWithIntensity = curtailmentWindows.map((window) => ({
      ...window,
      expectedCarbonIntensity:
        window.confidence === 'high' ? CurtailmentDetector.estimateCurtailmentCarbonIntensity(window, 350) : null,
    }))

    const spikeRisks = RampDetector.getTopCarbonSpikeRisks(
      RampDetector.detectCarbonSpikeRisks(flatSnapshots as any, 0.7),
      5,
    )

    return res.json(
      OpportunitiesSchema.parse({
        timestamp: new Date().toISOString(),
        topCurtailmentWindows: curtailmentWithIntensity,
        topCarbonSpikeRisks: spikeRisks,
      }),
    )
  } catch (error) {
    console.error('Grid opportunities error:', error)
    return res.json({
      timestamp: new Date().toISOString(),
      topCurtailmentWindows: [],
      topCarbonSpikeRisks: [],
    })
  }
})

router.get('/region/:region', async (req, res) => {
  try {
    const { region } = req.params
    const hours = Number.parseInt(String(req.query.hours ?? '24'), 10) || 24
    const mapping = await getRegionMapping(region)
    const baCode = mapping?.balancingAuthority ?? null
    const queryRegion = baCode || region

    let latestSnapshot: any = null
    try {
      latestSnapshot = await prisma.gridSignalSnapshot.findFirst({
        where: { region: queryRegion },
        orderBy: { timestamp: 'desc' },
      })

      if (!latestSnapshot && baCode) {
        latestSnapshot = await prisma.gridSignalSnapshot.findFirst({
          where: { region },
          orderBy: { timestamp: 'desc' },
        })
      }
    } catch (error) {
      console.warn(`Region detail lookup failed for ${region}:`, error)
    }

    const history = await prisma.gridSignalSnapshot.findMany({
      where: {
        region: queryRegion,
        timestamp: {
          gte: new Date(Date.now() - hours * 60 * 60 * 1000),
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 48,
    }).catch((error: unknown) => {
      console.warn(`Region history lookup failed for ${region}:`, error)
      return []
    })

    if (!latestSnapshot) {
      const signal = await getRoutingSignal(region)
      if (signal) {
        return res.json(
          RegionDetailSchema.parse({
            region,
            balancingAuthority: baCode,
            latest: {
              timestamp: new Date().toISOString(),
              demandRampPct: null,
              renewableRatio: null,
              fossilRatio: null,
              netInterchangeMwh: null,
              carbonSpikeProbability: null,
              curtailmentProbability: null,
              importCarbonLeakageScore: null,
              signalQuality: normalizeSignalQuality(signal.confidence >= 0.7 ? 'high' : signal.confidence >= 0.4 ? 'medium' : 'low'),
            },
            history: [],
          }),
        )
      }

      return res.status(404).json({ error: 'Region not found' })
    }

    return res.json(
      RegionDetailSchema.parse({
        region,
        balancingAuthority: latestSnapshot.balancingAuthority ?? baCode,
        latest: {
          timestamp: latestSnapshot.timestamp.toISOString(),
          demandRampPct: latestSnapshot.demandChangePct ?? null,
          renewableRatio: latestSnapshot.renewableRatio ?? null,
          fossilRatio: latestSnapshot.fossilRatio ?? null,
          netInterchangeMwh: latestSnapshot.netInterchangeMwh ?? null,
          carbonSpikeProbability: latestSnapshot.carbonSpikeProbability ?? null,
          curtailmentProbability: latestSnapshot.curtailmentProbability ?? null,
          importCarbonLeakageScore: latestSnapshot.importCarbonLeakageScore ?? null,
          signalQuality: normalizeSignalQuality(latestSnapshot.signalQuality),
        },
        history: history.map((snapshot: any) => ({
          timestamp: typeof snapshot.timestamp === 'string' ? snapshot.timestamp : snapshot.timestamp.toISOString(),
          demandRampPct: snapshot.demandChangePct ?? null,
          renewableRatio: snapshot.renewableRatio ?? null,
          fossilRatio: snapshot.fossilRatio ?? null,
          carbonSpikeProbability: snapshot.carbonSpikeProbability ?? null,
          curtailmentProbability: snapshot.curtailmentProbability ?? null,
          importCarbonLeakageScore: snapshot.importCarbonLeakageScore ?? null,
          signalQuality: normalizeSignalQuality(snapshot.signalQuality),
        })),
      }),
    )
  } catch (error) {
    console.error('Region detail error:', error)
    return res.status(500).json({ error: 'Failed to fetch region details' })
  }
})

router.get('/hero-metrics', async (_req, res) => {
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [todayCommands, monthCommands, totalCommands, recentTraces] = await Promise.all([
      prisma.carbonCommand.findMany({
        where: {
          createdAt: { gte: todayStart },
          status: 'EXECUTED',
        },
      }).catch(() => []),
      prisma.carbonCommand.findMany({
        where: {
          createdAt: { gte: monthStart },
          status: 'EXECUTED',
        },
      }).catch(() => []),
      prisma.carbonCommand.findMany({
        where: { status: 'EXECUTED' },
      }).catch(() => []),
      prisma.carbonCommandTrace.findMany({
        where: {
          createdAt: { gte: monthStart },
        },
        select: { traceJson: true },
        take: 1000,
        orderBy: { createdAt: 'desc' },
      }).catch(() => []),
    ])

    const carbonAvoidedToday = todayCommands.reduce((sum: number, cmd: any) => sum + (cmd.estimatedSavingsKgCo2e || 0), 0)
    const carbonAvoidedMonth = monthCommands.reduce((sum: number, cmd: any) => sum + (cmd.estimatedSavingsKgCo2e || 0), 0)
    const baselineEmissions = totalCommands.reduce((sum: number, cmd: any) => {
      if (cmd.estimatedEmissionsKgCo2e && cmd.estimatedSavingsKgCo2e) {
        return sum + cmd.estimatedEmissionsKgCo2e + cmd.estimatedSavingsKgCo2e
      }
      return sum
    }, 0)
    const optimizedEmissions = totalCommands.reduce((sum: number, cmd: any) => sum + (cmd.estimatedEmissionsKgCo2e || 0), 0)
    const carbonReductionMultiplier = baselineEmissions > 0 ? baselineEmissions / Math.max(optimizedEmissions, 1) : 1
    const highConfidenceCount = totalCommands.filter((cmd: any) => cmd.confidence && cmd.confidence >= 0.8).length
    const highConfidencePct = totalCommands.length > 0 ? (highConfidenceCount / totalCommands.length) * 100 : 0

    let disagreementCount = 0
    for (const trace of recentTraces) {
      try {
        const traceData = typeof trace.traceJson === 'string' ? JSON.parse(trace.traceJson) : trace.traceJson
        if (traceData?.provenance?.disagreementFlag === true) disagreementCount++
      } catch {
        // ignore parse errors
      }
    }

    const disagreementRate = recentTraces.length > 0
      ? Math.round((disagreementCount / recentTraces.length) * 1000) / 10
      : 0

    return res.json(
      HeroMetricsSchema.parse({
        timestamp: new Date().toISOString(),
        carbonReductionMultiplier: Math.round(carbonReductionMultiplier * 10) / 10,
        carbonAvoidedKgToday: Math.round(carbonAvoidedToday * 10) / 10,
        carbonAvoidedKgMonth: Math.round(carbonAvoidedMonth * 10) / 10,
        highConfidenceDecisionPct: Math.round(highConfidencePct * 10) / 10,
        providerDisagreementRatePct: disagreementRate,
      }),
    )
  } catch (error) {
    console.error('Hero metrics error:', error)
    return res.json({
      timestamp: new Date().toISOString(),
      carbonReductionMultiplier: 1,
      carbonAvoidedKgToday: 0,
      carbonAvoidedKgMonth: 0,
      highConfidenceDecisionPct: 0,
      providerDisagreementRatePct: 0,
    })
  }
})

router.get('/import-leakage', async (req, res) => {
  try {
    const targetRegions = toStringArray(req.query.regions) || ['PJM', 'ERCOT', 'CAISO', 'MISO', 'NYISO', 'ISO-NE', 'SPP']
    const allSnapshots = await Promise.all(targetRegions.map(async (region) => getLatestSnapshots(region, null, 24)))
    const flatSnapshots = allSnapshots.flat().map((snapshot: any) => ({
      ...snapshot,
      timestamp: typeof snapshot.timestamp === 'string' ? snapshot.timestamp : snapshot.timestamp.toISOString(),
      signalQuality: normalizeSignalQuality(snapshot.signalQuality),
    }))

    if (flatSnapshots.length === 0) {
      return res.json({
        timestamp: new Date().toISOString(),
        topImportLeakages: [],
        summary: {},
      })
    }

    const { providerRouter } = await import('../../lib/carbon/provider-router')
    const neighborIntensities: Record<string, number> = {}
    await Promise.all(
      targetRegions.map(async (region) => {
        try {
          const signal = await providerRouter.getRoutingSignal(region, new Date())
          if (signal && signal.source !== 'fallback') {
            neighborIntensities[region] = signal.carbonIntensity
          }
        } catch {
          // heuristic fallback only
        }
      }),
    )

    const leakages = InterchangeAnalyzer.analyzeImportCarbonLeakage(flatSnapshots as any, neighborIntensities)
    const topLeakages = InterchangeAnalyzer.getTopImportLeakages(leakages, 10)

    return res.json({
      timestamp: new Date().toISOString(),
      topImportLeakages: topLeakages,
      summary: InterchangeAnalyzer.groupByRegion(leakages),
    })
  } catch (error) {
    console.error('Import leakage error:', error)
    return res.json({
      timestamp: new Date().toISOString(),
      topImportLeakages: [],
      summary: {},
    })
  }
})

router.get('/audit/:region', async (req, res) => {
  try {
    const { region } = req.params
    const hours = Number.parseInt(String(req.query.hours ?? '24'), 10) || 24
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)
    const endTime = new Date()

    const auditHistory = await prisma.integrationEvent.findMany({
      where: {
        source: `GRID_SIGNAL_${region}`,
        createdAt: { gte: startTime, lte: endTime },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }).catch(() => [])

    const auditRecords = auditHistory
      .map((event: any) => {
        try {
          return JSON.parse(event.message || '{}')
        } catch {
          return null
        }
      })
      .filter((record: any): record is any => record !== null)

    return res.json({
      region,
      timeRange: { start: startTime.toISOString(), end: endTime.toISOString() },
      records: auditRecords,
      totalRecords: auditRecords.length,
    })
  } catch (error) {
    console.error('Audit trail error:', error)
    return res.json({
      region: req.params.region,
      timeRange: { start: new Date().toISOString(), end: new Date().toISOString() },
      records: [],
      totalRecords: 0,
    })
  }
})

router.get('/structural-profile/:region', async (req, res) => {
  try {
    const { region } = req.params
    const { providerRouter } = await import('../../lib/carbon/provider-router')
    const profile = await providerRouter.getStructuralProfile(region)

    if (!profile) {
      return res.json({
        region,
        available: false,
        message: 'No Ember structural data available for this region',
      })
    }

    return res.json({
      region,
      available: true,
      profile,
    })
  } catch (error) {
    console.error('Structural profile error:', error)
    return res.json({
      region: req.params.region,
      available: false,
      message: 'No Ember structural data available for this region',
    })
  }
})

export default router
