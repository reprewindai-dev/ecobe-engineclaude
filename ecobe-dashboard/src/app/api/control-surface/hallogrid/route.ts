import { NextResponse } from 'next/server'

import { resolveHallOGridAccess } from '@/lib/control-surface/access'
import { getHallOGridHotMirror } from '@/lib/control-surface/hallogrid-mirror'
import {
  dashboardTelemetryMetricNames,
  recordDashboardMetric,
} from '@/lib/observability/telemetry'
import type { HallOGridSnapshot } from '@/types/control-surface'

export const dynamic = 'force-dynamic'

const SNAPSHOT_CACHE_CONTROL = 'public, max-age=0, s-maxage=5, stale-while-revalidate=10'

type PreviewNode = HallOGridSnapshot['world']['nodes'][number]

function toPreviewTimestamp(value: string, redactionDelayMinutes: number) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  parsed.setMinutes(parsed.getMinutes() - redactionDelayMinutes)
  parsed.setSeconds(0, 0)
  return parsed.toISOString()
}

function previewFrameId(frameId: string, index: number) {
  const suffix = frameId.slice(-4).toUpperCase()
  return `FRAME-${String(index + 1).padStart(2, '0')}-${suffix}`
}

function previewReasonLabel(label: string) {
  if (!label) return 'Governed execution posture'
  return label.replace(/\b(SEKED|POLICY|RED ZONE|HOOK)\b/gi, 'Governed')
}

function previewHeadline(region: string, action: string) {
  return `Governed ${action.replace(/_/g, ' ')} | ${region} | delayed mirror`
}

function stateRank(state: PreviewNode['state']) {
  switch (state) {
    case 'blocked':
      return 2
    case 'marginal':
      return 1
    default:
      return 0
  }
}

function confidenceTierRank(tier: PreviewNode['confidenceTier']) {
  switch (tier) {
    case 'low':
      return 0
    case 'medium':
      return 1
    default:
      return 2
  }
}

function freshnessRank(state: PreviewNode['freshnessState']) {
  switch (state) {
    case 'stale':
      return 2
    case 'degraded':
      return 1
    default:
      return 0
  }
}

function pressureRank(level: PreviewNode['pressureLevel']) {
  switch (level) {
    case 'high':
      return 2
    case 'medium':
      return 1
    default:
      return 0
  }
}

function mergePreviewNode(current: PreviewNode, incoming: PreviewNode): PreviewNode {
  const currentStateRank = stateRank(current.state)
  const incomingStateRank = stateRank(incoming.state)
  const primary = incomingStateRank > currentStateRank ? incoming : current
  const latestChangedAt = [current.lastChangedAt, incoming.lastChangedAt]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]

  return {
    ...primary,
    label: current.label,
    x: Math.round((current.x + incoming.x) / 2),
    y: Math.round((current.y + incoming.y) / 2),
    decisionFrameId: null,
    confidenceTier:
      confidenceTierRank(incoming.confidenceTier) < confidenceTierRank(current.confidenceTier)
        ? incoming.confidenceTier
        : current.confidenceTier,
    freshnessState:
      freshnessRank(incoming.freshnessState) > freshnessRank(current.freshnessState)
        ? incoming.freshnessState
        : current.freshnessState,
    pressureLevel:
      pressureRank(incoming.pressureLevel) > pressureRank(current.pressureLevel)
        ? incoming.pressureLevel
        : current.pressureLevel,
    signalConfidence:
      current.signalConfidence == null
        ? incoming.signalConfidence
        : incoming.signalConfidence == null
          ? current.signalConfidence
          : Math.min(current.signalConfidence, incoming.signalConfidence),
    providerHealth: current.providerHealth || incoming.providerHealth
      ? {
          healthy: Math.max(current.providerHealth?.healthy ?? 0, incoming.providerHealth?.healthy ?? 0),
          degraded: Math.max(current.providerHealth?.degraded ?? 0, incoming.providerHealth?.degraded ?? 0),
          offline: Math.max(current.providerHealth?.offline ?? 0, incoming.providerHealth?.offline ?? 0),
        }
      : undefined,
    lastChangedAt: latestChangedAt,
    routePressure: Math.max(current.routePressure ?? 0, incoming.routePressure ?? 0) || undefined,
    blockedFocusLanes:
      Math.max(current.blockedFocusLanes ?? 0, incoming.blockedFocusLanes ?? 0) || undefined,
    selected: false,
  }
}

function redactPreviewSnapshot(snapshot: HallOGridSnapshot): HallOGridSnapshot {
  const regionMap = new Map<string, string>()
  const labelMap = new Map<string, string>()
  const previewNodesByRegion = new Map<string, PreviewNode>()

  snapshot.world.nodes.forEach((node) => {
    const abstractRegion = node.region
      .replace(/-\d+$/g, '')
      .replace(/\b(ap|eu|us)-/g, (match) => match.toUpperCase())
      .toUpperCase()
    const abstractLabel = node.label
      .replace(/\b\d+\b/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()

    regionMap.set(node.region, abstractRegion)
    labelMap.set(node.region, abstractLabel)
    const previewNode: PreviewNode = {
      ...node,
      region: abstractRegion,
      label: abstractLabel,
      decisionFrameId: null,
      lastChangedAt: node.lastChangedAt
        ? toPreviewTimestamp(node.lastChangedAt, snapshot.access.redactionDelayMinutes)
        : undefined,
      selected: false,
    }
    const current = previewNodesByRegion.get(abstractRegion)
    previewNodesByRegion.set(
      abstractRegion,
      current ? mergePreviewNode(current, previewNode) : previewNode
    )
  })

  const previewNodes = Array.from(previewNodesByRegion.values())

  const previewFrames = snapshot.frames.map((frame, index) => {
    const previewRegion = regionMap.get(frame.region) ?? frame.region
    const previewLabel = labelMap.get(frame.region) ?? frame.region
    const previewCreatedAt = toPreviewTimestamp(frame.createdAt, snapshot.access.redactionDelayMinutes)

    return {
      ...frame,
      id: previewFrameId(frame.id, index),
      createdAt: previewCreatedAt,
      region: previewRegion,
      reasonLabel: previewReasonLabel(frame.reasonLabel),
      explanation: {
        headline: previewHeadline(previewLabel, frame.action),
        dominantConstraint: 'No safe immediate execution path satisfied doctrine and environmental integrity.',
        counterfactual: 'Counterfactual branches and full replay stay inside HallOGrid Pro.',
      },
    }
  })

  return {
    ...snapshot,
    generatedAt: toPreviewTimestamp(snapshot.generatedAt, snapshot.access.redactionDelayMinutes),
    title: 'Preview Console',
    subtitle: 'Public live mirror of HallOGrid operator authority',
    mirror: {
      ...snapshot.mirror,
      tenantId: 'public-preview',
      generatedAt: toPreviewTimestamp(snapshot.mirror.generatedAt, snapshot.access.redactionDelayMinutes),
      degradedReason: snapshot.mirror.degraded ? 'Freshness or provider posture exceeded the safe mirror window.' : null,
    },
    selectedFrameId: previewFrames[0]?.id ?? null,
    selectedFrame: null,
    frames: previewFrames,
    world: {
      nodes: previewNodes,
      flows: Array.from(
        snapshot.world.flows.reduce((deduped, flow) => {
          const fromRegion = regionMap.get(flow.fromRegion) ?? flow.fromRegion
          const toRegion = regionMap.get(flow.toRegion) ?? flow.toRegion
          if (fromRegion === toRegion) return deduped

          const key = `${fromRegion}->${toRegion}`
          const current = deduped.get(key)
          deduped.set(key, {
            id: current?.id ?? `preview:${key}`,
            fromRegion,
            toRegion,
            mode:
              current?.mode === 'blocked' || flow.mode === 'blocked' ? 'blocked' : 'route',
          })
          return deduped
        }, new Map<string, HallOGridSnapshot['world']['flows'][number]>()).values()
      ),
    },
    traceStream: {
      items: snapshot.traceStream.items.map((item, index) => ({
        ...item,
        decisionFrameId: previewFrameId(item.decisionFrameId, index),
        createdAt: toPreviewTimestamp(item.createdAt, snapshot.access.redactionDelayMinutes),
        region: regionMap.get(item.region) ?? item.region,
        reasonCode: 'GOVERNED_PREVIEW',
      })),
    },
  }
}

export async function GET(request: Request) {
  const startedAt = performance.now()
  const access = resolveHallOGridAccess(request)

  try {
    const baseSnapshot = await getHallOGridHotMirror(access)
    const snapshot = access.isReadOnlyPreview ? redactPreviewSnapshot(baseSnapshot) : baseSnapshot
    const serialized = JSON.stringify(snapshot)
    const totalMs = performance.now() - startedAt
    const responseBytes = Buffer.byteLength(serialized)

    recordDashboardMetric(dashboardTelemetryMetricNames.routeDurationMs, 'histogram', totalMs, {
      route: 'hallogrid',
      cacheStatus: 'mirror',
      tenantId: access.tenantId,
    })
    recordDashboardMetric(dashboardTelemetryMetricNames.routeResponseBytes, 'histogram', responseBytes, {
      route: 'hallogrid',
      cacheStatus: 'mirror',
      tenantId: access.tenantId,
    })
    recordDashboardMetric(dashboardTelemetryMetricNames.routeCacheCount, 'counter', 1, {
      route: 'hallogrid',
      cacheStatus: 'mirror',
      tenantId: access.tenantId,
    })

    const response = new NextResponse(serialized, {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })
    response.headers.set('x-co2router-snapshot-cache', 'mirror')
    response.headers.set('x-co2router-response-bytes', String(responseBytes))
    response.headers.set(
      'Cache-Control',
      access.isReadOnlyPreview ? SNAPSHOT_CACHE_CONTROL : 'private, no-store'
    )
    response.headers.set('Server-Timing', `total;dur=${totalMs.toFixed(1)}`)
    return response
  } catch (error) {
    recordDashboardMetric(dashboardTelemetryMetricNames.routeErrorCount, 'counter', 1, {
      route: 'hallogrid',
    })
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to build HallOGrid snapshot',
      },
      { status: 500 }
    )
  }
}
