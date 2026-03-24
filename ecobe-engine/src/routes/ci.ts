/**
 * Carbon-aware CI/CD runner routing and reusable workflow planning.
 *
 * This route family is designed to back a real GitHub Action / reusable workflow,
 * not a static demo. It exposes region choice, runner mapping, concurrency, defer
 * decisions, and provenance-rich outputs that can be fed directly into workflow_call.
 */

import { Router } from 'express'
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
  'us-west-2': ['ubuntu-latest', 'windows-latest'],
  'eu-west-1': ['ubuntu-latest', 'windows-latest'],
  'eu-west-2': ['ubuntu-latest'],
  'eu-central-1': ['ubuntu-latest'],
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

const ciRoutingRequestSchema = z.object({
  workloadId: z.string().min(1),
  workloadName: z.string().min(1).max(160).optional(),
  orgId: z.string().optional(),
  candidateRegions: z.array(z.string()).min(1),
  durationMinutes: z.number().int().positive().max(24 * 60).default(20),
  deadline: z.string().datetime().optional(),
  signalProfile: z
    .enum(['us_official', 'forecast_research', 'marginal_when_available'])
    .default('us_official'),
  criticality: z.enum(['critical', 'standard', 'deferable']).default('standard'),
  jobType: z.enum(['standard', 'heavy', 'light']).default('standard'),
  assuranceMode: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
})

function resolveSignalProfile(
  signalProfile: SignalProfileId,
  assuranceMode: boolean,
  jobType: 'standard' | 'heavy' | 'light'
) {
  const base = SIGNAL_PROFILES[signalProfile]
  const carbonWeight =
    jobType === 'heavy' ? Math.max(base.carbonWeight, 0.8) : jobType === 'light' ? Math.min(base.carbonWeight, 0.55) : base.carbonWeight

  return {
    mode: assuranceMode ? 'assurance' : base.mode,
    policyMode: assuranceMode ? 'sec_disclosure_strict' : base.policyMode,
    carbonWeight,
    latencyWeight: base.latencyWeight,
    costWeight: base.costWeight,
  }
}

function estimateCiEnergyKwh(jobType: 'standard' | 'heavy' | 'light', durationMinutes: number) {
  const perMinute =
    jobType === 'heavy' ? 0.012 : jobType === 'light' ? 0.003 : 0.006
  return Math.round(perMinute * durationMinutes * 1000) / 1000
}

function planConcurrency(
  score: number,
  criticality: Criticality,
  deadline?: Date | null
): {
  maxParallel: number
  shouldRun: boolean
  rationale: string
} {
  const minutesToDeadline =
    deadline ? (deadline.getTime() - Date.now()) / (60 * 1000) : Number.POSITIVE_INFINITY

  if (criticality === 'critical') {
    if (score >= 0.7) {
      return { maxParallel: 6, shouldRun: true, rationale: 'Critical job in a strong carbon window.' }
    }
    return { maxParallel: 4, shouldRun: true, rationale: 'Critical job kept live despite dirtier grid conditions.' }
  }

  if (criticality === 'standard') {
    if (score >= 0.8) {
      return { maxParallel: 4, shouldRun: true, rationale: 'Clean window allows broad matrix concurrency.' }
    }
    if (score >= 0.5) {
      return { maxParallel: 2, shouldRun: true, rationale: 'Moderate window keeps CI moving with reduced parallelism.' }
    }
    return { maxParallel: 1, shouldRun: true, rationale: 'Dirty window; serialize work to limit runner load.' }
  }

  if (minutesToDeadline <= 120) {
    return { maxParallel: 1, shouldRun: true, rationale: 'Deadline is close, so deferable workflow must still run.' }
  }

  if (score >= 0.75) {
    return { maxParallel: 4, shouldRun: true, rationale: 'Deferable workflow landed in a clean window.' }
  }
  if (score >= 0.5) {
    return { maxParallel: 2, shouldRun: true, rationale: 'Moderate window for deferable work; limited parallelism applied.' }
  }

  return {
    maxParallel: 0,
    shouldRun: false,
    rationale: 'Deferable workflow should wait for a cleaner forecast window.',
  }
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
    outputs:
      region: \${{ steps.ecobe.outputs.region }}
      runner: \${{ steps.ecobe.outputs.runner }}
      score: \${{ steps.ecobe.outputs.score }}
      max_parallel: \${{ steps.ecobe.outputs.max_parallel }}
      should_run: \${{ steps.ecobe.outputs.should_run }}
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
          assurance_mode: \${{ inputs.assurance_mode }}
          criticality: deferable
          job_type: heavy

  heavy_matrix:
    needs: plan
    if: \${{ needs.plan.outputs.should_run == 'true' }}
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
      max-parallel: \${{ fromJSON(needs.plan.outputs.max_parallel) }}
    steps:
      - uses: actions/checkout@v4
      - run: npm test --shard=\${{ matrix.shard }}`,
    nightly_deferral: `name: Ecobe Nightly Deferral

on:
  schedule:
    - cron: "0 0 * * *"

jobs:
  plan:
    runs-on: ubuntu-latest
    outputs:
      should_run: \${{ steps.ecobe.outputs.should_run }}
      start_time: \${{ steps.ecobe.outputs.start_time }}
    steps:
      - id: ecobe
        uses: co2-router/ecobe-action@v1
        with:
          ecobe_url: \${{ secrets.ECOBE_URL }}
          api_key: \${{ secrets.ECOBE_INTERNAL_API_KEY }}
          workload_id: nightly-build
          duration_minutes: 60
          candidate_regions: eastus,northeurope,norwayeast
          signal_profile: forecast_research
          criticality: deferable
          job_type: heavy

  nightly_build:
    needs: plan
    if: \${{ needs.plan.outputs.should_run == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run build && npm test`,
  }
}

router.post('/route', async (req, res) => {
  try {
    const data = ciRoutingRequestSchema.parse(req.body)
    const deadline = data.deadline ? new Date(data.deadline) : null
    const profile = resolveSignalProfile(data.signalProfile, data.assuranceMode, data.jobType)
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
    const selectedRunner = availableRunners[0]
    const baselineIntensity = Math.max(
      routingResult.carbonIntensity,
      ...routingResult.alternatives.map((candidate) => candidate.carbonIntensity),
      500
    )
    const savings = Math.max(
      0,
      ((baselineIntensity - routingResult.carbonIntensity) / baselineIntensity) * 100
    )
    const concurrency = planConcurrency(routingResult.score, data.criticality, deadline)
    const lookAheadHours =
      deadline != null
        ? Math.max(1, Math.min(168, Math.ceil((deadline.getTime() - Date.now()) / (60 * 60 * 1000))))
        : 24
    const deferredWindow =
      !concurrency.shouldRun && lookAheadHours > 0
        ? await findOptimalWindow(selectedRegion, Math.max(1, Math.ceil(data.durationMinutes / 60)), lookAheadHours)
        : null

    const startTime = deferredWindow?.startTime?.toISOString() ?? new Date().toISOString()
    const ciResponse = {
      selectedRunner,
      selectedRegion,
      carbonIntensity: routingResult.carbonIntensity,
      baselineIntensity,
      savingsPct: Math.round(savings * 10) / 10,
      mode: routingResult.mode,
      policyMode: routingResult.policyMode,
      signalType: routingResult.signalTypeUsed,
      confidence: routingResult.assurance.confidenceLabel,
      maxParallel: concurrency.maxParallel,
      shouldRun: concurrency.shouldRun,
      startTime,
      decisionFrameId: routingResult.decisionFrameId,
      recommendation: concurrency.rationale,
      alternatives: routingResult.alternatives.map((alternative) => ({
        region: alternative.region,
        runner: RUNNER_REGIONS[alternative.region]?.[0] ?? 'ubuntu-latest',
        carbonIntensity: alternative.carbonIntensity,
        score: alternative.score,
      })),
      deferredWindow:
        deferredWindow == null
          ? null
          : {
              startTime: deferredWindow.startTime.toISOString(),
              endTime: deferredWindow.endTime.toISOString(),
              avgCarbonIntensity: deferredWindow.avgCarbonIntensity,
              savingsPct: deferredWindow.savings,
              confidenceBand: deferredWindow.confidenceBand,
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
        should_run: String(concurrency.shouldRun),
        max_parallel: String(concurrency.maxParallel),
        start_time: startTime,
        score: routingResult.score.toFixed(4),
        intensity_gco2_per_kwh: String(routingResult.carbonIntensity),
        mode: routingResult.mode,
        confidence: routingResult.assurance.confidenceLabel,
      },
    }

    await prisma.cIDecision.create({
      data: {
        decisionFrameId: routingResult.decisionFrameId ?? '',
        selectedRunner,
        selectedRegion,
        carbonIntensity: routingResult.carbonIntensity,
        baseline: baselineIntensity,
        savings,
        jobType: data.jobType,
        preferredRegions: data.candidateRegions,
        carbonWeight: profile.carbonWeight,
        recommendation: concurrency.rationale,
        metadata: {
          workloadId: data.workloadId,
          signalProfile: data.signalProfile,
          criticality: data.criticality,
          maxParallel: concurrency.maxParallel,
          shouldRun: concurrency.shouldRun,
          deferredWindow:
            deferredWindow == null
              ? null
              : {
                  startTime: deferredWindow.startTime.toISOString(),
                  endTime: deferredWindow.endTime.toISOString(),
                  avgCarbonIntensity: deferredWindow.avgCarbonIntensity,
                  savingsPct: deferredWindow.savings,
                },
          provenance: ciResponse.provenance,
          metadata: data.metadata ?? {},
        },
      },
    })

    res.json(ciResponse)
  } catch (error) {
    console.error('CI routing error:', error)
    res.status(500).json({
      error: 'Failed to compute CI routing plan',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

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
        savings: true,
        jobType: true,
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
