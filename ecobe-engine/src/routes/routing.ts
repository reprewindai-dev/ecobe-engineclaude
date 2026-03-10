import { Router } from 'express'
import { z } from 'zod'
import { routeGreen } from '../lib/green-routing'
import { saveDecisionSnapshot } from '../lib/decision-snapshot'
import { predictCleanWindow } from '../lib/carbon-window-prediction'
import { createLease, revalidateLease } from '../lib/decision-lease'
import { ingestDecision } from '../lib/decision-ingest'
import { emitDekesHandoff } from '../lib/dekes-handoff'
import { prisma } from '../lib/db'
import { logger } from '../lib/logger'

const router = Router()

const routingRequestSchema = z.object({
  // Core routing fields
  preferredRegions: z.array(z.string()).min(1).optional(),
  // DEKES alias for preferredRegions — identical semantics
  candidateRegions: z.array(z.string()).min(1).optional(),
  maxCarbonGPerKwh: z.number().positive().optional(),
  latencyMsByRegion: z.record(z.number()).optional(),
  carbonWeight: z.number().min(0).max(1).optional(),
  latencyWeight: z.number().min(0).max(1).optional(),
  costWeight: z.number().min(0).max(1).optional(),
  targetTime: z.string().datetime().optional().transform((v) => v ? new Date(v) : undefined),
  durationMinutes: z.number().positive().optional(),
  // First-class workload source context
  source: z.string().optional(),
  workloadType: z.string().optional(),
  policyMode: z.enum(['strict_carbon', 'balanced_ops', 'budget_recovery']).optional(),
  delayToleranceMinutes: z.number().int().min(0).max(1440).optional(),
  // organizationId from body supplements (but doesn't override) the header
  organizationId: z.string().optional(),
}).refine(
  (d) => (d.preferredRegions ?? d.candidateRegions) !== undefined,
  { message: 'preferredRegions or candidateRegions is required' },
)

router.post('/green', async (req, res) => {
  try {
    const data = routingRequestSchema.parse(req.body)

    // Resolve regions: preferredRegions (existing) or candidateRegions (DEKES alias)
    const regions: string[] = (data.preferredRegions ?? data.candidateRegions)!

    // Org context — header takes precedence; body organizationId is fallback for DEKES
    const organizationId: string | undefined =
      (req as any).resolvedOrgId
      ?? (req.headers['x-organization-id'] as string | undefined)
      ?? data.organizationId

    // Policy enforcement — if org has a policy, apply it as an additional carbon ceiling
    let enforcedMaxCarbon = data.maxCarbonGPerKwh
    let requireGreen = false
    let delayWindowMinutes = 0

    if (organizationId) {
      const policy = await (prisma as any).organizationPolicy.findUnique({
        where: { organizationId },
        select: {
          maxCarbonGPerKwh: true,
          requireGreenRouting: true,
        },
      }).catch(() => null)

      if (policy) {
        if (policy.maxCarbonGPerKwh && (!enforcedMaxCarbon || policy.maxCarbonGPerKwh < enforcedMaxCarbon)) {
          enforcedMaxCarbon = policy.maxCarbonGPerKwh
        }
        requireGreen = policy.requireGreenRouting ?? false
        delayWindowMinutes = 120 // default delay search window when policy blocks immediate run
      }
    }

    const result = await routeGreen({
      ...data,
      preferredRegions: regions,
      maxCarbonGPerKwh: enforcedMaxCarbon,
      policyMode: data.policyMode,
    })

    // Policy gate: if org requires green routing and the best available region still
    // violates the ceiling, return a delay recommendation instead of a route.
    if (requireGreen && enforcedMaxCarbon && result.carbonIntensity > enforcedMaxCarbon) {
      // Emit POLICY_DELAY event to DEKES — fire-and-forget, never blocks the response.
      if (organizationId) {
        void emitDekesHandoff({
          organizationId,
          decisionFrameId: result.decisionFrameId,
          eventType: 'POLICY_DELAY',
          severity: 'medium',
          routing: {
            selectedRegion:  result.selectedRegion,
            carbonIntensity: result.carbonIntensity,
            qualityTier:     result.qualityTier,
          },
          policy: {
            maxCarbonGPerKwh:    enforcedMaxCarbon,
            requireGreenRouting: true,
            actionTaken:         'delay',
            retryAfterMinutes:   delayWindowMinutes,
          },
          explanation: `All regions exceed policy ceiling of ${enforcedMaxCarbon} gCO2/kWh. Best available: ${result.selectedRegion} at ${result.carbonIntensity} gCO2/kWh. Retry after ${delayWindowMinutes} minutes.`,
        })
      }

      return res.status(202).json({
        action: 'delay',
        reason: 'carbon_policy_violation',
        policy: {
          maxCarbonGPerKwh: enforcedMaxCarbon,
          requireGreenRouting: true,
        },
        currentBest: {
          region: result.selectedRegion,
          carbonIntensity: result.carbonIntensity,
        },
        retryAfterMinutes: delayWindowMinutes,
        message: `All regions exceed policy ceiling of ${enforcedMaxCarbon} gCO2/kWh. Retry after ${delayWindowMinutes} minutes.`,
      })
    }

    // Window prediction — non-blocking; attaches to response when data is available
    const windowPrediction = await predictCleanWindow(
      regions,
      result.selectedRegion,
      result.carbonIntensity,
    ).catch(() => null)

    // Persist decision snapshot for replay (fire-and-forget)
    let leaseFields: import('../lib/decision-lease').LeaseFields | null = null

    if (result.decisionFrameId) {
      const signalSnapshot = Object.fromEntries(
        regions.map((region) => {
          const alt = result.alternatives.find((a) => a.region === region)
          const isSelected = region === result.selectedRegion
          return [region, {
            intensity: isSelected ? result.carbonIntensity : (alt?.carbonIntensity ?? 0),
            source: null,
            fallbackUsed: false,
            disagreementFlag: isSelected ? (result.provider_disagreement?.flag ?? null) : null,
          }]
        }),
      )
      void saveDecisionSnapshot({
        decisionFrameId: result.decisionFrameId,
        organizationId,
        request: { ...data, preferredRegions: regions },
        result,
        signalSnapshot,
        source:                data.source,
        workloadType:          data.workloadType,
        policyMode:            data.policyMode,
        delayToleranceMinutes: data.delayToleranceMinutes,
        predictedCleanWindow:  windowPrediction ?? null,
      })

      // Create execution lease (fire-and-forget — don't block the response)
      leaseFields = await createLease(
        result.decisionFrameId,
        organizationId,
        result,
        { ...data, preferredRegions: regions },
        { source: data.source, workloadType: data.workloadType },
      ).catch(() => null)

      // Auto-write to DashboardRoutingDecision so savings/integrity metrics are populated
      // regardless of whether the client also calls POST /api/v1/decisions.
      // Uses decisionFrameId for deduplication — safe if client enriches later.
      const allIntensities = [result.carbonIntensity, ...result.alternatives.map((a) => a.carbonIntensity)]
      const baselineCI = Math.max(...allIntensities)
      const baselineRegion =
        result.alternatives.find((a) => a.carbonIntensity === baselineCI)?.region ?? regions[0]!

      void ingestDecision({
        organizationId,
        decisionFrameId: result.decisionFrameId,
        baselineRegion,
        chosenRegion: result.selectedRegion,
        carbonIntensityBaselineGPerKwh: Math.round(baselineCI),
        carbonIntensityChosenGPerKwh: Math.round(result.carbonIntensity),
        explanation: result.explanation,
        fallbackUsed: signalSnapshot[result.selectedRegion]?.fallbackUsed ?? false,
        sourceUsed: signalSnapshot[result.selectedRegion]?.source ?? undefined,
        workloadName: data.source ?? undefined,
        meta: {
          source: data.source,
          workloadType: data.workloadType,
          policyMode: data.policyMode,
        },
      })
    }

    res.json({
      action: 'execute',
      ...result,
      ...(windowPrediction ? { predicted_clean_window: windowPrediction } : {}),
      ...(leaseFields ?? {}),
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    logger.error({ err: error }, 'Green routing error')
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/v1/route/:id/revalidate — check whether a leased decision is still valid
// before a queued workload executes. Prevents execution drift.
router.post('/:id/revalidate', async (req, res) => {
  try {
    const callerOrgId: string | undefined =
      (req as any).resolvedOrgId ?? (req.headers['x-organization-id'] as string | undefined)

    const result = await revalidateLease(req.params.id, callerOrgId)

    const status = result.action === 'deny' ? 403 : 200
    return res.status(status).json(result)
  } catch (error) {
    logger.error({ err: error }, 'Lease revalidation error')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/route/:id/replay — reconstruct any past routing decision
router.get('/:id/replay', async (req, res) => {
  try {
    const snapshot = await (prisma as any).decisionSnapshot.findUnique({
      where: { id: req.params.id },
    })

    if (!snapshot) {
      return res.status(404).json({ error: 'Decision snapshot not found' })
    }

    // Org isolation: if the request has an org context, only allow access to that org's snapshots
    const callerOrgId: string | undefined =
      (req as any).resolvedOrgId ?? (req.headers['x-organization-id'] as string | undefined)
    if (callerOrgId && snapshot.organizationId && snapshot.organizationId !== callerOrgId) {
      return res.status(403).json({ error: 'Access denied' })
    }

    res.json({
      decisionFrameId: snapshot.id,
      replayedAt: new Date().toISOString(),

      // Inputs at decision time
      request: {
        regions: snapshot.regions,
        targetTime: snapshot.targetTime,
        durationMinutes: snapshot.durationMinutes,
        maxCarbonGPerKwh: snapshot.maxCarbonGPerKwh,
        weights: snapshot.weights,
      },

      // Signal state at decision time
      signals: snapshot.signalSnapshot,

      // Decision output
      selectedRegion: snapshot.selectedRegion,
      carbonIntensity: snapshot.carbonIntensity,
      baselineIntensity: snapshot.baselineIntensity,
      carbon_delta_g_per_kwh: snapshot.carbonDeltaGPerKwh,
      qualityTier: snapshot.qualityTier,
      forecast_stability: snapshot.forecastStability,
      score: snapshot.score,
      explanation: snapshot.explanation,

      // Provenance
      sourceUsed: snapshot.sourceUsed,
      referenceTime: snapshot.referenceTime,
      fallbackUsed: snapshot.fallbackUsed,
      providerDisagreement: snapshot.providerDisagreement,

      // Workload source context
      source:               snapshot.source,
      workloadType:         snapshot.workloadType,
      policyMode:           snapshot.policyMode,
      delayToleranceMinutes: snapshot.delayToleranceMinutes,
      predictedCleanWindow: snapshot.predictedCleanWindow,

      createdAt: snapshot.createdAt,
    })
  } catch (error) {
    logger.error({ err: error }, 'Decision replay error')
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
