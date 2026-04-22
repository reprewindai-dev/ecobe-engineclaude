import { Router } from 'express'
import { startOfMonth } from 'date-fns'
import { fingard } from '../services/fingard-control'
import { prisma } from '../lib/db'
import { z } from 'zod'

const router = Router()

const regionParamsSchema = z.object({
  region: z.string().min(1)
})

type LedgerKpiRow = {
  baselineCarbonG: number
  chosenCarbonG: number
  qualityTier?: string | null
  confidenceScore?: number | null
  disagreementFlag?: boolean | null
  disagreementPct?: number | null
  carbonSpikeProbability?: number | null
  curtailmentProbability?: number | null
  decisionFrameId?: string | null
}

type AccuracyKpiRow = {
  totalCommands: number
  avgEmissionsVariancePct: number
}

type UsageCounterKpiRow = {
  orgId: string
  commandCount: number
  organization: {
    id: string
    slug: string
    name: string
    status: 'ACTIVE' | 'SUSPENDED'
    monthlyCommandLimit: number
  }
}

type OrgKpiRow = {
  id: string
  slug: string
  name: string
  status: 'ACTIVE' | 'SUSPENDED'
  monthlyCommandLimit: number
}

type TraceKpiRow = {
  decisionFrameId: string
}

/**
 * Get current carbon intensity for a specific region
 * This endpoint is used by the dashboard to display real-time data
 */
router.get('/regions/:region/current', async (req, res) => {
  try {
    const { region } = regionParamsSchema.parse(req.params)
    
    const fingardDecision = await fingard.getNormalizedSignal(region, new Date())
    const signal = fingardDecision.signal

    // Extract additional grid data if available
    const demand = signal.metadata?.demandRampPct 
      ? `${(signal.metadata.demandRampPct as number * 100).toFixed(1)}%`
      : 'Loading...'
    
    const renewable = signal.metadata?.renewableRatio
      ? `${(signal.metadata.renewableRatio as number * 100).toFixed(1)}%`
      : 'Loading...'

    const response = {
      region,
      carbonIntensity: signal.carbonIntensity,
      demand,
      renewable,
      confidence: signal.confidence,
      source: signal.provenance.provider,
      timestamp: signal.timestamp,
      isForecast: signal.isForecast,
      estimatedFlag: signal.estimatedFlag,
      syntheticFlag: signal.syntheticFlag,
      trustLevel: signal.provenance.trustLevel,
      fallbackUsed: signal.provenance.fallbackUsed,
      degraded: signal.provenance.degraded,
      providerStatus: fingardDecision.providerStatus,
      arbitrationLog: fingardDecision.arbitrationLog
    }

    res.json(response)
  } catch (error) {
    console.error(`Region ${req.params.region} current data error:`, error)
    
    // Return fallback data
    res.json({
      region: req.params.region,
      carbonIntensity: 400,
      demand: 'Unknown',
      renewable: 'Unknown',
      confidence: 0.3,
      source: 'static',
      timestamp: new Date().toISOString(),
      isForecast: false,
      estimatedFlag: false,
      syntheticFlag: true,
      trustLevel: 'low' as const,
      fallbackUsed: true,
      degraded: true,
      providerStatus: { static: 'available' as const },
      arbitrationLog: ['All providers failed, using static fallback']
    })
  }
})

/**
 * Get KPIs for dashboard
 * This endpoint provides the required dashboard KPIs
 */
router.get('/dashboard/kpis', async (req, res) => {
  try {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const startOfMonthBoundary = startOfMonth(now)

    const [monthEntries, todayEntries, accuracyRows, usageCounters, organizations, tracedLedgerFrames] =
      await Promise.all([
        prisma.carbonLedgerEntry.findMany({
          where: { createdAt: { gte: startOfMonthBoundary } },
          select: {
            baselineCarbonG: true,
            chosenCarbonG: true,
            qualityTier: true,
            confidenceScore: true,
            disagreementFlag: true,
            disagreementPct: true,
            carbonSpikeProbability: true,
            curtailmentProbability: true,
            decisionFrameId: true,
          },
        }),
        prisma.carbonLedgerEntry.findMany({
          where: { createdAt: { gte: startOfDay } },
          select: {
            baselineCarbonG: true,
            chosenCarbonG: true,
          },
        }),
        prisma.carbonCommandAccuracyDaily.findMany({
          where: { date: { gte: startOfMonthBoundary } },
          select: {
            totalCommands: true,
            avgEmissionsVariancePct: true,
          },
        }),
        prisma.orgUsageCounter.findMany({
          where: { periodStart: { gte: startOfMonthBoundary } },
          include: {
            organization: {
              select: {
                id: true,
                slug: true,
                name: true,
                status: true,
                monthlyCommandLimit: true,
              },
            },
          },
        }),
        prisma.organization.findMany({
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            monthlyCommandLimit: true,
          },
        }),
        prisma.decisionTraceEnvelope.findMany({
          where: {
            createdAt: { gte: startOfMonthBoundary },
          },
          select: {
            decisionFrameId: true,
          },
        }),
      ]) as [
        LedgerKpiRow[],
        LedgerKpiRow[],
        AccuracyKpiRow[],
        UsageCounterKpiRow[],
        OrgKpiRow[],
        TraceKpiRow[],
      ]

    const aggregateSavings = (entries: LedgerKpiRow[]) =>
      entries.reduce((sum: number, entry: LedgerKpiRow) => sum + Math.max(0, entry.baselineCarbonG - entry.chosenCarbonG), 0)

    const totalBaselineG = monthEntries.reduce((sum: number, entry: LedgerKpiRow) => sum + entry.baselineCarbonG, 0)
    const totalChosenG = monthEntries.reduce((sum: number, entry: LedgerKpiRow) => sum + entry.chosenCarbonG, 0)
    const totalSavedMonthG = aggregateSavings(monthEntries)
    const totalSavedTodayG = aggregateSavings(todayEntries)

    const highConfidenceCount = monthEntries.filter((entry: LedgerKpiRow) =>
      entry.qualityTier === 'high' || (entry.confidenceScore ?? 0) >= 0.8
    ).length
    const disagreementCount = monthEntries.filter((entry: LedgerKpiRow) =>
      Boolean(entry.disagreementFlag) || ((entry.disagreementPct ?? 0) > 0)
    ).length
    const curtailmentOpportunityCount = monthEntries.filter((entry: LedgerKpiRow) =>
      (entry.curtailmentProbability ?? 0) >= 0.5
    ).length
    const spikeRiskValues = monthEntries
      .map((entry: LedgerKpiRow) => entry.carbonSpikeProbability)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

    const totalAccuracyCommands = accuracyRows.reduce((sum: number, row: AccuracyKpiRow) => sum + row.totalCommands, 0)
    const weightedVariance =
      totalAccuracyCommands > 0
        ? accuracyRows.reduce((sum: number, row: AccuracyKpiRow) => sum + row.avgEmissionsVariancePct * row.totalCommands, 0) /
          totalAccuracyCommands
        : null

    const usageByOrg = usageCounters.reduce((acc: Record<string, number>, counter: UsageCounterKpiRow) => {
      const key = counter.organization.slug || counter.organization.name || counter.orgId
      acc[key] = (acc[key] ?? 0) + counter.commandCount
      return acc
    }, {} as Record<string, number>)

    const uniqueDecisionFrameIds = new Set(
      monthEntries
        .map((entry) => entry.decisionFrameId)
        .filter((value: string | null | undefined): value is string => typeof value === 'string' && value.length > 0)
    )
    const replayAvailability =
      uniqueDecisionFrameIds.size > 0
        ? Number(
          (
              (tracedLedgerFrames.filter((trace: TraceKpiRow) => uniqueDecisionFrameIds.has(trace.decisionFrameId)).length /
                uniqueDecisionFrameIds.size) *
              100
            ).toFixed(2)
          )
        : 0

    const activeOrganizations = organizations.filter((org: OrgKpiRow) => org.status === 'ACTIVE')
    const suspendedOrganizations = organizations.filter((org: OrgKpiRow) => org.status === 'SUSPENDED')
    const overLimitOrganizations = usageCounters.filter((counter: UsageCounterKpiRow) => {
      const limit = counter.organization.monthlyCommandLimit ?? 0
      return limit > 0 && counter.commandCount > limit
    })

    const billingStatus = suspendedOrganizations.length > 0
      ? 'suspended'
      : overLimitOrganizations.length > 0
        ? 'over_limit'
        : activeOrganizations.length > 0
          ? 'active'
          : 'unavailable'

    const kpis = {
      carbonReductionMultiplier:
        totalChosenG > 0 ? Number((totalBaselineG / totalChosenG).toFixed(2)) : null,
      carbonAvoidedToday: Number((totalSavedTodayG / 1000).toFixed(2)),
      carbonAvoidedThisMonth: Number((totalSavedMonthG / 1000).toFixed(2)),
      highConfidenceDecisionPct:
        monthEntries.length > 0
          ? Number(((highConfidenceCount / monthEntries.length) * 100).toFixed(2))
          : 0,
      providerDisagreementRatePct:
        monthEntries.length > 0
          ? Number(((disagreementCount / monthEntries.length) * 100).toFixed(2))
          : 0,
      forecastAccuracyVsRealized:
        weightedVariance === null
          ? null
          : Number(Math.max(0, 100 - weightedVariance).toFixed(2)),
      curtailmentOpportunityDetection: curtailmentOpportunityCount,
      carbonSpikeRisk:
        spikeRiskValues.length > 0
          ? Number(
              (
                spikeRiskValues.reduce((sum, value) => sum + value, 0) / spikeRiskValues.length * 100
              ).toFixed(2)
            )
          : null,
      perOrgCommandUsage: usageByOrg,
      billingStatus,
      replayAvailability,
    }

    res.json(kpis)
  } catch (error) {
    console.error('Dashboard KPIs error:', error)
    res.status(500).json({ error: 'Failed to fetch KPI data' })
  }
})

export default router
