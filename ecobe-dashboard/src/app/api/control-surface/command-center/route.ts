import { NextResponse } from 'next/server'

import { resolveHallOGridAccess } from '@/lib/control-surface/access'
import { getCommandCenterSnapshot } from '@/lib/control-surface/command-center'
import { getCachedSnapshot } from '@/lib/control-surface/snapshot-cache'
import {
  dashboardTelemetryMetricNames,
  recordDashboardMetric,
} from '@/lib/observability/telemetry'

export const dynamic = 'force-dynamic'

const COMMAND_CENTER_CACHE_TTL_MS = 5_000
export async function GET(request: Request) {
  const startedAt = performance.now()
  const access = resolveHallOGridAccess(request)

  if (access.isReadOnlyPreview) {
    return NextResponse.json(
      {
        error: 'The raw operator command center is restricted to Pro environments.',
        upgradeUrl: access.upgradeUrl,
      },
      {
        status: 403,
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    )
  }

  try {
    const { value: snapshot, cacheStatus } = await getCachedSnapshot(
      `command-center:${access.tenantId}:${access.mode}:${access.role}`,
      COMMAND_CENTER_CACHE_TTL_MS,
      getCommandCenterSnapshot
    )
    const serialized = JSON.stringify(snapshot)
    const totalMs = performance.now() - startedAt
    const responseBytes = Buffer.byteLength(serialized)

    recordDashboardMetric(dashboardTelemetryMetricNames.routeDurationMs, 'histogram', totalMs, {
      route: 'command-center',
      cacheStatus,
      tenantId: access.tenantId,
    })
    recordDashboardMetric(dashboardTelemetryMetricNames.routeResponseBytes, 'histogram', responseBytes, {
      route: 'command-center',
      cacheStatus,
      tenantId: access.tenantId,
    })
    recordDashboardMetric(dashboardTelemetryMetricNames.routeCacheCount, 'counter', 1, {
      route: 'command-center',
      cacheStatus,
      tenantId: access.tenantId,
    })

    const response = new NextResponse(serialized, {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })
    response.headers.set('x-co2router-snapshot-cache', cacheStatus)
    response.headers.set('x-co2router-response-bytes', String(responseBytes))
    response.headers.set('Cache-Control', 'private, no-store')
    response.headers.set('Server-Timing', `total;dur=${totalMs.toFixed(1)}`)
    return response
  } catch (error) {
    recordDashboardMetric(dashboardTelemetryMetricNames.routeErrorCount, 'counter', 1, {
      route: 'command-center',
    })
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to build command center snapshot',
      },
      { status: 500 }
    )
  }
}
