import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db'
import { env } from '../config/env'
import { createDecision, persistCiDecisionResult } from './ci'
import {
  buildDekesArtifactLinks,
  buildDekesDecisionSurface,
  estimateDekesEnergyKwh,
  parseDekesHandoffNotes,
} from '../lib/dekes/canonical'

const router = Router()

// ── Auth guard ─────────────────────────────────────────────────────────────────
const DEKES_API_KEY =
  env.DEKES_API_KEY || process.env.ECOBE_API_KEY || process.env.ECOBE_ENGINE_API_KEY
const AUTO_HANDOFF_THRESHOLD = Number(process.env.DEKES_AUTO_HANDOFF_MIN_SCORE || 70)
const DEFAULT_HANDOFF_REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1']

type AutoHandoffPayload = {
  decisionFrameId: string
  proofHash: string
  decisionMode: string
  action: string
  legacyAction: string
  reasonCode: string
  selectedRegion: string
  selectedRunner: string
  proofId: string
  policyTrace: Record<string, unknown>
  carbonReductionPct: number
  waterImpactDeltaLiters: number
  estimatedEnergyKwh: number
  artifactLinks: ReturnType<typeof buildDekesArtifactLinks>
  latencyMs: {
    total: number
    compute: number
  }
}

function requireApiKey(req: any, res: any, next: any) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const token = auth.slice(7)
  if (!DEKES_API_KEY || token !== DEKES_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

function buildCandidateRegions(region?: string | null) {
  if (!region) return DEFAULT_HANDOFF_REGIONS
  const normalized = region.trim().toLowerCase()
  if (normalized.includes('eu')) return ['eu-west-1', 'eu-central-1', 'us-east-1']
  if (normalized.includes('apac') || normalized.includes('asia')) {
    return ['ap-southeast-1', 'ap-northeast-1', 'us-west-2']
  }
  return DEFAULT_HANDOFF_REGIONS
}

async function maybeCreateAutoHandoff(prospect: {
  id: string
  externalLeadId: string | null
  orgName: string | null
  orgRegion: string | null
  intentScore: number | null
}) {
  const qualificationScore = prospect.intentScore ?? 0
  if (qualificationScore < AUTO_HANDOFF_THRESHOLD) {
    return null
  }

  const candidateRegions = buildCandidateRegions(prospect.orgRegion)
  const started = Date.now()
  const estimatedEnergyKwh = 0.6
  const decisionResult = await createDecision({
    preferredRegions: candidateRegions,
    carbonWeight: 0.55,
    waterWeight: 0.3,
    latencyWeight: 0.1,
    costWeight: 0.05,
    jobType: 'light',
    criticality: 'standard',
    criticalPath: false,
    waterPolicyProfile: 'default',
    policyVersion: 'water_policy_v1',
    allowDelay: true,
    signalPolicy: 'marginal_first',
    estimatedEnergyKwh,
    metadata: {
      source: 'dekes_auto_handoff',
      prospectId: prospect.id,
      externalLeadId: prospect.externalLeadId,
      organizationName: prospect.orgName,
    },
  })
  const totalMs = Date.now() - started
  const response = await persistCiDecisionResult(decisionResult, {
    total: totalMs,
    compute: totalMs,
  })
  const decisionSurface = buildDekesDecisionSurface(response)

  const payload: AutoHandoffPayload = {
    decisionFrameId: response.decisionFrameId,
    proofHash: response.proofHash,
    decisionMode: response.decisionMode,
    action: response.decision,
    legacyAction: decisionSurface.legacyAction,
    reasonCode: response.reasonCode,
    selectedRegion: response.selectedRegion,
    selectedRunner: response.selectedRunner,
    proofId: response.proofRecord.job_id,
    policyTrace: response.policyTrace,
    carbonReductionPct: response.savings.carbonReductionPct,
    waterImpactDeltaLiters: response.savings.waterImpactDeltaLiters,
    estimatedEnergyKwh,
    artifactLinks: buildDekesArtifactLinks(response.decisionFrameId),
    latencyMs: {
      total: totalMs,
      compute: totalMs,
    },
  }

  await prisma.dekesWorkload.create({
    data: {
      dekesQueryId: prospect.externalLeadId ?? prospect.id,
      queryString: prospect.orgName ?? 'DEKES auto handoff',
      estimatedQueries: 1,
      estimatedResults: 1,
      carbonBudget: response.baseline.carbonIntensity,
      scheduledTime: new Date(),
      selectedRegion: response.selectedRegion,
      actualCO2: Number(
        ((response.selected.carbonIntensity * estimatedEnergyKwh) / 1000).toFixed(6)
      ),
      status: 'ROUTED',
      completedAt: new Date(),
    },
  })

  const handoff = await prisma.dekesHandoffEvent.create({
    data: {
      prospectId: prospect.id,
      externalLeadId: prospect.externalLeadId,
      status: 'PROOFED',
      qualificationScore,
      notes: JSON.stringify(payload),
    },
  })

  await prisma.integrationEvent.create({
    data: {
      source: 'DEKES_INTEGRATION',
      eventType: 'HANDOFF_PROOF_READY',
      message: JSON.stringify({
        handoffId: handoff.id,
        prospectId: prospect.id,
        externalLeadId: prospect.externalLeadId,
        decisionFrameId: payload.decisionFrameId,
        proofId: payload.proofId,
        selectedRegion: payload.selectedRegion,
        action: payload.action,
      }),
      success: true,
    },
  }).catch(() => {})

  return payload
}

// ── POST /api/v1/prospects ─────────────────────────────────────────────────────
// Receives prospect handoffs from DEKES SaaS
const prospectSchema = z.object({
  organization: z.object({
    name: z.string(),
    domain: z.string().nullish(),
    sizeLabel: z.string().nullish(),
    region: z.string().nullish(),
  }),
  intent: z.object({
    score: z.number(),
    reason: z.string(),
    keywords: z.array(z.string()).default([]),
  }),
  contact: z.object({
    name: z.string().nullish(),
    email: z.string().nullish(),
    linkedin: z.string().nullish(),
  }).optional(),
  source: z.object({
    leadId: z.string(),
    queryId: z.string().nullish(),
    runId: z.string().nullish(),
  }),
})

router.post('/prospects', requireApiKey, async (req, res) => {
  try {
    const data = prospectSchema.parse(req.body)

    const prospect = await prisma.dekesProspect.create({
      data: {
        orgName: data.organization.name,
        orgDomain: data.organization.domain ?? null,
        orgSizeLabel: data.organization.sizeLabel ?? null,
        orgRegion: data.organization.region ?? null,
        intentScore: data.intent.score,
        intentReason: data.intent.reason,
        intentKeywords: data.intent.keywords,
        contactName: data.contact?.name ?? null,
        contactEmail: data.contact?.email ?? null,
        contactLinkedin: data.contact?.linkedin ?? null,
        sourceLeadId: data.source.leadId,
        sourceQueryId: data.source.queryId ?? null,
        sourceRunId: data.source.runId ?? null,
        externalLeadId: data.source.leadId,
        status: 'RECEIVED',
      },
    })

    // Record integration event
    await prisma.integrationEvent.create({
      data: {
        source: 'DEKES_INTEGRATION',
        eventType: 'PROSPECT_RECEIVED',
        message: JSON.stringify({
          prospectId: prospect.id,
          org: data.organization.name,
          intentScore: data.intent.score,
        }),
        success: true,
      },
    }).catch(() => {})

    const autoHandoff = await maybeCreateAutoHandoff({
      id: prospect.id,
      externalLeadId: prospect.externalLeadId,
      orgName: prospect.orgName,
      orgRegion: prospect.orgRegion,
      intentScore: prospect.intentScore,
    }).catch(async (error: unknown) => {
      await prisma.dekesHandoffEvent.create({
        data: {
          prospectId: prospect.id,
          externalLeadId: prospect.externalLeadId,
          status: 'FAILED',
          qualificationScore: prospect.intentScore,
          notes: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      }).catch(() => {})
      await prisma.integrationEvent.create({
        data: {
          source: 'DEKES_INTEGRATION',
          eventType: 'HANDOFF_FAILED',
          message: JSON.stringify({
            prospectId: prospect.id,
            externalLeadId: prospect.externalLeadId,
            error: error instanceof Error ? error.message : String(error),
          }),
          success: false,
        },
      }).catch(() => {})
      return null
    })

    return res.status(201).json({
      id: prospect.id,
      status: 'RECEIVED',
      externalLeadId: prospect.externalLeadId,
      autoHandoff,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Create prospect error:', error)
    res.status(500).json({ error: 'Failed to create prospect' })
  }
})

// ── POST /api/v1/tenants ───────────────────────────────────────────────────────
// Receives tenant creation from DEKES SaaS
const tenantSchema = z.object({
  organizationName: z.string().min(1),
  externalOrgId: z.string().min(1),
  ownerEmail: z.string().email(),
  plan: z.string().optional(),
})

router.post('/tenants', requireApiKey, async (req, res) => {
  try {
    const data = tenantSchema.parse(req.body)

    // Upsert — if tenant already exists, update
    const tenant = await prisma.dekesTenant.upsert({
      where: { externalOrgId: data.externalOrgId },
      update: {
        organizationName: data.organizationName,
        ownerEmail: data.ownerEmail,
        plan: data.plan ?? 'FREE',
      },
      create: {
        externalOrgId: data.externalOrgId,
        organizationName: data.organizationName,
        ownerEmail: data.ownerEmail,
        plan: data.plan ?? 'FREE',
      },
    })

    // Record integration event
    await prisma.integrationEvent.create({
      data: {
        source: 'DEKES_INTEGRATION',
        eventType: 'TENANT_CREATED',
        message: JSON.stringify({
          tenantId: tenant.id,
          org: data.organizationName,
          plan: data.plan ?? 'FREE',
        }),
        success: true,
      },
    }).catch(() => {})

    return res.status(201).json({
      id: tenant.id,
      status: tenant.status,
      externalOrgId: tenant.externalOrgId,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Create tenant error:', error)
    res.status(500).json({ error: 'Failed to create tenant' })
  }
})

// ── POST /api/v1/demos ─────────────────────────────────────────────────────────
// Receives demo triggers from DEKES SaaS
const demoSchema = z.object({
  organizationName: z.string().min(1),
  contactEmail: z.string().email(),
  workloadSummary: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  metadata: z.record(z.unknown()).optional(),
})

router.post('/demos', requireApiKey, async (req, res) => {
  try {
    const data = demoSchema.parse(req.body)

    const demo = await prisma.dekesDemo.create({
      data: {
        organizationName: data.organizationName,
        contactEmail: data.contactEmail,
        workloadSummary: data.workloadSummary ?? null,
        priority: data.priority ?? 'medium',
        metadata: data.metadata ?? {},
        status: 'SCHEDULED',
      },
    })

    // Record integration event
    await prisma.integrationEvent.create({
      data: {
        source: 'DEKES_INTEGRATION',
        eventType: 'DEMO_TRIGGERED',
        message: JSON.stringify({
          demoId: demo.id,
          org: data.organizationName,
          priority: data.priority ?? 'medium',
        }),
        success: true,
      },
    }).catch(() => {})

    return res.status(201).json({
      id: demo.id,
      status: demo.status,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Trigger demo error:', error)
    res.status(500).json({ error: 'Failed to trigger demo' })
  }
})

// ── GET /api/v1/handoffs/:externalId ───────────────────────────────────────────
// Check handoff status by external lead ID
router.get('/handoffs/:externalId', requireApiKey, async (req, res) => {
  try {
    const { externalId } = req.params

    const [prospect, handoff] = await Promise.all([
      prisma.dekesProspect.findFirst({
        where: { externalLeadId: externalId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.dekesHandoffEvent.findFirst({
        where: { externalLeadId: externalId },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    if (!prospect) {
      return res.status(404).json({ error: 'Handoff not found' })
    }

    const parsedNotes = parseDekesHandoffNotes(handoff?.notes)

    return res.json({
      status: handoff?.status ?? prospect.status,
      externalLeadId: prospect.externalLeadId,
      externalOrgId: prospect.externalOrgId,
      convertedAt: prospect.status === 'CONVERTED' ? prospect.updatedAt.toISOString() : undefined,
      decisionFrameId: parsedNotes.decisionFrameId,
      proofHash: parsedNotes.proofHash,
      action: parsedNotes.action,
      selectedRegion: parsedNotes.selectedRegion,
      selectedRunner: parsedNotes.selectedRunner,
      artifactLinks: parsedNotes.decisionFrameId
        ? buildDekesArtifactLinks(parsedNotes.decisionFrameId)
        : null,
      notes: handoff?.notes ?? prospect.notes,
    })
  } catch (error: any) {
    console.error('Get handoff status error:', error)
    res.status(500).json({ error: 'Failed to fetch handoff status' })
  }
})

// ── POST /api/v1/route ─────────────────────────────────────────────────────────
// Unified routing endpoint (maps to /route/green internally)
// Accepts DEKES workload routing requests
const routeSchema = z.object({
  organizationId: z.string().optional(),
  source: z.string().optional(),
  workloadType: z.string().optional(),
  candidateRegions: z.array(z.string()).min(1).optional(),
  preferredRegions: z.array(z.string()).min(1).optional(),
  durationMinutes: z.number().optional(),
  delayToleranceMinutes: z.number().optional(),
  maxCarbonGPerKwh: z.number().optional(),
  carbonWeight: z.number().min(0).max(1).optional(),
  latencyWeight: z.number().min(0).max(1).optional(),
  costWeight: z.number().min(0).max(1).optional(),
})

router.post('/route', requireApiKey, async (req, res) => {
  try {
    const data = routeSchema.parse(req.body)

    // Map candidateRegions → preferredRegions for internal routing
    const regions =
      data.candidateRegions ?? data.preferredRegions ?? ['us-east-1', 'us-west-2', 'eu-west-1']
    const estimatedEnergyKwh = estimateDekesEnergyKwh({
      durationMinutes: data.durationMinutes ?? null,
    })
    const started = Date.now()
    const decision = await createDecision({
      preferredRegions: regions,
      carbonWeight: data.carbonWeight ?? 0.6,
      waterWeight: 0.2,
      latencyWeight: data.latencyWeight ?? 0.2,
      costWeight: data.costWeight ?? 0.2,
      workloadClass: 'interactive',
      jobType: 'light',
      criticality: 'standard',
      allowDelay: true,
      maxDelayMinutes:
        data.delayToleranceMinutes != null
          ? Math.max(0, Math.round(data.delayToleranceMinutes))
          : undefined,
      decisionMode: 'runtime_authorization',
      estimatedEnergyKwh,
      metadata: {
        source: 'dekes_route',
        organizationId: data.organizationId ?? null,
        dekesSource: data.source ?? null,
        workloadType: data.workloadType ?? null,
        maxCarbonGPerKwh: data.maxCarbonGPerKwh ?? null,
        durationMinutes: data.durationMinutes ?? null,
      },
    })
    const canonicalResponse = await persistCiDecisionResult(decision, {
      total: Date.now() - started,
      compute: Date.now() - started,
    })
    const response = {
      qualityTier:
        canonicalResponse.signalConfidence >= 0.85
          ? 'high'
          : canonicalResponse.signalConfidence >= 0.68
            ? 'medium'
            : 'low',
      estimatedEnergyKwh,
      ...buildDekesDecisionSurface(canonicalResponse),
    }

    await prisma.dekesWorkload.upsert({
      where: { id: canonicalResponse.decisionFrameId },
      update: {
        dekesRunId: data.source ?? null,
        queryString: data.workloadType ?? 'dekes_runtime_route',
        carbonBudget: data.maxCarbonGPerKwh ?? null,
        scheduledTime: new Date(),
        selectedRegion: canonicalResponse.selectedRegion,
        actualCO2: Number(
          ((canonicalResponse.selected.carbonIntensity * estimatedEnergyKwh) / 1000).toFixed(6)
        ),
        status: 'ROUTED',
      },
      create: {
        id: canonicalResponse.decisionFrameId,
        dekesQueryId: canonicalResponse.decisionFrameId,
        dekesRunId: data.source ?? null,
        queryString: data.workloadType ?? 'dekes_runtime_route',
        estimatedQueries: 1,
        estimatedResults: 1,
        carbonBudget: data.maxCarbonGPerKwh ?? null,
        scheduledTime: new Date(),
        selectedRegion: canonicalResponse.selectedRegion,
        actualCO2: Number(
          ((canonicalResponse.selected.carbonIntensity * estimatedEnergyKwh) / 1000).toFixed(6)
        ),
        status: 'ROUTED',
      },
    })

    // Record integration event
    await prisma.integrationEvent.create({
      data: {
        source: 'DEKES_INTEGRATION',
        eventType: 'ROUTING_DECISION',
        message: JSON.stringify({
          decisionId: response.decisionId,
          decisionFrameId: response.decisionFrameId,
          source: data.source,
          workloadType: data.workloadType,
          selectedRegion: response.selectedRegion,
          action: response.action,
          proofHash: response.proofHash,
        }),
        success: true,
      },
    }).catch(() => {})

    return res.json(response)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('DEKES route error:', error)
    res.status(500).json({ error: 'Routing failed' })
  }
})

// ── POST /api/v1/workloads/complete ────────────────────────────────────────────
// Report workload completion from DEKES SaaS
const completeSchema = z.object({
  decision_id: z.string(),
  executionRegion: z.string(),
  durationMinutes: z.number(),
  status: z.enum(['success', 'failed', 'partial']),
})

router.post('/workloads/complete', requireApiKey, async (req, res) => {
  try {
    const data = completeSchema.parse(req.body)
    const decision = await prisma.cIDecision.findFirst({
      where: {
        OR: [{ decisionFrameId: data.decision_id }, { id: data.decision_id }],
      },
      select: {
        decisionFrameId: true,
        selectedRunner: true,
        selectedRegion: true,
        chosenCo2G: true,
        co2DeltaG: true,
        proofHash: true,
      },
    })
    const workloadId = decision?.decisionFrameId ?? data.decision_id
    const success = data.status === 'success'

    await prisma.workloadDecisionOutcome.create({
      data: {
        workloadId,
        region: data.executionRegion,
        carbonSaved: decision?.co2DeltaG ?? 0,
        latency: data.durationMinutes * 60 * 1000,
        cost: 0,
        success,
      },
    })

    await prisma.dekesWorkload.updateMany({
      where: {
        OR: [{ id: workloadId }, { dekesQueryId: workloadId }],
      },
      data: {
        selectedRegion: data.executionRegion,
        actualCO2:
          typeof decision?.chosenCo2G === 'number'
            ? Number((decision.chosenCo2G / 1000).toFixed(6))
            : undefined,
        status:
          data.status === 'success'
            ? 'COMPLETED'
            : data.status === 'partial'
              ? 'PARTIAL'
              : 'FAILED',
        completedAt: new Date(),
      },
    })

    // Record integration event
    await prisma.integrationEvent.create({
      data: {
        source: 'DEKES_INTEGRATION',
        eventType: 'WORKLOAD_COMPLETED',
        message: JSON.stringify({
          decisionId: workloadId,
          decisionFrameId: workloadId,
          selectedRunner: decision?.selectedRunner ?? null,
          region: data.executionRegion,
          status: data.status,
          durationMinutes: data.durationMinutes,
          proofHash: decision?.proofHash ?? null,
        }),
        success,
      },
    }).catch(() => {})

    return res.json({
      received: true,
      decisionId: workloadId,
      selectedRunner: decision?.selectedRunner ?? null,
      selectedRegion: decision?.selectedRegion ?? data.executionRegion,
      proofHash: decision?.proofHash ?? null,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Workload complete error:', error)
    res.status(500).json({ error: 'Failed to record workload completion' })
  }
})

export default router
