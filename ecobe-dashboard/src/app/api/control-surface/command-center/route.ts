import { NextResponse } from 'next/server'

import { FALLBACK_COMMAND_CENTER_SNAPSHOT } from '@/lib/control-surface/fallbacks'
import { getCommandCenterSnapshot } from '@/lib/control-surface/command-center'
import { getCachedSnapshot } from '@/lib/control-surface/snapshot-cache'
import {
  dashboardTelemetryMetricNames,
  recordDashboardMetric,
} from '@/lib/observability/telemetry'

export const dynamic = 'force-dynamic'

const COMMAND_CENTER_CACHE_TTL_MS = 5_000
const COMMAND_CENTER_SNAPSHOT_TIMEOUT_MS = 12_000
const SNAPSHOT_CACHE_CONTROL = 'public, max-age=0, s-maxage=5, stale-while-revalidate=10'

async function getCommandCenterSnapshotWithTimeout() {
  const timeout = new Promise<'timeout'>((resolve) => {
    setTimeout(() => resolve('timeout'), COMMAND_CENTER_SNAPSHOT_TIMEOUT_MS)
  })

  const result = await Promise.race([
    getCachedSnapshot('command-center', COMMAND_CENTER_CACHE_TTL_MS, getCommandCenterSnapshot),
    timeout,
  ])

  if (result === 'timeout') {
    return {
      value: FALLBACK_COMMAND_CENTER_SNAPSHOT,
      cacheStatus: 'fallback' as const,
    }
  }

  return result
}

export async function GET() {
  const startedAt = performance.now()
  try {
    const { value: snapshot, cacheStatus } = await getCommandCenterSnapshotWithTimeout()
    const serialized = JSON.stringify(snapshot)
    const totalMs = performance.now() - startedAt
    const responseBytes = Buffer.byteLength(serialized)

    recordDashboardMetric(dashboardTelemetryMetricNames.routeDurationMs, 'histogram', totalMs, {
      route: 'command-center',
      cacheStatus,
    })
    recordDashboardMetric(dashboardTelemetryMetricNames.routeResponseBytes, 'histogram', responseBytes, {
      route: 'command-center',
      cacheStatus,
    })
    recordDashboardMetric(dashboardTelemetryMetricNames.routeCacheCount, 'counter', 1, {
      route: 'command-center',
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
      route: 'command-center',
    })
    const serialized = JSON.stringify(FALLBACK_COMMAND_CENTER_SNAPSHOT)
    const response = new NextResponse(serialized, {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })
    response.headers.set('x-co2router-snapshot-cache', 'fallback')
    response.headers.set('x-co2router-response-bytes', String(Buffer.byteLength(serialized)))
    response.headers.set('Cache-Control', SNAPSHOT_CACHE_CONTROL)
    response.headers.set('Server-Timing', `total;dur=${(performance.now() - startedAt).toFixed(1)}`)
    return response
  }
}
