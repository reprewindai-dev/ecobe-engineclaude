import 'server-only'

import { getHallOGridFrameDetail, getHallOGridSnapshot } from './hallogrid'
import { getHallOGridProWorkspace } from './pro-workspace'
import { getCachedSnapshot, invalidateCachedSnapshotPrefix } from './snapshot-cache'
import {
  dashboardTelemetryMetricNames,
  recordDashboardMetric,
} from '@/lib/observability/telemetry'
import type {
  ControlSurfaceProviderNode,
  HallOGridConsoleAccess,
  HallOGridFrameDetail,
  HallOGridMirrorMetrics,
  HallOGridMirrorPosture,
  HallOGridProWorkspace,
  HallOGridSnapshot,
} from '@/types/control-surface'

const HOT_TTL_MS = 5_000
const WARM_TTL_MS = 15_000
const HOT_FRESHNESS_BUDGET_SEC = 120
const SAFE_DELAY_WINDOW_SEC = 5400
const WARM_FRESHNESS_BUDGET_SEC = 300
const LANE_LIMITS = {
  hot: 8,
  warm: 16,
  cold: 4,
} as const

type Lane = keyof typeof LANE_LIMITS

const laneActiveCounts = new Map<Lane, number>([
  ['hot', 0],
  ['warm', 0],
  ['cold', 0],
])

function percentile(values: number[], p: number) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)] ?? null
}

async function withLanePermit<T>(lane: Lane, task: () => Promise<T>) {
  const current = laneActiveCounts.get(lane) ?? 0
  if (current >= LANE_LIMITS[lane]) {
    recordDashboardMetric(dashboardTelemetryMetricNames.laneBackpressureCount, 'counter', 1, {
      lane,
    })
    throw new Error(`${lane} lane is saturated`)
  }

  laneActiveCounts.set(lane, current + 1)
  try {
    return await task()
  } finally {
    laneActiveCounts.set(lane, Math.max(0, (laneActiveCounts.get(lane) ?? 1) - 1))
  }
}

function maxProviderFreshnessSec(providers: ControlSurfaceProviderNode[]) {
  const freshnessValues = providers
    .map((provider) => provider.freshnessSec)
    .filter((value): value is number => typeof value === 'number' && value >= 0)

  if (freshnessValues.length === 0) return null
  return Math.max(...freshnessValues)
}

function hasDegradedProvider(providers: ControlSurfaceProviderNode[]) {
  return providers.some((provider) => provider.status !== 'healthy')
}

function summarizeProviderDegradation(providers: ControlSurfaceProviderNode[]) {
  const degraded = providers.filter((provider) => provider.status === 'degraded')
  if (degraded.length > 0) {
    return degraded[0]?.degradedReason ?? `${degraded.length} provider mirrors are degraded.`
  }

  const offline = providers.filter((provider) => provider.status === 'offline')
  if (offline.length > 0) {
    return `${offline.length} provider mirrors are offline.`
  }

  return null
}

function buildMirrorMetrics(
  snapshot: Pick<HallOGridSnapshot, 'frames' | 'health'>,
  mirrorGenerationMs: number,
  sourceFreshnessSec: number | null,
  replayGenerationMs: number | null = null,
  exportQueueDepth = 0
): HallOGridMirrorMetrics {
  const decisionTotals = snapshot.frames
    .map((frame) => frame.metrics.totalLatencyMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const decisionP50Ms = percentile(decisionTotals, 50)
  const decisionP95Ms = percentile(decisionTotals, 95)
  const decisionP99Ms = percentile(decisionTotals, 99)

  const consoleP95 = snapshot.health.latency.p95TotalMs
  const consoleP50 = decisionP50Ms

  return {
    decisionP50Ms,
    decisionP95Ms,
    decisionP99Ms,
    consoleSnapshotP50Ms: consoleP50,
    consoleSnapshotP95Ms: consoleP95,
    providerRefreshAgeSec: sourceFreshnessSec,
    mirrorGenerationMs: Number(mirrorGenerationMs.toFixed(1)),
    replayGenerationMs,
    exportQueueDepth,
  }
}

function buildPosture(
  snapshot: Pick<HallOGridSnapshot, 'frames' | 'health'>,
  access: HallOGridConsoleAccess,
  lane: 'hot' | 'warm' | 'cold',
  mirrorGeneratedAt: string,
  mirrorGenerationMs: number,
  replayGenerationMs: number | null = null
): HallOGridMirrorPosture {
  const sourceFreshnessSec = maxProviderFreshnessSec(snapshot.health.providers)
  const freshnessBudgetSec = lane === 'hot' ? HOT_FRESHNESS_BUDGET_SEC : WARM_FRESHNESS_BUDGET_SEC
  const freshnessBreached =
    sourceFreshnessSec != null && sourceFreshnessSec > freshnessBudgetSec
  const degraded = hasDegradedProvider(snapshot.health.providers) || freshnessBreached
  const degradedReason = freshnessBreached
    ? 'Provider freshness exceeded the safe mirror budget.'
    : summarizeProviderDegradation(snapshot.health.providers)

  return {
    tenantId: access.tenantId,
    generatedAt: mirrorGeneratedAt,
    sourceFreshnessSec,
    freshnessBudgetSec,
    safeDelayWindowSec: SAFE_DELAY_WINDOW_SEC,
    mirrorMode: lane,
    degraded,
    degradedReason,
    laneBudgets: {
      hotP95Ms: 100,
      warmP95Ms: 250,
      coldQueued: true,
    },
    metrics: buildMirrorMetrics(snapshot, mirrorGenerationMs, sourceFreshnessSec, replayGenerationMs),
  }
}

function hotMirrorKey(access: HallOGridConsoleAccess) {
  return `hallogrid-hot:${access.tenantId}:${access.mode}:${access.role}:${access.canViewCompliance ? 'compliance' : 'standard'}`
}

function warmFrameKey(access: HallOGridConsoleAccess, frameId: string) {
  return `hallogrid-warm-frame:${access.tenantId}:${frameId}:${access.mode}`
}

function warmWorkspaceKey(access: HallOGridConsoleAccess, frameId: string) {
  return `hallogrid-warm-workspace:${access.tenantId}:${frameId}:${access.mode}`
}

export function invalidateHallOGridMirror(access: HallOGridConsoleAccess, decisionFrameId?: string) {
  const tenantPrefix = `${access.tenantId}:`
  invalidateCachedSnapshotPrefix(`hallogrid-hot:${tenantPrefix}`)
  if (decisionFrameId) {
    invalidateCachedSnapshotPrefix(`hallogrid-warm-frame:${tenantPrefix}${decisionFrameId}:`)
    invalidateCachedSnapshotPrefix(`hallogrid-warm-workspace:${tenantPrefix}${decisionFrameId}:`)
  } else {
    invalidateCachedSnapshotPrefix(`hallogrid-warm-frame:${tenantPrefix}`)
    invalidateCachedSnapshotPrefix(`hallogrid-warm-workspace:${tenantPrefix}`)
  }
}

export async function getHallOGridHotMirror(access: HallOGridConsoleAccess): Promise<HallOGridSnapshot> {
  const { value } = await getCachedSnapshot(
    hotMirrorKey(access),
    HOT_TTL_MS,
    () =>
      withLanePermit('hot', async () => {
        const startedAt = performance.now()
        const snapshot = await getHallOGridSnapshot()
        const mirrorGeneratedAt = new Date().toISOString()
        const mirror = buildPosture(
          snapshot,
          access,
          'hot',
          mirrorGeneratedAt,
          performance.now() - startedAt
        )

        recordDashboardMetric(dashboardTelemetryMetricNames.mirrorGenerationMs, 'histogram', mirror.metrics.mirrorGenerationMs ?? 0, {
          lane: 'hot',
          tenantId: access.tenantId,
        })
        recordDashboardMetric(dashboardTelemetryMetricNames.providerRefreshAgeSec, 'gauge', mirror.metrics.providerRefreshAgeSec ?? 0, {
          lane: 'hot',
          tenantId: access.tenantId,
        })

        return {
          ...snapshot,
          access,
          generatedAt: mirrorGeneratedAt,
          selectedFrame: snapshot.selectedFrame
            ? {
                ...snapshot.selectedFrame,
                generatedAt: mirror.generatedAt,
                mirror,
              }
            : null,
          mirror,
        }
      })
  )

  return value
}

export async function getHallOGridWarmFrameDetail(
  access: HallOGridConsoleAccess,
  decisionFrameId: string
): Promise<HallOGridFrameDetail | null> {
  const hotMirror = await getHallOGridHotMirror(access)
  if (!hotMirror.frames.some((frame) => frame.id === decisionFrameId)) return null

  const { value } = await getCachedSnapshot(
    warmFrameKey(access, decisionFrameId),
    WARM_TTL_MS,
    () =>
      withLanePermit('warm', async () => {
        const startedAt = performance.now()
        const detail = await getHallOGridFrameDetail(decisionFrameId)
        if (!detail) {
          throw new Error('Frame detail not found')
        }

        const replayGenerationMs = Number((performance.now() - startedAt).toFixed(1))
        const mirror = buildPosture(
          hotMirror,
          access,
          'warm',
          new Date().toISOString(),
          replayGenerationMs,
          replayGenerationMs
        )

        recordDashboardMetric(dashboardTelemetryMetricNames.mirrorGenerationMs, 'histogram', mirror.metrics.mirrorGenerationMs ?? 0, {
          lane: 'warm',
          tenantId: access.tenantId,
        })
        recordDashboardMetric(dashboardTelemetryMetricNames.replayGenerationMs, 'histogram', replayGenerationMs, {
          lane: 'warm',
          tenantId: access.tenantId,
        })

        return {
          ...detail,
          generatedAt: mirror.generatedAt,
          mirror,
        }
      })
  )

  return value
}

export async function getHallOGridWarmWorkspace(
  access: HallOGridConsoleAccess,
  decisionFrameId: string
): Promise<HallOGridProWorkspace | null> {
  const hotMirror = await getHallOGridHotMirror(access)
  if (!hotMirror.frames.some((frame) => frame.id === decisionFrameId)) return null

  const { value } = await getCachedSnapshot(
    warmWorkspaceKey(access, decisionFrameId),
    WARM_TTL_MS,
    () =>
      withLanePermit('warm', async () => {
        const startedAt = performance.now()
        const workspace = await getHallOGridProWorkspace(decisionFrameId)
        if (!workspace) {
          throw new Error('Pro workspace not found')
        }

        const generationMs = Number((performance.now() - startedAt).toFixed(1))
        const mirror = buildPosture(
          hotMirror,
          access,
          'warm',
          new Date().toISOString(),
          generationMs,
          generationMs
        )

        recordDashboardMetric(dashboardTelemetryMetricNames.mirrorGenerationMs, 'histogram', generationMs, {
          lane: 'warm-workspace',
          tenantId: access.tenantId,
        })

        return {
          ...workspace,
          generatedAt: mirror.generatedAt,
          mirror,
        }
      })
  )

  return value
}
