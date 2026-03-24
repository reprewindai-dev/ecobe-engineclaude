import { Router } from 'express'
import { z } from 'zod'
import { routeGreen } from '../lib/green-routing'
import { prisma } from '../lib/db'
import { DEFAULT_ROUTING_WEIGHTS } from '../lib/methodology'
import { CarbonBudgetViolationError } from '../lib/routing'
import { WaterGuardrailViolationError } from '../lib/water/signals'
import {
  requireActiveOrganization,
  getOrCreateUsageCounter,
  assertCommandQuota,
  usagePeriod,
  incrementOrgUsage,
  OrganizationError,
} from '../lib/organizations'

const router = Router()

const waterSignalSchema = z.object({
  region: z.string().min(1),
  waterIntensityLPerKwh: z.number().nonnegative(),
  waterStressIndex: z.number().nonnegative(),
  waterQualityIndex: z.number().nonnegative().optional().nullable(),
  droughtRiskIndex: z.number().nonnegative().optional().nullable(),
  scarcityCfMonthly: z.number().nonnegative().optional().nullable(),
  scarcityCfAnnual: z.number().nonnegative().optional().nullable(),
  siteWaterIntensityLPerKwh: z.number().nonnegative().optional().nullable(),
  source: z.string().min(1),
  referenceTime: z.string().datetime().optional().nullable(),
  dataQuality: z.enum(['high', 'medium', 'low']).optional(),
  signalType: z
    .enum(['average_operational', 'scarcity_weighted_operational', 'site_measured', 'unknown'])
    .optional(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  datasetVersion: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
})

const routingRequestSchema = z.object({
  preferredRegions: z.array(z.string()).min(1),
  maxCarbonGPerKwh: z.number().positive().optional(),
  latencyMsByRegion: z.record(z.number()).optional(),
  costIndexByRegion: z.record(z.number().positive()).optional(),
  carbonWeight: z.number().min(0).max(1).optional(),
  waterWeight: z.number().min(0).max(1).optional(),
  latencyWeight: z.number().min(0).max(1).optional(),
  costWeight: z.number().min(0).max(1).optional(),
  mode: z.enum(['optimize', 'assurance']).optional(),
  policyMode: z.enum(['default', 'sec_disclosure_strict', 'eu_24x7_ready']).optional(),
  targetTime: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
  orgId: z.string().optional(), // Governance: when present, enforces quota
  workloadType: z.string().min(1).max(120).optional(),
  workloadName: z.string().min(1).max(160).optional(),
  energyEstimateKwh: z.number().positive().max(100000).optional(),
  criticality: z.enum(['critical', 'standard', 'deferable']).optional(),
  waterPolicyProfile: z
    .enum(['default', 'drought_sensitive', 'eu_data_center_reporting', 'high_water_sensitivity'])
    .optional(),
  waterSignalsByRegion: z.record(waterSignalSchema).optional(),
})

router.post('/green', async (req, res) => {
  try {
    const data = routingRequestSchema.parse(req.body)

    // ── Governance: Budget enforcement ──────────────────────────────────
    // When orgId is provided, enforce command quota before routing.
    // This ensures green-routing has the same budget governance as carbon-command.
    if (data.orgId) {
      const org = await requireActiveOrganization(data.orgId)
      const periodStart = usagePeriod()
      const usage = await getOrCreateUsageCounter(org.id, periodStart)
      assertCommandQuota(org, usage)

      // Increment usage after routing succeeds (fire-and-forget with retry in incrementOrgUsage)
      const result = await routeGreen(data)

      void incrementOrgUsage(org.id, periodStart, {
        commands: 1,
        lastCommandAt: new Date(),
      }).catch((err) => {
        console.error(`[governance] Usage increment failed for green-routing org ${org.id}:`, err)
      })

      return res.json(result)
    }

    // No orgId: route without budget enforcement (public/system calls)
    const result = await routeGreen(data)
    res.json(result)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    if (error instanceof OrganizationError) {
      const statusCode = error.code === 'QUOTA_EXCEEDED' ? 429 : error.code === 'ORG_NOT_FOUND' ? 404 : 403
      return res.status(statusCode).json({ error: error.message, code: error.code })
    }
    if (error instanceof CarbonBudgetViolationError) {
      return res.status(409).json({
        error: error.message,
        code: error.code,
        evaluations: error.evaluations,
      })
    }
    if (error instanceof WaterGuardrailViolationError) {
      return res.status(409).json({
        error: error.message,
        code: error.code,
        evaluations: error.evaluations,
      })
    }
    console.error('Green routing error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Replay a past routing decision by decisionFrameId
router.get('/:decisionFrameId/replay', async (req, res) => {
  try {
    const { decisionFrameId } = req.params

    // Try to find the decision in DashboardRoutingDecision first
    const decision = await prisma.dashboardRoutingDecision.findFirst({
      where: {
        meta: {
          path: ['decisionFrameId'],
          equals: decisionFrameId
        }
      }
    })

    if (!decision) {
      return res.status(404).json({ error: 'Decision frame not found' })
    }

    // Construct replay response with all grid signal fields
    const replayResult = {
      decisionFrameId,
      replayedAt: new Date().toISOString(),
      createdAt: decision.createdAt.toISOString(),
      organizationId: decision.workloadName ?? null,
      workloadType: decision.opName ?? null,
      source: (decision.meta as any)?.source ?? null,
      request: {
        regions: [decision.baselineRegion, decision.chosenRegion],
        targetTime: (decision.meta as any)?.targetTime ?? null,
        durationMinutes: (decision.meta as any)?.durationMinutes ?? null,
        maxCarbonGPerKwh: null,
        weights: {
          carbon: (decision.meta as any)?.weights?.carbon ?? DEFAULT_ROUTING_WEIGHTS.carbon,
          latency: (decision.meta as any)?.weights?.latency ?? DEFAULT_ROUTING_WEIGHTS.latency,
          cost: (decision.meta as any)?.weights?.cost ?? DEFAULT_ROUTING_WEIGHTS.cost,
        }
      },
      signals: {
        [decision.baselineRegion]: {
          intensity: decision.carbonIntensityBaselineGPerKwh ?? 0,
          source: decision.sourceUsed ?? 'unknown',
          fallbackUsed: decision.fallbackUsed ?? false,
          disagreementFlag: decision.disagreementFlag ?? false
        },
        [decision.chosenRegion]: {
          intensity: decision.carbonIntensityChosenGPerKwh ?? 0,
          source: decision.sourceUsed ?? 'unknown',
          fallbackUsed: decision.fallbackUsed ?? false,
          disagreementFlag: decision.disagreementFlag ?? false
        }
      },
      selectedRegion: decision.chosenRegion,
      carbonIntensity: decision.carbonIntensityChosenGPerKwh ?? 0,
      baselineIntensity: decision.carbonIntensityBaselineGPerKwh ?? 0,
      carbon_delta_g_per_kwh: (decision.carbonIntensityBaselineGPerKwh ?? 0) - (decision.carbonIntensityChosenGPerKwh ?? 0),
      qualityTier: (decision.meta as any)?.qualityTier ?? 'medium',
      mode: (decision.meta as any)?.mode ?? 'optimize',
      policyMode: (decision.meta as any)?.policyMode ?? 'default',
      signalTypeUsed: (decision.meta as any)?.signalTypeUsed ?? 'unknown',
      forecast_stability: (decision.meta as any)?.forecast_stability ?? null,
      score: (decision.meta as any)?.score ?? 0,
      explanation: decision.reason ?? '',
      sourceUsed: decision.sourceUsed ?? null,
      referenceTime: decision.referenceTime?.toISOString() ?? null,
      fallbackUsed: decision.fallbackUsed ?? false,
      providerDisagreement: decision.disagreementFlag ?? false,
      // Grid signal fields
      balancingAuthority: decision.balancingAuthority ?? null,
      demandRampPct: decision.demandRampPct ?? null,
      carbonSpikeProbability: decision.carbonSpikeProbability ?? null,
      curtailmentProbability: decision.curtailmentProbability ?? null,
      importCarbonLeakageScore: decision.importCarbonLeakageScore ?? null,
      // Data quality flags
      estimatedFlag: decision.estimatedFlag ?? false,
      syntheticFlag: decision.syntheticFlag ?? false,
      validationSource: decision.validationSource ?? null,
      disagreementPct: decision.disagreementPct ?? null,
      assurance: (decision.meta as any)?.assurance ?? null,
    }

    res.json(replayResult)
  } catch (error: any) {
    console.error('Replay error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
