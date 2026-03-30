import { NextResponse } from 'next/server'

import { getLiveSystemSnapshot } from '@/lib/control-surface/live-system'
import { getCachedSnapshot } from '@/lib/control-surface/snapshot-cache'
import {
  dashboardTelemetryMetricNames,
  recordDashboardMetric,
} from '@/lib/observability/telemetry'

export const dynamic = 'force-dynamic'

const LIVE_SYSTEM_CACHE_TTL_MS = 5_000
const SNAPSHOT_CACHE_CONTROL = 'public, max-age=0, s-maxage=5, stale-while-revalidate=10'

export async function GET() {
  const startedAt = performance.now()
  try {
    const { value: snapshot, cacheStatus } = await getCachedSnapshot(
      'live-system',
      LIVE_SYSTEM_CACHE_TTL_MS,
      getLiveSystemSnapshot
    )
    const serialized = JSON.stringify(snapshot)
    const totalMs = performance.now() - startedAt
    const responseBytes = Buffer.byteLength(serialized)

    recordDashboardMetric(dashboardTelemetryMetricNames.routeDurationMs, 'histogram', totalMs, {
      route: 'live-system',
      cacheStatus,
    })
    recordDashboardMetric(dashboardTelemetryMetricNames.routeResponseBytes, 'histogram', responseBytes, {
      route: 'live-system',
      cacheStatus,
    })
    recordDashboardMetric(dashboardTelemetryMetricNames.routeCacheCount, 'counter', 1, {
      route: 'live-system',
      cacheStatus,
    })

    const response = new NextResponse(serialized, {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })
    response.headers.set('x-co2router-snapshot-cache', cacheStatus)
    response.headers.set('x-co2router-response-bytes', String(responseBytes))
    response.headers.set('Cache-Control', SNAPSHOT_CACHE_CONTROL)
    response.headers.set('Server-Timing', `total;dur=${totalMs.toFixed(1)}`)
    return response
  } catch (error) {
    recordDashboardMetric(dashboardTelemetryMetricNames.routeErrorCount, 'counter', 1, {
      route: 'live-system',
    })
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to build live system snapshot',
      },
      { status: 500 }
    )
  }
}
