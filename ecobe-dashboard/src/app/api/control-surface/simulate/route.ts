import { NextResponse } from 'next/server'

import { fetchEngineJson } from '@/lib/control-surface/engine'
import {
  dashboardTelemetryMetricNames,
  recordDashboardMetric,
} from '@/lib/observability/telemetry'
import type {
  CiRouteResponse,
  SimulationFastResponse,
  SimulationMode,
} from '@/types/control-surface'

export const dynamic = 'force-dynamic'

const allowedJobTypes = new Set(['standard', 'heavy', 'light'])
const allowedCriticality = new Set(['critical', 'standard', 'batch'])
const allowedPolicyProfiles = new Set([
  'default',
  'drought_sensitive',
  'eu_data_center_reporting',
  'high_water_sensitivity',
])

function resolveMode(request: Request, payload: Record<string, unknown>): SimulationMode {
  const url = new URL(request.url)
  const queryMode = url.searchParams.get('mode')
  const payloadMode = typeof payload.mode === 'string' ? payload.mode : null
  return queryMode === 'full' || payloadMode === 'full' ? 'full' : 'fast'
}

function normalizePayload(raw: unknown) {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Simulation payload must be an object')
  }

  const payload = raw as Record<string, unknown>
  const preferredRegions = Array.isArray(payload.preferredRegions)
    ? payload.preferredRegions.filter((region): region is string => typeof region === 'string' && region.trim().length > 0)
    : []

  const carbonWeight = Number(payload.carbonWeight)
  const waterWeight = Number(payload.waterWeight)
  const latencyWeight = Number(payload.latencyWeight)
  const costWeight = Number(payload.costWeight)
  const estimatedEnergyKwh = Number(payload.estimatedEnergyKwh)
  const jobType = String(payload.jobType ?? 'standard')
  const criticality = String(payload.criticality ?? 'standard')
  const waterPolicyProfile = String(payload.waterPolicyProfile ?? 'default')
  const allowDelay = Boolean(payload.allowDelay)

  if (!preferredRegions.length) throw new Error('At least one preferred region is required')
  if (![carbonWeight, waterWeight, latencyWeight, costWeight].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error('Weights must be finite numbers between 0 and 1')
  }
  if (!Number.isFinite(estimatedEnergyKwh) || estimatedEnergyKwh <= 0) {
    throw new Error('estimatedEnergyKwh must be a positive number')
  }
  if (!allowedJobTypes.has(jobType)) throw new Error('Invalid jobType')
  if (!allowedCriticality.has(criticality)) throw new Error('Invalid criticality')
  if (!allowedPolicyProfiles.has(waterPolicyProfile)) throw new Error('Invalid waterPolicyProfile')

  return {
    preferredRegions,
    carbonWeight,
    waterWeight,
    latencyWeight,
    costWeight,
    jobType,
    criticality,
    waterPolicyProfile,
    allowDelay,
    estimatedEnergyKwh,
  }
}

function toFastSimulationResponse(data: CiRouteResponse): SimulationFastResponse {
  return {
    mode: 'fast',
    decision: data.decision,
    decisionMode: data.decisionMode,
    reasonCode: data.reasonCode,
    decisionFrameId: data.decisionFrameId,
    selectedRunner: data.selectedRunner,
    selectedRegion: data.selectedRegion,
    recommendation: data.recommendation,
    signalConfidence: data.signalConfidence,
    fallbackUsed: data.fallbackUsed,
    signalMode: data.signalMode,
    accountingMethod: data.accountingMethod,
    notBefore: data.notBefore,
    proofHash: data.proofHash,
    waterAuthority: data.waterAuthority,
    baseline: data.baseline,
    selected: data.selected,
    savings: data.savings,
    policyTrace: {
      policyVersion: data.policyTrace.policyVersion,
      profile: data.policyTrace.profile,
      reasonCodes: data.policyTrace.reasonCodes,
      precedenceOverrideApplied: data.policyTrace.precedenceOverrideApplied,
      operatingMode: data.policyTrace.operatingMode,
      sekedPolicy: data.policyTrace.sekedPolicy,
      externalPolicy: data.policyTrace.externalPolicy,
    },
    latencyMs: data.latencyMs,
    proofRef: {
      proofHash: data.proofHash,
      decisionFrameId: data.decisionFrameId,
      traceAvailable: data.decisionMode !== 'scenario_planning',
    },
  }
}

export async function POST(request: Request) {
  const startedAt = performance.now()

  try {
    const rawPayload = (await request.json()) as Record<string, unknown>
    const mode = resolveMode(request, rawPayload)
    const payload = normalizePayload(rawPayload)
    const enginePayload =
      mode === 'fast'
        ? {
            ...payload,
            decisionMode: 'scenario_planning' as const,
          }
        : payload

    const engineStartedAt = performance.now()
    const data = await fetchEngineJson<CiRouteResponse>('/ci/route', {
      method: 'POST',
      body: JSON.stringify(enginePayload),
      headers: {
        'x-co2router-response-tier': mode,
      },
    }, {
      internal: mode === 'fast',
    })
    const engineMs = performance.now() - engineStartedAt

    const responsePayload = mode === 'full' ? data : toFastSimulationResponse(data)
    const serializationStartedAt = performance.now()
    const serialized = JSON.stringify(responsePayload)
    const serializationMs = performance.now() - serializationStartedAt
    const totalMs = performance.now() - startedAt
    const responseBytes = Buffer.byteLength(serialized)

    recordDashboardMetric(dashboardTelemetryMetricNames.routeDurationMs, 'histogram', totalMs, {
      route: 'simulate',
      mode,
    })
    recordDashboardMetric(
      dashboardTelemetryMetricNames.simulationEngineDurationMs,
      'histogram',
      engineMs,
      {
        route: 'simulate',
        mode,
      }
    )
    recordDashboardMetric(
      dashboardTelemetryMetricNames.simulationSerializeDurationMs,
      'histogram',
      serializationMs,
      {
        route: 'simulate',
        mode,
      }
    )
    recordDashboardMetric(
      dashboardTelemetryMetricNames.routeResponseBytes,
      'histogram',
      responseBytes,
      {
        route: 'simulate',
        mode,
      }
    )

    const response = new NextResponse(serialized, {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })
    response.headers.set('x-co2router-sim-mode', mode)
    response.headers.set('x-co2router-response-bytes', String(responseBytes))
    response.headers.set(
      'Server-Timing',
      `engine;dur=${engineMs.toFixed(1)}, serialize;dur=${serializationMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`
    )

    return response
  } catch (error) {
    recordDashboardMetric(dashboardTelemetryMetricNames.routeErrorCount, 'counter', 1, {
      route: 'simulate',
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Simulation failed' },
      { status: 400 }
    )
  }
}
