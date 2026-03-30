import type {
  DashboardDecision,
  DekesHandoff,
  DekesIntegrationEventsResponse,
  DekesIntegrationMetricsResponse,
  DekesIntegrationSummaryResponse,
} from '@/types'
import { deriveQualityTier, getDecisionSource, isDecisionDelayed } from '@/lib/decisions'

const DEFAULT_ENGINE_URL = 'https://ecobe-engineclaude-production.up.railway.app'

type EngineSystemStatus = {
  status?: string
  timestamp?: string
  uptime?: {
    seconds?: number
    formatted?: string
  }
}

type DekesRuntimeReadModel = {
  summary: DekesIntegrationSummaryResponse
  metrics: DekesIntegrationMetricsResponse
  events: DekesIntegrationEventsResponse
}

function getEngineBaseUrl() {
  return (process.env.ECOBE_API_URL || DEFAULT_ENGINE_URL).replace(/\/$/, '')
}

async function fetchEngineJson<T>(path: string, useInternalKey = false): Promise<T | null> {
  const headers: Record<string, string> = {
    accept: 'application/json',
  }

  if (useInternalKey) {
    const internalKey = process.env.ECOBE_INTERNAL_API_KEY
    if (!internalKey) return null
    headers.authorization = `Bearer ${internalKey}`
    headers['x-ecobe-internal-key'] = internalKey
    headers['x-api-key'] = internalKey
  }

  const response = await fetch(`${getEngineBaseUrl()}${path}`, {
    headers,
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Engine request failed for ${path} (${response.status})`)
  }

  return (await response.json()) as T
}

function getDekesDecisions(decisions: DashboardDecision[]) {
  return decisions.filter((decision) => getDecisionSource(decision) === 'DEKES')
}

function toKg(value: number | null | undefined) {
  return value == null ? 0 : value / 1000
}

function getEventType(decision: DashboardDecision) {
  if (decision.fallbackUsed) return 'LOW_CONFIDENCE_REGION'
  if (isDecisionDelayed(decision)) return 'POLICY_DELAY'

  const baseline = decision.carbonIntensityBaselineGPerKwh ?? null
  const chosen = decision.carbonIntensityChosenGPerKwh ?? null
  if (baseline != null && chosen != null && baseline - chosen >= 100) {
    return 'CLEAN_WINDOW_OPPORTUNITY'
  }
  if (chosen != null && chosen >= 400) {
    return 'HIGH_CARBON_PATTERN'
  }
  return 'ROUTING_POLICY_INSIGHT'
}

function getEventStatus(decision: DashboardDecision): 'success' | 'error' {
  return decision.fallbackUsed ? 'error' : 'success'
}

function getEventMessage(decision: DashboardDecision) {
  const delta =
    decision.carbonIntensityBaselineGPerKwh != null &&
    decision.carbonIntensityChosenGPerKwh != null
      ? decision.carbonIntensityBaselineGPerKwh - decision.carbonIntensityChosenGPerKwh
      : null

  return {
    selectedRegion: decision.chosenRegion,
    baselineRegion: decision.baselineRegion,
    carbonIntensity: decision.carbonIntensityChosenGPerKwh,
    carbonDeltaGPerKwh: delta,
    qualityTier: deriveQualityTier(decision),
    reason: decision.reason,
  }
}

function getPolicyAction(decision: DashboardDecision): string | null {
  const actionTaken = decision.meta?.actionTaken
  return typeof actionTaken === 'string' && actionTaken.length > 0 ? actionTaken : null
}

function getQualityScore(decision: DashboardDecision) {
  const chosen = decision.carbonIntensityChosenGPerKwh ?? null
  const baseline = decision.carbonIntensityBaselineGPerKwh ?? null

  if (chosen == null || baseline == null || baseline <= 0) return 0

  const rawScore = (baseline - chosen) / baseline
  return Number.isFinite(rawScore) ? Math.max(0, Math.min(1, rawScore)) : 0
}

function toDekesHandoff(decision: DashboardDecision): DekesHandoff {
  const eventType = getEventType(decision)
  const qualityTier = deriveQualityTier(decision)
  const carbonIntensity = decision.carbonIntensityChosenGPerKwh ?? 0
  const baselineIntensity = decision.carbonIntensityBaselineGPerKwh ?? carbonIntensity
  const carbonDelta = Math.max(0, baselineIntensity - carbonIntensity)
  const actionTaken = getPolicyAction(decision)
  const severity =
    eventType === 'HIGH_CARBON_PATTERN' || eventType === 'LOW_CONFIDENCE_REGION'
      ? 'high'
      : eventType === 'POLICY_DELAY'
        ? 'medium'
        : 'low'

  return {
    handoffId: decision.id,
    organizationId: decision.organizationId ?? 'ecobe',
    decisionId: decision.id,
    decisionFrameId:
      typeof decision.meta?.decisionFrameId === 'string' ? decision.meta.decisionFrameId : null,
    eventType,
    severity,
    timestamp: decision.createdAt,
    status: decision.fallbackUsed ? 'failed' : 'processed',
    dekesClassification:
      eventType === 'HIGH_CARBON_PATTERN' || eventType === 'LOW_CONFIDENCE_REGION'
        ? 'risk'
        : eventType === 'CLEAN_WINDOW_OPPORTUNITY'
          ? 'opportunity'
          : 'informational',
    dekesActionType: actionTaken,
    dekesActionId:
      typeof decision.meta?.actionId === 'string' && decision.meta.actionId.length > 0
        ? decision.meta.actionId
        : null,
    processedAt: decision.createdAt,
    routing: {
      selectedRegion: decision.chosenRegion,
      baselineRegion: decision.baselineRegion,
      carbonIntensity,
      carbonDeltaGPerKwh: carbonDelta,
      qualityTier,
      forecastStability:
        qualityTier === 'high' ? 'stable' : qualityTier === 'medium' ? 'medium' : 'unstable',
      score: getQualityScore(decision),
    },
    budget: null,
    policy: {
      policyName:
        typeof decision.meta?.policyMode === 'string' ? decision.meta.policyMode : null,
      actionTaken,
    },
    explanation: decision.reason,
    replayUrl:
      typeof decision.meta?.decisionFrameId === 'string'
        ? `/console?tab=routing&decisionFrameId=${encodeURIComponent(decision.meta.decisionFrameId)}`
        : null,
  }
}

function buildHourlyTrend(decisions: DashboardDecision[]) {
  const hourly = new Map<
    string,
    {
      hour: string
      requestCount: number
      totalCO2Kg: number
    }
  >()

  for (const decision of decisions) {
    const date = new Date(decision.createdAt)
    const hour = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), 0, 0, 0)
    )
      .toISOString()
      .slice(0, 13)

    const current = hourly.get(hour) ?? { hour, requestCount: 0, totalCO2Kg: 0 }
    current.requestCount += 1
    current.totalCO2Kg += toKg(decision.co2ChosenG)
    hourly.set(hour, current)
  }

  return Array.from(hourly.values())
    .sort((left, right) => left.hour.localeCompare(right.hour))
    .map((point) => ({
      hour: point.hour,
      requestCount: point.requestCount,
      avgCO2: point.requestCount > 0 ? point.totalCO2Kg / point.requestCount : 0,
    }))
}

export async function buildDekesRuntimeReadModel(limit = 96): Promise<DekesRuntimeReadModel> {
  const [decisionPayload, systemStatus] = await Promise.all([
    fetchEngineJson<{ decisions: DashboardDecision[] }>(`/api/v1/dashboard/decisions?limit=${Math.max(limit, 200)}`),
    fetchEngineJson<EngineSystemStatus>('/api/v1/system/status', true).catch(() => null),
  ])

  const decisions = getDekesDecisions(decisionPayload?.decisions ?? [])
  const totalWorkloads = decisions.length
  const totalCO2Kg = decisions.reduce((sum, decision) => sum + toKg(decision.co2ChosenG), 0)
  const totalEvents = decisions.length
  const avgResponseTimeMs =
    decisions.length > 0
      ? decisions.reduce((sum, decision) => sum + (decision.latencyEstimateMs ?? 0), 0) / decisions.length
      : 0

  const successfulWorkloads = totalWorkloads
  const successRate = totalWorkloads > 0 ? 100 : 0
  const failureRate = totalWorkloads > 0 ? 0 : 0
  const now = systemStatus?.timestamp ?? new Date().toISOString()
  const status = systemStatus?.status ?? 'healthy'

  const events = decisions
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit)
    .map((decision) => ({
      id: decision.id,
      timestamp: decision.createdAt,
      type: getEventType(decision),
      message: getEventMessage(decision),
      status: getEventStatus(decision),
    }))

  return {
    summary: {
      status,
      integration: 'decision-read-model',
      lastSync: now,
      metrics: {
        totalWorkloads,
        successfulWorkloads,
        successRate,
        totalCO2Kg,
        avgCO2PerWorkload: totalWorkloads > 0 ? totalCO2Kg / totalWorkloads : 0,
        timeRange: 'decision window',
      },
    },
    metrics: {
      integration: 'decision-read-model',
      status,
      timeRange: 'decision window',
      metrics: {
        successRate,
        failureRate,
        totalEvents,
        totalWorkloads,
        avgResponseTimeMs,
        uptime: status === 'healthy' ? 100 : 0,
      },
      hourlyTrend: buildHourlyTrend(decisions),
      lastChecked: now,
    },
    events: {
      source: 'dashboard-read-model',
      timeRange: 'latest decision events',
      total: totalEvents,
      events,
    },
  }
}

export async function getDekesRuntimeHandoffById(handoffId: string): Promise<DekesHandoff | null> {
  const decisionPayload = await fetchEngineJson<{ decisions: DashboardDecision[] }>(
    `/api/v1/dashboard/decisions?limit=400`
  )
  const decision = getDekesDecisions(decisionPayload?.decisions ?? []).find(
    (candidate) => candidate.id === handoffId
  )

  return decision ? toDekesHandoff(decision) : null
}
