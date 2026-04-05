import type {
  DekesHandoff,
  DekesIntegrationEventsResponse,
  DekesIntegrationMetricsResponse,
  DekesIntegrationSummaryResponse,
} from '@/types'

const DEFAULT_ENGINE_URL = 'https://ecobe-engineclaude-production.up.railway.app'

type DekesRuntimeReadModel = {
  summary: DekesIntegrationSummaryResponse
  metrics: DekesIntegrationMetricsResponse
  events: DekesIntegrationEventsResponse
}

type DekesHandoffsResponse = {
  handoffs: DekesHandoff[]
  total: number
  timeRange: string
}

function getEngineBaseUrl() {
  return (process.env.ECOBE_API_URL || DEFAULT_ENGINE_URL).replace(/\/$/, '')
}

async function fetchEngineJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getEngineBaseUrl()}${path}`, {
    headers: {
      accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Engine request failed for ${path} (${response.status})`)
  }

  return (await response.json()) as T
}

export async function buildDekesRuntimeReadModel(limit = 96): Promise<DekesRuntimeReadModel> {
  const [summary, metrics, events] = await Promise.all([
    fetchEngineJson<DekesIntegrationSummaryResponse>('/api/v1/integrations/dekes/summary'),
    fetchEngineJson<DekesIntegrationMetricsResponse>('/api/v1/integrations/dekes/metrics'),
    fetchEngineJson<DekesIntegrationEventsResponse>(
      `/api/v1/integrations/dekes/events?limit=${Math.max(1, limit)}`
    ),
  ])

  return {
    summary,
    metrics,
    events,
  }
}

export async function getDekesRuntimeHandoffById(handoffId: string): Promise<DekesHandoff | null> {
  const response = await fetchEngineJson<DekesHandoffsResponse>(
    `/api/v1/integrations/dekes/handoffs?handoffId=${encodeURIComponent(handoffId)}`
  )

  return response.handoffs[0] ?? null
}
