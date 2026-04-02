import { randomUUID } from 'crypto'

import { Router } from 'express'
import { z } from 'zod'

import { persistLegacyCanonicalDecision } from '../lib/ci/legacy-canonical-ingest'
import { prisma } from '../lib/db'
import { routeGreen } from '../lib/green-routing'
import { redis } from '../lib/redis'
import { internalServiceGuard } from '../middleware/internal-auth'

const router = Router()

const createDecisionSchema = z.object({
  runId: z.string().min(1),
  orgId: z.string().min(1),
  projectId: z.string().min(1),
  providerConstraints: z.object({
    preferredRegions: z.array(z.string()).min(1).optional(),
    providers: z.array(z.string()).min(1).optional(),
  }).optional(),
  latencyCeiling: z.number().positive().optional(),
  costCeiling: z.number().positive().optional(),
  carbonPolicy: z.object({
    maxCarbonGPerKwh: z.number().positive().optional(),
  }).optional(),
  executionMetadata: z.record(z.any()).default({}),
})

router.use(internalServiceGuard)

router.get('/health', async (_req, res) => {
  let database = false
  let cache = false

  try {
    await prisma.$queryRaw`SELECT 1`
    database = true
  } catch {
    database = false
  }

  try {
    await redis.ping()
    cache = true
  } catch {
    cache = false
  }

  const providers = [
    { provider: 'openai', ready: true },
    { provider: 'anthropic', ready: true },
  ]

  const status = database ? 'healthy' : 'degraded'

  res.status(database ? 200 : 503).json({
    status,
    engine: 'ecobe-engine',
    timestamp: new Date().toISOString(),
    dependencies: {
      database,
      redis: cache,
    },
    providers,
  })
})

router.post('/routing-decisions', async (req, res) => {
  try {
    const payload = createDecisionSchema.parse(req.body)
    const preferredRegions =
      payload.providerConstraints?.preferredRegions ??
      (Array.isArray(payload.executionMetadata.preferredRegions)
        ? payload.executionMetadata.preferredRegions
        : ['US-CAL-CISO', 'US-EAST-1', 'FR'])

    const routingResult = await routeGreen({
      preferredRegions,
      maxCarbonGPerKwh: payload.carbonPolicy?.maxCarbonGPerKwh,
    })

    const selectedProvider = selectProvider(payload)
    const estimatedCost = estimateCostUsd(payload)
    const estimatedLatency = routingResult.estimatedLatency ?? estimateLatencyMs(payload.latencyCeiling)
    const satisfiable =
      (!payload.costCeiling || estimatedCost <= payload.costCeiling) &&
      (!payload.latencyCeiling || estimatedLatency <= payload.latencyCeiling)

    const decisionFrameId = routingResult.decisionFrameId ?? randomUUID()
    const decision = await persistLegacyCanonicalDecision({
      decisionFrameId,
      selectedRunner: 'internal-routing',
      workloadName: payload.projectId,
      opName: String(payload.executionMetadata.operation ?? 'governed-run'),
      baselineRegion: preferredRegions[0],
      chosenRegion: routingResult.selectedRegion,
      carbonIntensityBaselineGPerKwh:
        routingResult.alternatives[0]?.carbonIntensity ?? routingResult.carbonIntensity,
      carbonIntensityChosenGPerKwh: routingResult.carbonIntensity,
      estimatedKwh: Number(payload.executionMetadata.estimatedKwh ?? 0.08),
      fallbackUsed: routingResult.fallback_used ?? false,
      lowConfidence: Boolean(
        routingResult.estimatedFlag ||
          routingResult.syntheticFlag ||
          routingResult.provider_disagreement.flag
      ),
      reason: routingResult.explanation ?? 'Engine routing decision created',
      decisionAction: satisfiable ? 'run_now' : 'delay',
      decisionMode: 'runtime_authorization',
      latencyEstimateMs: estimatedLatency,
      requestCount: Number(payload.executionMetadata.requestCount ?? 1),
      sourceUsed: routingResult.source_used,
      validationSource: routingResult.validation_source,
      disagreementFlag: routingResult.provider_disagreement.flag,
      disagreementPct: routingResult.provider_disagreement.pct ?? undefined,
      estimatedFlag: routingResult.estimatedFlag ?? undefined,
      syntheticFlag: routingResult.syntheticFlag ?? undefined,
      balancingAuthority: routingResult.balancingAuthority,
      demandRampPct: routingResult.demandRampPct,
      carbonSpikeProbability: routingResult.carbonSpikeProbability,
      curtailmentProbability: routingResult.curtailmentProbability,
      importCarbonLeakageScore: routingResult.importCarbonLeakageScore,
      preferredRegions,
      carbonWeight: 1,
      metadata: {
        decisionId: decisionFrameId,
        runId: payload.runId,
        orgId: payload.orgId,
        projectId: payload.projectId,
        selectedProvider,
        estimatedCost,
        costCeiling: payload.costCeiling ?? null,
        latencyCeiling: payload.latencyCeiling ?? null,
        satisfiable,
        providerConstraints: payload.providerConstraints ?? {},
        executionMetadata: {
          ...payload.executionMetadata,
          latencyEstimateMs: estimatedLatency,
        },
        alternatives: routingResult.alternatives,
        qualityTier: routingResult.qualityTier,
        forecastStability: routingResult.forecast_stability,
      },
      jobType: 'internal',
    })

    const decisionMeta = (decision.metadata ?? {}) as Record<string, any>

    return res.status(201).json({
      decisionId: decision.decisionFrameId,
      canonicalId: decision.id,
      selectedProvider: decisionMeta.selectedProvider,
      selectedRegion: decision.selectedRegion,
      estimatedLatency: estimatedLatency,
      estimatedCost: decisionMeta.estimatedCost,
      carbonEstimate: decision.carbonIntensity,
      decisionReason: decision.recommendation,
      satisfiable: decisionMeta.satisfiable,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid engine routing request',
        details: error.errors,
      })
    }

    console.error('Internal routing decision error:', error)
    return res.status(500).json({ error: 'Internal engine error' })
  }
})

router.get('/routing-decisions/:decisionId', async (req, res) => {
  const decision = await prisma.cIDecision.findFirst({
    where: {
      OR: [{ decisionFrameId: req.params.decisionId }, { id: req.params.decisionId }],
    },
  })

  if (!decision) {
    return res.status(404).json({ error: 'Routing decision not found' })
  }

  const meta = (decision.metadata ?? {}) as Record<string, any>

  return res.json({
    decisionId: decision.decisionFrameId,
    canonicalId: decision.id,
    runId: meta.runId ?? null,
    orgId: meta.orgId ?? null,
    projectId: meta.projectId ?? null,
    selectedProvider: meta.selectedProvider ?? null,
    selectedRegion: decision.selectedRegion,
    estimatedLatency: meta.executionMetadata?.latencyEstimateMs ?? null,
    estimatedCost: meta.estimatedCost ?? null,
    decisionReason: decision.recommendation,
    satisfiable: meta.satisfiable ?? true,
    trace: {
      qualityTier: meta.qualityTier ?? null,
      forecastStability: meta.forecastStability ?? null,
      alternatives: meta.alternatives ?? [],
      providerConstraints: meta.providerConstraints ?? {},
      executionMetadata: meta.executionMetadata ?? {},
    },
  })
})

router.post('/routing-decisions/:decisionId/execute', async (req, res) => {
  const decision = await prisma.cIDecision.findFirst({
    where: {
      OR: [{ decisionFrameId: req.params.decisionId }, { id: req.params.decisionId }],
    },
  })

  if (!decision) {
    return res.status(404).json({ error: 'Routing decision not found' })
  }

  const meta = (decision.metadata ?? {}) as Record<string, any>
  const executionReference = `alloc_${randomUUID()}`

  await prisma.workloadDecisionOutcome.create({
    data: {
      workloadId: decision.decisionFrameId,
      region: decision.selectedRegion,
      carbonSaved: Number((decision.baseline ?? 0) - (decision.carbonIntensity ?? 0)),
      latency: Number(meta.executionMetadata?.latencyEstimateMs ?? 0),
      cost: Number(meta.estimatedCost ?? 0),
      success: true,
    },
  })

  await prisma.cIDecision.update({
    where: { id: decision.id },
    data: {
      metadata: {
        ...meta,
        executionReference,
        executedAt: new Date().toISOString(),
      } as any,
    },
  })

  return res.status(201).json({
    executionReference,
    status: 'allocated',
    provider: meta.selectedProvider ?? null,
    region: decision.selectedRegion,
  })
})

function selectProvider(payload: z.infer<typeof createDecisionSchema>) {
  const requested = payload.providerConstraints?.providers
  if (requested?.length) {
    return requested[0]
  }

  const model = String(payload.executionMetadata.model ?? '').toLowerCase()
  if (model.includes('claude') || model.includes('anthropic')) {
    return 'anthropic'
  }

  return 'openai'
}

function estimateCostUsd(payload: z.infer<typeof createDecisionSchema>) {
  const tokenCount = Number(payload.executionMetadata.tokenCount ?? 1000)
  const base = tokenCount / 100000
  const multiplier = payload.providerConstraints?.providers?.[0] === 'anthropic' ? 1.15 : 1
  return Number((base * multiplier).toFixed(4))
}

function estimateLatencyMs(latencyCeiling?: number) {
  if (!latencyCeiling) {
    return 180
  }

  return Math.min(latencyCeiling, 180)
}

export default router
