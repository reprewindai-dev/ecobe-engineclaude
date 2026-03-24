/**
 * Carbon-aware CI/CD runner routing and reusable workflow planning.
 *
 * This route family is the decision surface for GitHub Actions and other
 * execution clients. ECOBE remains the control plane.
 */

import { Request, Response, Router } from 'express'
import { z } from 'zod'

import { findOptimalWindow } from '../lib/carbon-forecasting'
import { prisma } from '../lib/db'
import { routeGreen } from '../lib/green-routing'

const router = Router()

type SignalProfileId = 'us_official' | 'forecast_research' | 'marginal_when_available'
type Criticality = 'critical' | 'standard' | 'deferable'

const RUNNER_REGIONS: Record<string, string[]> = {
  eastus: ['ubuntu-latest', 'windows-latest'],
  eastus2: ['ubuntu-latest', 'windows-latest'],
  northeurope: ['ubuntu-latest', 'windows-latest'],
  norwayeast: ['ubuntu-latest'],
  uksouth: ['ubuntu-latest', 'windows-latest'],
  westus2: ['ubuntu-latest'],
  centralus: ['ubuntu-latest'],
  'us-east-1': ['ubuntu-latest', 'windows-latest', 'macos-latest'],
  'us-east-2': ['ubuntu-latest', 'windows-latest'],
  'us-west-1': ['ubuntu-latest', 'windows-latest'],
  'us-west-2': ['ubuntu-latest', 'windows-latest'],
  'eu-west-1': ['ubuntu-latest', 'windows-latest'],
  'eu-west-2': ['ubuntu-latest'],
  'eu-central-1': ['ubuntu-latest'],
  'ap-southeast-1': ['ubuntu-latest'],
}

const SIGNAL_PROFILES: Record<
  SignalProfileId,
  {
    mode: 'optimize' | 'assurance'
    policyMode: 'default' | 'sec_disclosure_strict' | 'eu_24x7_ready'
    carbonWeight: number
    latencyWeight: number
    costWeight: number
  }
> = {
  us_official: {
    mode: 'assurance',
    policyMode: 'sec_disclosure_strict',
    carbonWeight: 0.72,
    latencyWeight: 0.2,
    costWeight: 0.08,
  },
  forecast_research: {
    mode: 'optimize',
    policyMode: 'eu_24x7_ready',
    carbonWeight: 0.7,
    latencyWeight: 0.15,
    costWeight: 0.15,
  },
  marginal_when_available: {
    mode: 'optimize',
    policyMode: 'default',
    carbonWeight: 0.8,
    latencyWeight: 0.15,
    costWeight: 0.05,
  },
}

const canonicalCiRoutingRequestSchema = z.object({
  workloadId: z.string().min(1),
  workloadName: z.string().min(1).max(160).optional(),
  orgId: z.string().optional(),
  candidateRegions: z.array(z.string().min(1)).min(1),
  candidateRunners: z.array(z.string().min(1)).min(1).default([
    'ubuntu-latest',
    'windows-latest',
    'macos-latest',
  ]),
  durationMinutes: z.number().int().positive().max(24 * 60).default(20),
  delayToleranceMinutes: z.number().int().min(0).max(24 * 60).default(0),
  deadline: z.string().datetime().optional(),
  signalProfile: z
    .enum(['us_official', 'forecast_research', 'marginal_when_available'])
    .default('us_official'),
  criticality: z.enum(['critical', 'standard', 'deferable']).default('standard'),
  jobType: z.enum(['standard', 'heavy', 'light']).default('standard'),
  assuranceMode: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
})

const legacyCiRoutingRequestSchema = z.object({
  preferredRegions: z.array(z.string().min(1)).min(1),
  carbonWeight: z.number().min(0).max(1).optional(),
  latencyWeight: z.number().min(0).max(1).optional(),
  costWeight: z.number().min(0).max(1).optional(),
  workloadId: z.string().min(1).optional(),
  workloadName: z.string().min(1).max(160).optional(),
  orgId: z.string().optional(),
  candidateRunners: z.array(z.string().min(1)).min(1).optional(),
  durationMinutes: z.number().int().positive().max(24 * 60).default(20),
  delayToleranceMinutes: z.number().int().min(0).max(24 * 60).default(0),
  deadline: z.string().datetime().optional(),
  signalProfile: z
    .enum(['us_official', 'forecast_research', 'marginal_when_available'])
    .default('us_official'),
  criticality: z.enum(['critical', 'standard', 'deferable']).default('standard'),
  jobType: z.enum(['standard', 'heavy', 'light']).default('standard'),
  assuranceMode: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
})

type CanonicalCiRoutingRequest = z.infer<typeof canonicalCiRoutingRequestSchema>

type NormalizedCIRoutingRequest = CanonicalCiRoutingRequest & {
  legacyRouteInput: boolean
  weightsOverride: {
    carbonWeight?: number
    latencyWeight?: number
    costWeight?: number
  } | null
}

function parseCiRoutingRequest(body: unknown, allowLegacy: boolean): NormalizedCIRoutingRequest {
  const canonical = canonicalCiRoutingRequestSchema.safeParse(body)
  if (canonical.success) {
    return {
      ...canonical.data,
      legacyRouteInput: false,
      weightsOverride: null,
    }
  }

  if (!allowLegacy) {
    throw canonical.error
  }

  const legacy = legacyCiRoutingRequestSchema.parse(body)
  return {
    workloadId: legacy.workloadId ?? 'legacy-ci-route',
    workloadName: legacy.workloadName,
    orgId: legacy.orgId,
    candidateRegions: legacy.preferredRegions,
    candidateRunners: legacy.candidateRunners ?? ['ubuntu-latest', 'windows-latest', 'macos-latest'],
    durationMinutes: legacy.durationMinutes,
    delayToleranceMinutes: legacy.delayToleranceMinutes,
    deadline: legacy.deadline,
    signalProfile: legacy.signalProfile,
    criticality: legacy.criticality,
    jobType: legacy.jobType,
    assuranceMode: legacy.assuranceMode,
    metadata: {
      ...(legacy.metadata ?? {}),
      legacyRouteInput: true,
    },
    legacyRouteInput: true,
    weightsOverride: {
      carbonWeight: legacy.carbonWeight,
      latencyWeight: legacy.latencyWeight,
      costWeight: legacy.costWeight,
    },
  }
}

function resolveSignalProfile(
  signalProfile: SignalProfileId,
  assuranceMode: boolean,
  jobType: 'standard' | 'heavy' | 'light',
  weightsOverride: NormalizedCIRoutingRequest['weightsOverride']
) {
  const base = SIGNAL_PROFILES[signalProfile]
  const carbonWeight =
    weightsOverride?.carbonWeight ??
    (jobType === 'heavy'
      ? Math.max(base.carbonWeight, 0.8)
      : jobType === 'light'
        ? Math.min(base.carbonWeight, 0.55)
        : base.carbonWeight)

  return {
    mode: assuranceMode ? 'assurance' : base.mode,
    policyMode: assuranceMode ? 'sec_disclosure_strict' : base.policyMode,
    carbonWeight,
    latencyWeight: weightsOverride?.latencyWeight ?? base.latencyWeight,
    costWeight: weightsOverride?.costWeight ?? base.costWeight,
  }
}

function resolveDeadlineConstraint(
  deadline: string | undefined,
  durationMinutes: number,
  delayToleranceMinutes: number
) {
  if (!deadline) {
    return {
      deadline,
      mode: 'not_provided' as const,
      minutesUntilDeadline: null,
      effectiveLookaheadMinutes: delayToleranceMinutes,
      requestedDelayToleranceMinutes: delayToleranceMinutes,
    }
  }

  const deadlineMs = new Date(deadline).getTime()
  const minutesUntilDeadline = Math.floor((deadlineMs - Date.now()) / 60000)

  if (minutesUntilDeadline <= 0) {
    return {
      deadline,
      mode: 'expired' as const,
      minutesUntilDeadline,
      effectiveLookaheadMinutes: 0,
      requestedDelayToleranceMinutes: delayToleranceMinutes,
    }
  }

  const maxDelayBeforeDeadline = Math.max(0, minutesUntilDeadline - durationMinutes)

  return {
    deadline,
    mode: maxDelayBeforeDeadline > 0 ? 'bounded' as const : 'immediate_only' as const,
    minutesUntilDeadline,
    effectiveLookaheadMinutes: Math.min(delayToleranceMinutes, maxDelayBeforeDeadline),
    requestedDelayToleranceMinutes: delayToleranceMinutes,
  }
}

function estimateCiEnergyKwh(jobType: 'standard' | 'heavy' | 'light', durationMinutes: number) {
  const perMinute = jobType === 'heavy' ? 0.012 : jobType === 'light' ? 0.003 : 0.006
  return Math.round(perMinute * durationMinutes * 1000) / 1000
}

function planImmediateConcurrency(score: number, criticality: Criticality) {
  if (criticality === 'critical') {
    if (score >= 0.7) {
      return { maxParallel: 6, shouldRun: true, rationale: 'Critical job in a strong carbon window.' }
    }
    return { maxParallel: 4, shouldRun: true, rationale: 'Critical job kept live despite dirtier grid conditions.' }
  }

  if (score >= 0.8) {
    return { maxParallel: 4, shouldRun: true, rationale: 'Clean window allows broad matrix concurrency.' }
  }
  if (score >= 0.5) {
    return { maxParallel: 2, shouldRun: true, rationale: 'Moderate window keeps CI moving with reduced parallelism.' }
  }

  return { maxParallel: 1, shouldRun: true, rationale: 'Dirty window; serialize work to limit runner load.' }
}

function pickRunner(availableRunners: string[], candidateRunners: string[]) {
  return candidateRunners.find((runner) => availableRunners.includes(runner)) ?? availableRunners[0] ?? 'ubuntu-latest'
}

async function findBestDeferredWindow(
  candidateRegions: string[],
  durationMinutes: number,
  effectiveLookaheadMinutes: number
) {
  if (effectiveLookaheadMinutes <= 0) return null

  const durationHours = Math.max(1, Math.ceil(durationMinutes / 60))
  const lookAheadHours = Math.max(1, Math.ceil(effectiveLookaheadMinutes / 60))

  const windows = await Promise.all(
    candidateRegions.map(async (region) => {
      try {
        const window = await findOptimalWindow(region, durationHours, lookAheadHours)
        return window ? { region, window } : null
      } catch {
        return null
      }
    })
  )

  const viable = windows.filter(
    (entry): entry is { region: string; window: NonNullable<Awaited<ReturnType<typeof findOptimalWindow>>> } =>
      entry !== null
  )
  if (viable.length === 0) return null

  viable.sort((left, right) => left.window.avgCarbonIntensity - right.window.avgCarbonIntensity)
  return viable[0]
}

function buildReusableWorkflowTemplates() {
  return {
    heavy_ci: `name: Ecobe Heavy CI

on:
  workflow_call:
    inputs:
      workload_id:
        required: true
        type: string
      duration_minutes:
        required: true
        type: number
      deadline:
        required: false
        type: string
      candidate_regions:
        required: true
        type: string
      signal_profile:
        required: false
        type: string
        default: us_official
      assurance_mode:
        required: false
        type: boolean
        default: true
    secrets:
      ECOBE_URL:
        required: true
      ECOBE_INTERNAL_API_KEY:
        required: true

jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - id: ecobe
        uses: co2-router/ecobe-action@v1
        with:
          ecobe_url: \${{ secrets.ECOBE_URL }}
          api_key: \${{ secrets.ECOBE_INTERNAL_API_KEY }}
          workload_id: \${{ inputs.workload_id }}
          duration_minutes: \${{ inputs.duration_minutes }}
          deadline: \${{ inputs.deadline }}
          candidate_regions: \${{ inputs.candidate_regions }}
          signal_profile: \${{ inputs.signal_profile }}
          assurance_mode: \${{ inputs.assurance_mode }}`,
  }
}

async function handleCarbonRoute(req: Request, res: Response, allowLegacy: boolean) {
  try {
    const data = parseCiRoutingRequest(req.body, allowLegacy)
    const deadlineConstraint = resolveDeadlineConstraint(
      data.deadline,
      data.durationMinutes,
      data.delayToleranceMinutes
    )

    if (deadlineConstraint.mode === 'expired') {
      return res.status(400).json({
        error: 'Deadline expired',
        message: 'deadline has already passed',
        details: {
          deadline: data.deadline,
          minutesUntilDeadline: deadlineConstraint.minutesUntilDeadline,
        },
      })
    }

    const profile = resolveSignalProfile(
      data.signalProfile,
      data.assuranceMode,
      data.jobType,
      data.weightsOverride
    )
    const energyEstimateKwh = estimateCiEnergyKwh(data.jobType, data.durationMinutes)

    const routingResult = await routeGreen({
      preferredRegions: data.candidateRegions,
      carbonWeight: profile.carbonWeight,
      latencyWeight: profile.latencyWeight,
      costWeight: profile.costWeight,
      mode: profile.mode,
      policyMode: profile.policyMode,
      orgId: data.orgId,
      workloadType: `ci/${data.jobType}`,
      workloadName: data.workloadName ?? data.workloadId,
      energyEstimateKwh,
    })

    const selectedRegion = routingResult.selectedRegion
    const availableRunners = RUNNER_REGIONS[selectedRegion] ?? ['ubuntu-latest']
    const selectedRunner = pickRunner(availableRunners, data.candidateRunners)
    const baseline = Math.max(
      routingResult.carbonIntensity,
      ...routingResult.alternatives.map((candidate) => candidate.carbonIntensity)
    )
    const savings = Math.max(0, ((baseline - routingResult.carbonIntensity) / baseline) * 100)

    const deferredWindow =
      data.criticality === 'deferable' && deadlineConstraint.effectiveLookaheadMinutes > 0
        ? await findBestDeferredWindow(
            data.candidateRegions,
            data.durationMinutes,
            deadlineConstraint.effectiveLookaheadMinutes
          )
        : null

    const deferredImprovement =
      deferredWindow == null ? 0 : routingResult.carbonIntensity - deferredWindow.window.avgCarbonIntensity

    const shouldDelay =
      data.criticality === 'deferable' &&
      deadlineConstraint.effectiveLookaheadMinutes > 0 &&
      deferredWindow != null &&
      deferredImprovement >= 10

    const immediatePlan = planImmediateConcurrency(
      routingResult.score,
      deadlineConstraint.mode === 'immediate_only' && data.criticality === 'deferable'
        ? 'standard'
        : data.criticality
    )

    const response = {
      selectedRunner,
      selectedRegion,
      carbonIntensity: shouldDelay ? deferredWindow!.window.avgCarbonIntensity : routingResult.carbonIntensity,
      baseline,
      savings: Math.round(savings * 10) / 10,
      mode: routingResult.mode,
      policyMode: routingResult.policyMode,
      signalType: routingResult.signalTypeUsed,
      confidence: routingResult.assurance.confidenceLabel,
      maxParallel: shouldDelay ? 0 : immediatePlan.maxParallel,
      shouldRun: !shouldDelay && immediatePlan.shouldRun,
      startTime: shouldDelay ? deferredWindow!.window.startTime.toISOString() : new Date().toISOString(),
      decisionFrameId: routingResult.decisionFrameId,
      recommendation: shouldDelay
        ? `Delay execution until ${deferredWindow!.window.startTime.toISOString()}; cleaner capacity exists within the allowed deadline window.`
        : immediatePlan.rationale,
      deadlineHandling: deadlineConstraint,
      alternatives: routingResult.alternatives.map((alternative) => ({
        region: alternative.region,
        runner: pickRunner(RUNNER_REGIONS[alternative.region] ?? ['ubuntu-latest'], data.candidateRunners),
        carbonIntensity: alternative.carbonIntensity,
        score: alternative.score,
      })),
      deferredWindow:
        deferredWindow == null
          ? null
          : {
              region: deferredWindow.region,
              startTime: deferredWindow.window.startTime.toISOString(),
              endTime: deferredWindow.window.endTime.toISOString(),
              avgCarbonIntensity: deferredWindow.window.avgCarbonIntensity,
              savingsPct: deferredWindow.window.savings,
              confidenceBand: deferredWindow.window.confidenceBand,
            },
      provenance: {
        doctrine: routingResult.doctrine,
        legalDisclaimer: routingResult.legalDisclaimer,
        sourceUsed: routingResult.source_used,
        validationSource: routingResult.validation_source,
        fallbackUsed: routingResult.fallback_used,
        disagreement: routingResult.provider_disagreement,
        confidenceBand: routingResult.confidenceBand,
        budgetStatus: routingResult.budgetStatus ?? [],
      },
      workflowOutputs: {
        region: selectedRegion,
        runner: selectedRunner,
        should_run: String(!shouldDelay && immediatePlan.shouldRun),
        max_parallel: String(shouldDelay ? 0 : immediatePlan.maxParallel),
        start_time: shouldDelay ? deferredWindow!.window.startTime.toISOString() : new Date().toISOString(),
        score: routingResult.score.toFixed(4),
        intensity_gco2_per_kwh: String(
          shouldDelay ? deferredWindow!.window.avgCarbonIntensity : routingResult.carbonIntensity
        ),
        mode: routingResult.mode,
        confidence: routingResult.assurance.confidenceLabel,
      },
    }

    await prisma.cIDecision.create({
      data: {
        decisionFrameId: routingResult.decisionFrameId ?? '',
        selectedRunner,
        selectedRegion,
        carbonIntensity: response.carbonIntensity,
        baseline,
        savings,
        jobType: data.jobType,
        preferredRegions: data.candidateRegions,
        carbonWeight: profile.carbonWeight,
        recommendation: response.recommendation,
        metadata: {
          workloadId: data.workloadId,
          signalProfile: data.signalProfile,
          criticality: data.criticality,
          maxParallel: response.maxParallel,
          shouldRun: response.shouldRun,
          legacyRouteInput: data.legacyRouteInput,
          deadlineHandling: deadlineConstraint,
          deferredWindow: response.deferredWindow,
          provenance: response.provenance,
          metadata: data.metadata ?? {},
        },
      },
    })

    return res.json(response)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid CI routing request',
        details: error.errors,
      })
    }

    console.error('CI routing error:', error)
    return res.status(500).json({
      error: 'Failed to compute CI routing plan',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

router.post('/carbon-route', (req, res) => handleCarbonRoute(req, res, false))
// Deprecated compatibility route for older clients that still send preferredRegions
// and explicit legacy weights.
router.post('/route', (req, res) => handleCarbonRoute(req, res, true))

router.get('/profiles', (_req, res) => {
  res.json({
    runnerRegions: Object.entries(RUNNER_REGIONS).map(([region, runners]) => ({
      region,
      runners,
      defaultRunner: runners[0],
    })),
    signalProfiles: SIGNAL_PROFILES,
    concurrencyGuidance: {
      critical: 'Keep the critical path live. Prefer cleaner regions, but do not defer.',
      standard: 'Use max-parallel 4 in clean windows, 2 in moderate windows, 1 in dirty windows.',
      deferable: 'Defer when score is poor and a cleaner forecast window exists before the deadline.',
    },
  })
})

router.get('/templates/reusable-workflows', (_req, res) => {
  res.json(buildReusableWorkflowTemplates())
})

router.get('/health', async (_req, res) => {
  try {
    const testResult = await routeGreen({
      preferredRegions: ['eastus', 'northeurope'],
      carbonWeight: 0.7,
      latencyWeight: 0.2,
      costWeight: 0.1,
      workloadType: 'ci/health',
      workloadName: 'ci-health-check',
    })

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      regions: Object.keys(RUNNER_REGIONS).length,
      signalProfiles: Object.keys(SIGNAL_PROFILES),
      testRouting: {
        success: true,
        carbonIntensity: testResult.carbonIntensity,
        region: testResult.selectedRegion,
      },
    })
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.get('/regions', (_req, res) => {
  res.json({
    regions: Object.entries(RUNNER_REGIONS).map(([region, runners]) => ({
      region,
      runners,
      defaultRunner: runners[0],
    })),
    totalRegions: Object.keys(RUNNER_REGIONS).length,
  })
})

router.get('/decisions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const decisions = await prisma.cIDecision.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        decisionFrameId: true,
        selectedRunner: true,
        selectedRegion: true,
        carbonIntensity: true,
        baseline: true,
        savings: true,
        jobType: true,
        recommendation: true,
        createdAt: true,
        metadata: true,
      },
    })

    res.json({
      decisions,
      total: decisions.length,
      limit,
    })
  } catch (error) {
    console.error('Failed to fetch CI decisions:', error)
    res.status(500).json({
      error: 'Failed to fetch decisions',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
