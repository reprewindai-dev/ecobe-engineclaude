import { Router } from 'express'
import { z } from 'zod'
import { routeGreen } from '../lib/green-routing'
import { saveDecisionSnapshot } from '../lib/decision-snapshot'
import { predictCleanWindow } from '../lib/carbon-window-prediction'
import { createLease, revalidateLease } from '../lib/decision-lease'
import { prisma } from '../lib/db'
import { logger } from '../lib/logger'

const router = Router()

const routingRequestSchema = z.object({
  preferredRegions: z.array(z.string()).min(1),
  maxCarbonGPerKwh: z.number().positive().optional(),
  latencyMsByRegion: z.record(z.number()).optional(),
  carbonWeight: z.number().min(0).max(1).optional(),
  latencyWeight: z.number().min(0).max(1).optional(),
  costWeight: z.number().min(0).max(1).optional(),
  targetTime: z.string().datetime().optional().transform((v) => v ? new Date(v) : undefined),
  durationMinutes: z.number().positive().optional(),
})

router.post('/green', async (req, res) => {
  try {
    const data = routingRequestSchema.parse(req.body)

    // Org context — set by auth middleware (org key) or governance middleware (X-Organization-Id)
    const organizationId: string | undefined =
      (req as any).resolvedOrgId ?? (req.headers['x-organization-id'] as string | undefined)

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

    const result = await routeGreen({ ...data, maxCarbonGPerKwh: enforcedMaxCarbon })

    // Policy gate: if org requires green routing and the best available region still
    // violates the ceiling, return a delay recommendation instead of a route.
    if (requireGreen && enforcedMaxCarbon && result.carbonIntensity > enforcedMaxCarbon) {
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
      data.preferredRegions,
      result.selectedRegion,
      result.carbonIntensity,
    ).catch(() => null)

    // Persist decision snapshot for replay (fire-and-forget)
    let leaseFields: import('../lib/decision-lease').LeaseFields | null = null

    if (result.decisionFrameId) {
      const signalSnapshot = Object.fromEntries(
        data.preferredRegions.map((region) => {
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
        request: data,
        result,
        signalSnapshot,
      })

      // Create execution lease (fire-and-forget — don't block the response)
      leaseFields = await createLease(
        result.decisionFrameId,
        organizationId,
        result,
        data,
      ).catch(() => null)
    }

    res.json({
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

      createdAt: snapshot.createdAt,
    })
  } catch (error) {
    logger.error({ err: error }, 'Decision replay error')
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
