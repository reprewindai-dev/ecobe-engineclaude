import crypto from 'crypto'
import { addHours, differenceInMinutes } from 'date-fns'
import { env } from '../config/env'
import { prisma } from './db'
import { redis } from './redis'
import { electricityMaps } from './electricity-maps'
import { forecastCarbonIntensity } from './carbon-forecasting'
import { Prisma } from '@prisma/client'
import { indexWorkloadEmbedding } from './workload-embedding'
import { buildAdaptiveRun, logAdaptiveRun } from './adaptive'
import { analyzeSimilarWorkloads } from './intelligence/similarity'
import { applyAdaptiveOptimization } from './intelligence/optimizer'
import { storeWorkloadFingerprint } from './intelligence/vector-store'
import type { SimilarityInsight } from './intelligence/similarity'
import {
  requireActiveOrganization,
  getOrCreateUsageCounter,
  assertCommandQuota,
  usagePeriod,
  ensureCreditCoverage,
  incrementOrgUsage,
} from './organizations'

const toJsonObject = (value: unknown): Prisma.JsonObject => {
  const normalized = value ?? {}
  return JSON.parse(JSON.stringify(normalized)) as Prisma.JsonObject
}

export type Priority = 'low' | 'medium' | 'high'
export type ExecutionMode = 'immediate' | 'scheduled' | 'advisory'

const PRIORITY_WEIGHTS: Record<Priority, number> = {
  high: 0.5,
  medium: 0.3,
  low: 0.2,
}

const GPU_KWH_PER_HOUR = 1.5
const CPU_KWH_PER_HOUR = 0.25
const DEFAULT_LATENCY_MS = 150
const DEFAULT_COST_INDEX = 1
const FORECAST_CACHE_TTL = 60 * 15 // 15 minutes
const CARBON_CACHE_TTL = 60 * 5 // 5 minutes per requirements
const SCORING_MODEL_VERSION = 'carbon-v1'

export class CarbonCommandError extends Error {
  constructor(public code: 'NO_ELIGIBLE_CANDIDATES' | 'INVALID_REQUEST', message: string) {
    super(message)
  }
}

export interface CarbonCommandWorkload {
  type: string
  modelFamily?: string
  estimatedGpuHours?: number
  estimatedCpuHours?: number
  estimatedMemoryGb?: number
}

export interface CarbonCommandConstraints {
  maxLatencyMs?: number
  deadlineAt?: string
  mustRunRegions?: string[]
  excludedRegions?: string[]
  carbonPriority?: Priority
  costPriority?: Priority
  latencyPriority?: Priority
}

export interface CarbonCommandExecution {
  mode?: ExecutionMode
  candidateStartWindowHours?: number
}

export interface CarbonCommandPreferences {
  allowTimeShifting?: boolean
  allowCrossRegionExecution?: boolean
  requireCreditCoverage?: boolean
}

export interface CarbonCommandPayload {
  orgId: string
  workload: CarbonCommandWorkload
  constraints: CarbonCommandConstraints
  execution?: CarbonCommandExecution
  preferences?: CarbonCommandPreferences
  metadata?: Record<string, unknown>
}

interface CandidateContext {
  candidateId: string
  region: string
  startAt: Date
  carbonIntensity?: number
  latencyMs: number
  costIndex: number
  deadlineFit: boolean
  latencyFit: boolean
  eligible: boolean
  rejectionReason?: string
  scores?: CandidateScores
}

interface CandidateScores {
  carbon: number
  latency: number
  cost: number
  deadline: number
  total: number
}

export interface CarbonCommandRecommendation {
  commandId: string
  decisionId: string
  recommendation: {
    region: string
    startAt: string
    mode: ExecutionMode
    expectedCarbonIntensity: number
    expectedLatencyMs: number
    expectedCostIndex: number
    estimatedEmissionsKgCo2e: number
    estimatedSavingsKgCo2e: number
    confidence: number
    fallbackRegion?: string
  }
  summary: {
    reason: string
    tradeoff: string
    creditCoverageRequired: boolean
  }
  decisionTrace: {
    scoringModel: string
    weights: Record<string, number>
    candidatesEvaluated: number
    selectedCandidateId: string
    rejectedReasons: Array<{ candidateId: string; reason: string }>
  }
}

const toDate = (value?: string): Date | undefined => {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

const priorityWeight = (priority?: Priority): number => PRIORITY_WEIGHTS[priority ?? 'medium']

const normalizeWeights = (weights: Record<string, number>) => {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1
  const normalized: Record<string, number> = {}
  Object.entries(weights).forEach(([key, value]) => {
    normalized[key] = value / total
  })
  return normalized
}

const differenceHoursCeil = (from: Date, to: Date): number => {
  const diffMs = to.getTime() - from.getTime()
  return Math.max(1, Math.ceil(diffMs / (60 * 60 * 1000)))
}

async function getCurrentCarbonIntensity(region: string): Promise<number> {
  const cacheKey = `carbon:${region}`
  const cached = await redis.get(cacheKey)
  if (cached) return parseFloat(cached)

  const data = await electricityMaps.getCarbonIntensity(region)
  const intensity = data?.carbonIntensity ?? 400
  await redis.setex(cacheKey, CARBON_CACHE_TTL, intensity.toString())
  await prisma.carbonIntensity
    .create({
      data: {
        region,
        carbonIntensity: intensity,
        timestamp: new Date(),
        source: 'ELECTRICITY_MAPS',
      },
    })
    .catch(() => {
      // swallow duplicates
    })
  return intensity
}

async function getForecastedCarbonIntensity(region: string, hoursAhead: number): Promise<number> {
  const cacheKey = `forecast:${region}:${hoursAhead}`
  const cached = await redis.get(cacheKey)
  if (cached) {
    const parsed = JSON.parse(cached) as { forecastTime: string; predictedIntensity: number }[]
    const candidate = parsed.find((entry) => entry.predictedIntensity && entry.forecastTime)
    if (candidate) return candidate.predictedIntensity
  }

  const forecasts = await forecastCarbonIntensity(region, Math.max(hoursAhead, 1) + 1)
  if (forecasts.length === 0) {
    // fallback to current
    return getCurrentCarbonIntensity(region)
  }

  await redis.setex(
    cacheKey,
    FORECAST_CACHE_TTL,
    JSON.stringify(
      forecasts.map((item) => ({
        forecastTime: item.forecastTime,
        predictedIntensity: item.predictedIntensity,
      }))
    )
  )

  const nearest = forecasts.find((f) => differenceInMinutes(f.forecastTime, new Date()) >= hoursAhead * 60 - 60)
  return nearest?.predictedIntensity ?? forecasts[forecasts.length - 1].predictedIntensity
}

async function resolveCarbonIntensity(region: string, startAt: Date): Promise<number> {
  const now = new Date()
  const minutesUntilStart = differenceInMinutes(startAt, now)
  if (minutesUntilStart <= 10) {
    return getCurrentCarbonIntensity(region)
  }
  const hoursAhead = differenceHoursCeil(now, startAt)
  return getForecastedCarbonIntensity(region, hoursAhead)
}

function estimateEnergyKwh(workload: CarbonCommandWorkload): number {
  const gpuHours = workload.estimatedGpuHours ?? 0
  const cpuHours = workload.estimatedCpuHours ?? 0
  return gpuHours * GPU_KWH_PER_HOUR + cpuHours * CPU_KWH_PER_HOUR
}

function calculateEmissionsKg(carbonIntensity: number, energyKwh: number): number {
  return (carbonIntensity * energyKwh) / 1000 // carbonIntensity in gCO2/kWh
}

function buildSummaryReason(candidate: CandidateContext, payload: CarbonCommandPayload): string {
  const parts: string[] = []
  parts.push(`Selected ${candidate.region}`)
  if (payload.constraints.carbonPriority === 'high') {
    parts.push('due to lowest projected carbon intensity')
  }
  if (payload.constraints.latencyPriority === 'high') {
    parts.push('while honoring latency limits')
  }
  return parts.join(' ')
}

function buildTradeoff(candidate: CandidateContext, fallback?: CandidateContext): string {
  if (!fallback) {
    return 'No fallback required; only one eligible candidate satisfied constraints.'
  }
  const latencyDelta = (fallback.latencyMs - candidate.latencyMs).toFixed(0)
  return `Chose ${candidate.region} over ${fallback.region}, sacrificing ${latencyDelta}ms latency to capture better carbon profile.`
}

async function fetchCandidateRegions(payload: CarbonCommandPayload): Promise<string[]> {
  const { constraints } = payload
  const baseRegions = constraints.mustRunRegions && constraints.mustRunRegions.length > 0 ? constraints.mustRunRegions : null
  if (baseRegions) {
    return baseRegions.filter((region) => !(constraints.excludedRegions ?? []).includes(region))
  }

  const rows = await prisma.region.findMany({
    where: { enabled: true },
    select: { code: true },
    orderBy: { code: 'asc' },
    take: 50,
  })
  const regionCodes = rows.map((r) => r.code)
  if (regionCodes.length === 0) {
    return []
  }
  if (constraints.excludedRegions?.length) {
    return regionCodes.filter((region) => !constraints.excludedRegions!.includes(region))
  }
  return regionCodes
}

function generateTimeWindows(execution: CarbonCommandExecution | undefined, preferences: CarbonCommandPreferences | undefined): Date[] {
  const now = new Date()
  const mode = execution?.mode ?? 'immediate'
  const allowTimeShifting = preferences?.allowTimeShifting ?? true

  if (mode === 'immediate' || !allowTimeShifting) {
    return [now]
  }

  const hours = Math.min(execution?.candidateStartWindowHours ?? 24, 168)
  const windows: Date[] = []
  for (let i = 0; i <= hours; i += 2) {
    windows.push(addHours(now, i))
  }
  return windows
}

function normalizeMetric(value: number, min: number, max: number, inverted: boolean): number {
  if (max === min) return 1
  const normalized = (value - min) / (max - min)
  return inverted ? 1 - normalized : normalized
}

function computeCandidateScores(candidates: CandidateContext[], weights: Record<string, number>, deadline?: Date): CandidateContext[] {
  const eligible = candidates.filter((candidate) => candidate.eligible && candidate.carbonIntensity !== undefined)
  if (eligible.length === 0) return candidates

  const carbonValues = eligible.map((c) => c.carbonIntensity!)
  const latencyValues = eligible.map((c) => c.latencyMs)
  const costValues = eligible.map((c) => c.costIndex)

  const carbonMin = Math.min(...carbonValues)
  const carbonMax = Math.max(...carbonValues)
  const latencyMin = Math.min(...latencyValues)
  const latencyMax = Math.max(...latencyValues)
  const costMin = Math.min(...costValues)
  const costMax = Math.max(...costValues)

  return candidates.map((candidate) => {
    if (!candidate.eligible || candidate.carbonIntensity === undefined) {
      return candidate
    }

    const carbonScore = normalizeMetric(candidate.carbonIntensity, carbonMin, carbonMax, true)
    const latencyScore = normalizeMetric(candidate.latencyMs, latencyMin, latencyMax, true)
    const costScore = normalizeMetric(candidate.costIndex, costMin, costMax, true)

    let deadlineScore = 1
    if (deadline) {
      deadlineScore = candidate.startAt <= deadline ? 1 : 0
    }

    const total =
      carbonScore * weights.carbon +
      latencyScore * weights.latency +
      costScore * weights.cost +
      deadlineScore * (weights.deadline ?? 0)

    candidate.scores = {
      carbon: Number(carbonScore.toFixed(4)),
      latency: Number(latencyScore.toFixed(4)),
      cost: Number(costScore.toFixed(4)),
      deadline: Number(deadlineScore.toFixed(4)),
      total: Number(total.toFixed(4)),
    }
    return candidate
  })
}

function selectBestCandidate(candidates: CandidateContext[]): { best?: CandidateContext; fallback?: CandidateContext } {
  const eligible = candidates
    .filter((candidate) => candidate.eligible && candidate.scores)
    .sort((a, b) => (b.scores!.total ?? 0) - (a.scores!.total ?? 0))
  return {
    best: eligible[0],
    fallback: eligible[1],
  }
}

interface DecisionAnalytics {
  energyEstimateKwh: number
  estimatedEmissionsKgCo2e: number
  estimatedSavingsKgCo2e: number
  confidence: number
}

function computeDecisionAnalytics(
  payload: CarbonCommandPayload,
  selection: { best: CandidateContext; fallback?: CandidateContext },
  candidates: CandidateContext[]
): DecisionAnalytics {
  const energyEstimateKwh = estimateEnergyKwh(payload.workload)
  const bestCarbon = selection.best.carbonIntensity ?? env.DEFAULT_MAX_CARBON_G_PER_KWH
  const estimatedEmissionsKgCo2e = calculateEmissionsKg(bestCarbon, energyEstimateKwh)
  const comparisonCandidates = candidates.filter((c) => typeof c.carbonIntensity === 'number')
  const baselineCarbon =
    comparisonCandidates.length > 0
      ? Math.max(...comparisonCandidates.map((candidate) => candidate.carbonIntensity!))
      : bestCarbon
  const estimatedSavingsKgCo2e = Math.max(
    calculateEmissionsKg(baselineCarbon, energyEstimateKwh) - estimatedEmissionsKgCo2e,
    0
  )
  const confidence = selection.best.startAt > addHours(new Date(), 6) ? 0.78 : 0.86

  return {
    energyEstimateKwh,
    estimatedEmissionsKgCo2e: Number(estimatedEmissionsKgCo2e.toFixed(3)),
    estimatedSavingsKgCo2e: Number(estimatedSavingsKgCo2e.toFixed(3)),
    confidence,
  }
}

async function persistDecision(
  payload: CarbonCommandPayload,
  selection: { best: CandidateContext; fallback?: CandidateContext },
  weights: Record<string, number>,
  candidates: CandidateContext[],
  rejectionReasons: Array<{ candidateId: string; reason: string }>,
  summary: { reason: string; tradeoff: string },
  analytics: DecisionAnalytics,
  similarityInsight: SimilarityInsight | null
) {
  return prisma.$transaction(async (tx) => {
    const command = await tx.carbonCommand.create({
      data: {
        orgId: payload.orgId,
        requestPayload: toJsonObject(payload),
        workloadType: payload.workload.type,
        modelFamily: payload.workload.modelFamily,
        executionMode: payload.execution?.mode ?? 'immediate',
        mode: (payload.execution?.mode?.toUpperCase() as any) ?? 'IMMEDIATE',
        status: 'RECOMMENDED',
        candidateWindowHours: payload.execution?.candidateStartWindowHours,
        allowTimeShifting: payload.preferences?.allowTimeShifting ?? true,
        allowCrossRegion: payload.preferences?.allowCrossRegionExecution ?? true,
        requireCreditCoverage: payload.preferences?.requireCreditCoverage ?? false,
        selectedRegion: selection.best.region,
        selectedStartAt: selection.best.startAt,
        fallbackRegion: selection.fallback?.region,
        expectedCarbonIntensity: selection.best.carbonIntensity,
        expectedLatencyMs: selection.best.latencyMs,
        expectedCostIndex: selection.best.costIndex,
        estimatedEmissionsKgCo2e: analytics.estimatedEmissionsKgCo2e,
        estimatedSavingsKgCo2e: analytics.estimatedSavingsKgCo2e,
        confidence: analytics.confidence,
        summaryReason: summary.reason,
        tradeoffSummary: summary.tradeoff,
        decisionId: crypto.randomUUID(),
        metadata: toJsonObject(payload.metadata ?? {}),
      },
    })

    await tx.carbonCommandTrace.create({
      data: {
        commandId: command.id,
        scoringModel: SCORING_MODEL_VERSION,
        weights: toJsonObject(weights),
        inputs: toJsonObject({
          orgId: payload.orgId,
          workload: payload.workload,
          constraints: payload.constraints,
          execution: payload.execution,
        }),
        environment: {
          generatedAt: new Date().toISOString(),
          carbonDataProvider: 'electricity_maps',
          forecastModel: 'moving-average-v1',
        },
        candidates: candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          region: candidate.region,
          startAt: candidate.startAt.toISOString(),
          carbonIntensity: candidate.carbonIntensity ?? null,
          latencyMs: candidate.latencyMs,
          costIndex: candidate.costIndex,
          eligible: candidate.eligible,
          scores: candidate.scores ?? null,
          rejectionReason: candidate.rejectionReason ?? null,
        })) as Prisma.JsonArray,
        rejected: rejectionReasons.map((reason) => ({
          candidateId: reason.candidateId,
          reason: reason.reason,
        })) as Prisma.JsonArray,
        selection: toJsonObject({
          selectedCandidateId: selection.best.candidateId,
          fallbackCandidateId: selection.fallback?.candidateId,
          selectionReason: summary.reason,
        }),
        traceJson: toJsonObject({
          traceId: crypto.randomUUID(),
          candidatesEvaluated: candidates.length,
          similarityInsight,
        }),
      },
    })

    return command
  })
}

export async function processCarbonCommand(payload: CarbonCommandPayload): Promise<CarbonCommandRecommendation> {
  const org = await requireActiveOrganization(payload.orgId)
  const periodStart = usagePeriod()
  const usageCounter = await getOrCreateUsageCounter(org.id, periodStart)
  assertCommandQuota(org, usageCounter)

  const similarityContext = await analyzeSimilarWorkloads(payload)

  const regions = await fetchCandidateRegions(payload)
  if (regions.length === 0) {
    throw new CarbonCommandError('INVALID_REQUEST', 'No candidate regions available for evaluation.')
  }

  const deadlineDate = toDate(payload.constraints.deadlineAt)
  const timeWindows = generateTimeWindows(payload.execution, payload.preferences)

  const weights = normalizeWeights({
    carbon: priorityWeight(payload.constraints.carbonPriority),
    latency: priorityWeight(payload.constraints.latencyPriority),
    cost: priorityWeight(payload.constraints.costPriority),
    deadline: deadlineDate ? 0.1 : 0,
  })

  const regionRecords = await prisma.region.findMany({
    where: { code: { in: regions } },
    select: {
      code: true,
      typicalLatencyMs: true,
      costPerKwh: true,
    },
  })
  const regionMeta = new Map(regionRecords.map((region) => [region.code, region]))

  const candidates: CandidateContext[] = []
  const rejectionReasons: Array<{ candidateId: string; reason: string }> = []

  for (const region of regions) {
    for (const startAt of timeWindows) {
      const candidateId = crypto.randomUUID()
      const meta = regionMeta.get(region)
      const latencyMs = meta?.typicalLatencyMs ?? payload.constraints.maxLatencyMs ?? DEFAULT_LATENCY_MS
      const costIndex = meta?.costPerKwh ?? DEFAULT_COST_INDEX
      const deadlineFit = deadlineDate ? startAt <= deadlineDate : true
      const latencyFit = payload.constraints.maxLatencyMs ? latencyMs <= payload.constraints.maxLatencyMs : true

      let eligible = deadlineFit && latencyFit
      let rejectionReason: string | undefined

      let carbonIntensity: number | undefined
      try {
        carbonIntensity = await resolveCarbonIntensity(region, startAt)
      } catch (error) {
        eligible = false
        rejectionReason = 'Carbon intensity unavailable'
      }

      if (carbonIntensity === undefined) {
        eligible = false
        rejectionReason = 'Missing carbon data'
      }

      if (!eligible && rejectionReason) {
        rejectionReasons.push({ candidateId, reason: rejectionReason })
      }

      candidates.push({
        candidateId,
        region,
        startAt,
        carbonIntensity,
        latencyMs,
        costIndex,
        deadlineFit,
        latencyFit,
        eligible,
        rejectionReason,
      })
    }
  }

  const scoredCandidates = computeCandidateScores(candidates, weights, deadlineDate)
  const optimizedCandidates = applyAdaptiveOptimization(scoredCandidates, similarityContext?.insight)
  const { best, fallback } = selectBestCandidate(optimizedCandidates)

  if (!best) {
    throw new CarbonCommandError('NO_ELIGIBLE_CANDIDATES', 'No candidate regions satisfy the provided constraints.')
  }

  const summary = {
    reason: buildSummaryReason(best, payload),
    tradeoff: buildTradeoff(best, fallback),
  }

  const analytics = computeDecisionAnalytics(payload, { best, fallback }, scoredCandidates)

  const requiresCreditCoverage = org.enforceCreditCoverage || payload.preferences?.requireCreditCoverage
  if (requiresCreditCoverage) {
    await ensureCreditCoverage(org.id, analytics.estimatedEmissionsKgCo2e)
  }

  const commandRecord = await persistDecision(
    payload,
    { best, fallback },
    weights,
    optimizedCandidates,
    rejectionReasons,
    summary,
    analytics,
    similarityContext?.insight ?? null
  )

  void indexWorkloadEmbedding(commandRecord, payload).catch((error) => {
    console.warn('Failed to index workload embedding for command', commandRecord.id, error)
  })

  if (similarityContext?.embedding) {
    const metadata = {
      workloadId: commandRecord.id,
      orgId: commandRecord.orgId,
      regionChosen: best.region,
      carbonIntensity: best.carbonIntensity ?? null,
      latency: best.latencyMs ?? null,
      cost: best.costIndex ?? null,
      carbonSaved: analytics.estimatedSavingsKgCo2e ?? null,
      success: true,
    }

    void storeWorkloadFingerprint({
      workloadId: commandRecord.id,
      embedding: similarityContext.embedding,
      metadata,
    }).catch((error) => {
      console.warn('Failed to persist workload fingerprint', commandRecord.id, error)
    })
  }

  void incrementOrgUsage(org.id, periodStart, {
    commands: 1,
    estimatedEmissionsKg: analytics.estimatedEmissionsKgCo2e,
    lastCommandAt: new Date(),
  }).catch((error) => {
    console.warn('Failed to increment org usage for command', commandRecord.id, error)
  })

  void (async () => {
    try {
      const baseScores: Record<string, number> = {
        carbon: best.scores?.carbon ?? 0,
        latency: best.scores?.latency ?? 0,
        cost: best.scores?.cost ?? 0,
        deadline: best.scores?.deadline ?? 0,
        total: best.scores?.total ?? 0,
      }
      const adaptiveContext = await buildAdaptiveRun(commandRecord, payload, baseScores)
      await logAdaptiveRun(adaptiveContext)
    } catch (error) {
      console.warn('Failed to log adaptive run for command', commandRecord.id, error)
    }
  })()

  const response: CarbonCommandRecommendation = {
    commandId: commandRecord.id,
    decisionId: commandRecord.decisionId ?? commandRecord.id,
    recommendation: {
      region: best.region,
      startAt: best.startAt.toISOString(),
      mode: (payload.execution?.mode ?? 'immediate') as ExecutionMode,
      expectedCarbonIntensity: best.carbonIntensity!,
      expectedLatencyMs: best.latencyMs,
      expectedCostIndex: best.costIndex,
      estimatedEmissionsKgCo2e: commandRecord.estimatedEmissionsKgCo2e ?? 0,
      estimatedSavingsKgCo2e: commandRecord.estimatedSavingsKgCo2e ?? 0,
      confidence: commandRecord.confidence ?? 0.8,
      fallbackRegion: fallback?.region,
    },
    summary: {
      reason: commandRecord.summaryReason ?? summary.reason,
      tradeoff: commandRecord.tradeoffSummary ?? summary.tradeoff,
      creditCoverageRequired: payload.preferences?.requireCreditCoverage ?? false,
    },
    decisionTrace: {
      scoringModel: SCORING_MODEL_VERSION,
      weights,
      candidatesEvaluated: scoredCandidates.length,
      selectedCandidateId: best.candidateId,
      rejectedReasons: rejectionReasons,
    },
  }

  return response
}
