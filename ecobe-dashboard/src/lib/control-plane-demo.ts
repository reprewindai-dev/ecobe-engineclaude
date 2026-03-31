type WorkloadType = 'build' | 'test' | 'batch' | 'inference' | 'etl'

type GreenRoutingResult = {
  selectedRegion: string
  carbonIntensity: number
  qualityTier?: 'high' | 'medium' | 'low'
  explanation: string
  alternatives?: Array<{
    region: string
    carbonIntensity: number
    score: number
    reason?: string
  }>
  decisionFrameId?: string
  source_used?: string | null
  validation_source?: string | null
  fallback_used?: boolean | null
}

type BestWindowResponse = {
  bestWindow?: {
    startTime: string
    endTime: string
    predictedIntensity: number
    confidence: number
    source: string
  } | null
  potentialSavingsPct?: number | null
}

export type DemoRouteRequest = {
  workloadType?: string
  candidateRegions?: string[]
  baselineRegion?: string
  latencySensitivity?: number
  costSensitivity?: number
  carbonSensitivity?: number
  deadlineAt?: string | null
  canDelay?: boolean
}

export type DemoRouteResponse = {
  workloadType: WorkloadType
  baselineRegion: string
  baselineCarbonIntensity: number
  baselineEstimatedCost: number
  selectedRegion: string
  selectedCarbonIntensity: number
  selectedEstimatedCost: number
  carbonSavingsPct: number
  costSavingsPct: number
  recommendedDelaySeconds: number
  recommendedDelayWindow: {
    startTime: string
    endTime: string
  } | null
  confidence: number
  explanation: string
  policyMode: 'optimize'
  providers: {
    sourceUsed: string | null
    validationSource: string | null
    fallbackUsed: boolean
    qualityTier: 'high' | 'medium' | 'low'
  }
  alternatives: Array<{
    region: string
    carbonIntensity: number
    estimatedCost: number
    score: number
  }>
  decisionId: string | null
  generatedAt: string
}

const ENGINE_BASE_URL =
  process.env.ECOBE_API_URL || 'https://ecobe-engineclaude-production.up.railway.app'

const DEFAULT_CANDIDATE_REGIONS = ['eastus', 'westus2', 'northeurope', 'norwayeast']

const WORKLOAD_PROFILES: Record<
  WorkloadType,
  {
    label: string
    durationMinutes: number
    baseCostUsd: number
  }
> = {
  build: { label: 'Build pipeline', durationMinutes: 18, baseCostUsd: 1.0 },
  test: { label: 'Test matrix', durationMinutes: 24, baseCostUsd: 1.35 },
  batch: { label: 'Batch job', durationMinutes: 45, baseCostUsd: 3.2 },
  inference: { label: 'AI inference', durationMinutes: 12, baseCostUsd: 2.4 },
  etl: { label: 'Scheduled ETL', durationMinutes: 60, baseCostUsd: 4.1 },
}

const REGION_COST_INDEX: Record<string, number> = {
  eastus: 1,
  eastus2: 1.01,
  westus2: 0.92,
  centralus: 0.95,
  southcentralus: 0.94,
  northeurope: 0.88,
  norwayeast: 0.84,
  uksouth: 0.9,
  'us-east-1': 1,
  'us-west-2': 0.89,
  'eu-west-1': 0.91,
  'eu-central-1': 0.94,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeWorkloadType(value?: string): WorkloadType {
  if (!value) return 'build'
  if (value in WORKLOAD_PROFILES) return value as WorkloadType
  return 'build'
}

function normalizeCandidateRegions(value?: string[]) {
  const unique = Array.from(new Set((value ?? []).map((region) => region.trim()).filter(Boolean)))
  return unique.length > 0 ? unique : DEFAULT_CANDIDATE_REGIONS
}

function estimateCostUsd(region: string, workloadType: WorkloadType) {
  const profile = WORKLOAD_PROFILES[workloadType]
  const multiplier = REGION_COST_INDEX[region] ?? 1
  return Number((profile.baseCostUsd * multiplier).toFixed(2))
}

function toConfidence(qualityTier: 'high' | 'medium' | 'low' | undefined) {
  if (qualityTier === 'high') return 0.92
  if (qualityTier === 'medium') return 0.74
  return 0.48
}

async function postEngineJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${ENGINE_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Engine request failed for ${path} (${response.status})`)
  }

  return (await response.json()) as T
}

async function maybeGetDelayRecommendation(
  selectedRegion: string,
  selectedCarbonIntensity: number,
  canDelay: boolean,
  workloadType: WorkloadType
) {
  if (!canDelay) {
    return {
      recommendedDelaySeconds: 0,
      recommendedDelayWindow: null,
      delayNote: 'Run now.',
    }
  }

  try {
    const bestWindow = await postEngineJson<BestWindowResponse>('/api/v1/intelligence/best-window', {
      region: selectedRegion,
      lookAheadHours: 24,
      workloadType,
    })

    const nextWindow = bestWindow.bestWindow
    if (!nextWindow) {
      return {
        recommendedDelaySeconds: 0,
        recommendedDelayWindow: null,
        delayNote: 'No cleaner forecast window available.',
      }
    }

    const startsAt = new Date(nextWindow.startTime).getTime()
    const secondsUntilWindow = Math.max(0, Math.round((startsAt - Date.now()) / 1000))
    const enoughImprovement = nextWindow.predictedIntensity < selectedCarbonIntensity * 0.92

    if (!enoughImprovement || secondsUntilWindow === 0) {
      return {
        recommendedDelaySeconds: 0,
        recommendedDelayWindow: null,
        delayNote: 'Current window is already near-optimal.',
      }
    }

    return {
      recommendedDelaySeconds: secondsUntilWindow,
      recommendedDelayWindow: {
        startTime: nextWindow.startTime,
        endTime: nextWindow.endTime,
      },
      delayNote: `Delay to ${nextWindow.startTime} for an expected ${bestWindow.potentialSavingsPct ?? 0}% cleaner window.`,
    }
  } catch {
    return {
      recommendedDelaySeconds: 0,
      recommendedDelayWindow: null,
      delayNote: 'Run now; forecast window unavailable.',
    }
  }
}

export async function buildDemoRoutingDecision(
  input: DemoRouteRequest
): Promise<DemoRouteResponse> {
  const workloadType = normalizeWorkloadType(input.workloadType)
  const candidateRegions = normalizeCandidateRegions(input.candidateRegions)
  const profile = WORKLOAD_PROFILES[workloadType]

  const routing = await postEngineJson<GreenRoutingResult>('/api/v1/route/green', {
    preferredRegions: candidateRegions,
    durationMinutes: profile.durationMinutes,
    carbonWeight: clamp(input.carbonSensitivity ?? 0.65, 0, 1),
    latencyWeight: clamp(input.latencySensitivity ?? 0.2, 0, 1),
    costWeight: clamp(input.costSensitivity ?? 0.15, 0, 1),
  })

  const evaluated = new Map<string, { carbonIntensity: number; score: number }>()
  evaluated.set(routing.selectedRegion, {
    carbonIntensity: routing.carbonIntensity,
    score: 1,
  })

  for (const alternative of routing.alternatives ?? []) {
    evaluated.set(alternative.region, {
      carbonIntensity: alternative.carbonIntensity,
      score: alternative.score,
    })
  }

  const baselineRegion = input.baselineRegion && evaluated.has(input.baselineRegion)
    ? input.baselineRegion
    : candidateRegions.find((region) => evaluated.has(region)) ?? routing.selectedRegion

  const baselineCarbonIntensity =
    evaluated.get(baselineRegion)?.carbonIntensity ?? routing.carbonIntensity
  const baselineEstimatedCost = estimateCostUsd(baselineRegion, workloadType)
  const selectedEstimatedCost = estimateCostUsd(routing.selectedRegion, workloadType)
  const carbonSavingsPct =
    baselineCarbonIntensity > 0
      ? Number(
          (((baselineCarbonIntensity - routing.carbonIntensity) / baselineCarbonIntensity) * 100).toFixed(1)
        )
      : 0
  const costSavingsPct =
    baselineEstimatedCost > 0
      ? Number(
          (((baselineEstimatedCost - selectedEstimatedCost) / baselineEstimatedCost) * 100).toFixed(1)
        )
      : 0

  const delay = await maybeGetDelayRecommendation(
    routing.selectedRegion,
    routing.carbonIntensity,
    Boolean(input.canDelay),
    workloadType
  )

  const alternatives = candidateRegions
    .map((region) => {
      const current = evaluated.get(region)
      if (!current) return null
      return {
        region,
        carbonIntensity: current.carbonIntensity,
        estimatedCost: estimateCostUsd(region, workloadType),
        score: current.score,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => left.carbonIntensity - right.carbonIntensity)

  return {
    workloadType,
    baselineRegion,
    baselineCarbonIntensity,
    baselineEstimatedCost,
    selectedRegion: routing.selectedRegion,
    selectedCarbonIntensity: routing.carbonIntensity,
    selectedEstimatedCost,
    carbonSavingsPct,
    costSavingsPct,
    recommendedDelaySeconds: delay.recommendedDelaySeconds,
    recommendedDelayWindow: delay.recommendedDelayWindow,
    confidence: toConfidence(routing.qualityTier),
    explanation: `${routing.explanation} ${delay.delayNote}`.trim(),
    policyMode: 'optimize',
    providers: {
      sourceUsed: routing.source_used ?? null,
      validationSource: routing.validation_source ?? null,
      fallbackUsed: Boolean(routing.fallback_used),
      qualityTier: routing.qualityTier ?? 'low',
    },
    alternatives,
    decisionId: routing.decisionFrameId ?? null,
    generatedAt: new Date().toISOString(),
  }
}
