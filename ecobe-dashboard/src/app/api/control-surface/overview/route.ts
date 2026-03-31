import { NextResponse } from 'next/server'

import { fetchEngineJson, hasInternalApiKey } from '@/lib/control-surface/engine'
import {
  dashboardTelemetryMetricNames,
  recordDashboardMetric,
} from '@/lib/observability/telemetry'
import type {
  ActionDistributionItem,
  CiHealthSnapshot,
  CiRouteResponse,
  CiSloSnapshot,
  ControlAction,
  ControlSurfaceDecisionSummary,
  ControlSurfaceOverview,
  ControlSurfaceProviderNode,
  ScenarioPreview,
  ControlSurfaceTimelineEvent,
  OutboxMetrics,
  ReplayBundle,
} from '@/types/control-surface'

export const dynamic = 'force-dynamic'

type DecisionRow = {
  decisionFrameId: string
  selectedRunner: string
  selectedRegion: string
  carbonIntensity: number
  baseline: number
  savings: number
  decisionAction?: ControlAction
  action?: ControlAction
  reasonCode: string
  signalConfidence: number
  decisionMode?: 'runtime_authorization' | 'scenario_planning'
  signalMode?: 'marginal' | 'average' | 'fallback'
  accountingMethod?: 'marginal' | 'flow-traced' | 'average'
  notBefore?: string | null
  proofHash?: string
  waterAuthorityMode?: 'basin' | 'facility_overlay' | 'fallback'
  waterScenario?: 'current' | '2030' | '2050' | '2080'
  facilityId?: string | null
  waterEvidenceRefs?: string[]
  waterImpactLiters: number | null
  waterBaselineLiters: number | null
  waterScarcityImpact: number | null
  waterStressIndex: number | null
  waterConfidence: number | null
  fallbackUsed: boolean
  jobType: string
  metadata: Record<string, unknown>
  latencyMs?: {
    total: number
    compute: number
    providerResolution?: number
    cacheStatus?: 'live' | 'warm' | 'redis' | 'lkg' | 'degraded-safe' | 'fallback'
    providers?: {
      electricityMaps?: number | null
      wattTime?: number | null
      validation?: number | null
    }
    withinEnvelope?: boolean
  } | null
  createdAt: string
}

type DecisionFeed = {
  decisions: DecisionRow[]
}

type ProviderTrustResponse = {
  freshness: Array<{
    provider: string
    latestObservedAt: string
    freshnessSec: number
    isStale: boolean
  }>
  providers: Record<
    string,
    Array<{
      zone: string
      signalType: string
        value: number
        confidence: number
        freshnessSec: number
        observedAt: string
        metadata?: Record<string, unknown> | null
      }>
  >
  waterProviders?: Array<{
    provider: string
    authorityRole?: 'baseline' | 'overlay' | 'facility'
    authorityStatus?: 'authoritative' | 'advisory' | 'fallback'
    region?: string
    scenario?: 'current' | '2030' | '2050' | '2080'
    authorityMode?: 'basin' | 'facility_overlay' | 'fallback'
    confidence?: number | null
    observedAt?: string | null
    evidenceRefs?: string[]
    metadata?: Record<string, unknown> | null
    freshnessSec?: number | null
    datasetVersion?: string | null
  }>
}

type LedgerSummary = {
  totalJobsRouted: number
  carbonAvoidedPeriodKg: number
  carbonReductionMultiplier: number | null
  highConfidenceDecisionPct: number
  providerDisagreementRatePct: number
}

type MetricsResponse = {
  totalDecisions: number
  fallbackRate: number
}

function toSourceMode(decision: DecisionRow): 'live' | 'mirrored' | 'fallback' {
  if (decision.fallbackUsed) return 'fallback'
  const sourceUsed = String((decision.metadata?.response as Record<string, unknown> | undefined)?.['source_used'] ?? '')
  return sourceUsed ? 'live' : 'mirrored'
}

function buildDecisionSummary(decision: DecisionRow): ControlSurfaceDecisionSummary {
  const waterSelected = decision.waterImpactLiters ?? 0
  const waterBaseline = decision.waterBaselineLiters ?? waterSelected
  const waterDelta = Number((waterBaseline - waterSelected).toFixed(3))
  const action = decision.action ?? decision.decisionAction ?? 'run_now'
  const workloadLabel =
    decision.jobType === 'heavy'
      ? 'GPU build pipeline'
      : decision.jobType === 'light'
        ? 'Light CI verification'
        : 'CI execution frame'

  return {
    decisionFrameId: decision.decisionFrameId,
    createdAt: decision.createdAt,
    workloadLabel,
    action,
    decisionMode: decision.decisionMode ?? 'runtime_authorization',
    reasonCode: decision.reasonCode,
    selectedRegion: decision.selectedRegion,
    selectedRunner: decision.selectedRunner,
    carbonIntensity: decision.carbonIntensity,
    baselineCarbonIntensity: decision.baseline,
    carbonReductionPct: decision.savings,
    waterSelectedLiters: waterSelected,
    waterBaselineLiters: waterBaseline,
    waterImpactDeltaLiters: waterDelta,
    waterScarcityImpact: decision.waterScarcityImpact ?? 0,
    waterStressIndex: decision.waterStressIndex ?? 0,
    signalConfidence: decision.signalConfidence,
    fallbackUsed: decision.fallbackUsed,
    sourceMode: toSourceMode(decision),
    signalMode: decision.signalMode ?? 'fallback',
    accountingMethod: decision.accountingMethod ?? 'average',
    waterAuthorityMode: decision.waterAuthorityMode ?? 'fallback',
    waterScenario: decision.waterScenario ?? 'current',
    facilityId: decision.facilityId ?? null,
    precedenceOverrideApplied: Boolean((decision.metadata?.response as Record<string, unknown> | undefined)?.['policyTrace'] && ((decision.metadata?.response as Record<string, any>)?.policyTrace?.precedenceOverrideApplied)),
    notBefore: decision.notBefore ?? null,
    proofHash:
      decision.proofHash ??
      String((decision.metadata?.response as Record<string, unknown> | undefined)?.['proofHash'] ?? 'unavailable'),
    latencyMs: decision.latencyMs ?? null,
    summaryReason: action === 'delay'
      ? 'Held for a safer carbon-water window'
      : action === 'reroute'
        ? 'Shifted to a cleaner execution region'
        : action === 'throttle'
          ? 'Rate limited under strict policy pressure'
          : action === 'deny'
            ? 'Blocked by deterministic doctrine'
            : 'Allowed to execute under current conditions',
  }
}

function buildActionDistribution(decisions: ControlSurfaceDecisionSummary[]): ActionDistributionItem[] {
  const counts: Record<ControlAction, number> = {
    run_now: 0,
    reroute: 0,
    delay: 0,
    throttle: 0,
    deny: 0,
  }
  decisions.forEach((decision) => {
    counts[decision.action] += 1
  })
  const total = decisions.length || 1
  return (Object.entries(counts) as Array<[ControlAction, number]>).map(([action, count]) => ({
    action,
    count,
    pct: Number(((count / total) * 100).toFixed(1)),
  }))
}

function buildProviders(providerTrust: ProviderTrustResponse): ControlSurfaceProviderNode[] {
  const freshnessMap = new Map(
    providerTrust.freshness.map((item) => [item.provider.toUpperCase(), item])
  )

  const carbonProviders = Object.entries(providerTrust.providers).map(([key, snapshots]) => {
    const fresh = freshnessMap.get(key) ?? freshnessMap.get(key.toLowerCase())
    const latestConfidence = snapshots[0]?.confidence ?? null
    const isStale = Boolean(fresh?.isStale)
    const status: ControlSurfaceProviderNode['status'] = isStale ? 'degraded' : 'healthy'
    const mode: ControlSurfaceProviderNode['mode'] =
      key === 'ember' ? 'mirrored' : isStale ? 'fallback' : 'live'
    const signalAuthority: ControlSurfaceProviderNode['signalAuthority'] =
      key.toLowerCase().includes('watttime') ? 'marginal' : isStale ? 'fallback' : 'average'
    return {
      id: key,
      label: key.replace(/_/g, ' '),
      providerType: 'carbon' as const,
      status,
      freshnessSec: fresh && fresh.freshnessSec >= 0 ? fresh.freshnessSec : null,
      confidence: latestConfidence,
      mirrored: true,
      lineageCount: snapshots.length,
      mode,
      signalAuthority,
      degradedReason: isStale ? 'Freshness breached safe mirror window' : null,
      mirrorVersion: typeof snapshots[0]?.metadata?.['version'] === 'string'
        ? String(snapshots[0]?.metadata?.['version'])
        : null,
    }
  })

  const waterProviders = (providerTrust.waterProviders ?? []).map((provider) => {
    const freshnessSec =
      provider.freshnessSec ??
      (provider.observedAt ? Math.max(0, Math.round((Date.now() - new Date(provider.observedAt).getTime()) / 1000)) : null)
    const status: ControlSurfaceProviderNode['status'] =
      provider.authorityStatus === 'fallback'
        ? 'degraded'
        : freshnessSec != null && freshnessSec > 172800
          ? 'degraded'
          : 'healthy'
    return {
      id: `water:${provider.provider}`,
      label: provider.provider.replace(/_/g, ' '),
      providerType: 'water' as const,
      status,
      freshnessSec,
      confidence: provider.confidence ?? null,
      mirrored: false,
      lineageCount: provider.evidenceRefs?.length ?? 0,
      mode: provider.authorityStatus === 'fallback' ? 'fallback' : 'mirrored',
      signalAuthority: provider.authorityStatus === 'fallback' ? 'fallback' : 'average',
      authorityRole:
        provider.authorityStatus === 'authoritative'
          ? 'authoritative'
          : provider.authorityStatus === 'fallback'
            ? 'fallback'
            : 'advisory',
      authorityMode: provider.authorityMode ?? 'basin',
      scenario: provider.scenario ?? 'current',
      degradedReason:
        provider.authorityStatus === 'fallback'
          ? 'Water authority degraded to fallback posture.'
          : null,
      mirrorVersion: provider.datasetVersion ?? null,
    } satisfies ControlSurfaceProviderNode
  })

  return [...carbonProviders, ...waterProviders]
}

async function getScenarioPreviews(
  liveDecision: CiRouteResponse
): Promise<ScenarioPreview[]> {
  const scenarios: Array<'current' | '2030' | '2050' | '2080'> = ['current', '2030', '2050', '2080']
  const requests = scenarios.map((scenario) => ({
    preferredRegions: ['us-east-1', 'eu-west-1', 'us-west-2'],
    carbonWeight: 0.55,
    waterWeight: 0.35,
    latencyWeight: 0.05,
    costWeight: 0.05,
    jobType: 'standard',
    criticality: 'standard',
    waterPolicyProfile: 'default',
    allowDelay: true,
    estimatedEnergyKwh: 2.5,
    decisionMode: 'scenario_planning',
    waterContext: {
      scenario,
    },
    facilityId: liveDecision.waterAuthority.facilityId ?? undefined,
  }))

  try {
    const response = await fetchEngineJson<{ decisions: CiRouteResponse[] }>('/water/scenarios/plan', {
      method: 'POST',
      body: JSON.stringify({ requests }),
    })
    return response.decisions.map((decision) => ({
      scenario: decision.waterAuthority.scenario,
      decision: decision.decision,
      selectedRegion: decision.selectedRegion,
      carbonReductionPct: decision.savings.carbonReductionPct,
      waterImpactDeltaLiters: decision.savings.waterImpactDeltaLiters,
      executable: decision.enforcementBundle?.githubActions.executable ?? false,
      proofHash: decision.proofHash,
    }))
  } catch {
    return []
  }
}

function buildTimeline(
  decisions: ControlSurfaceDecisionSummary[],
  replay: ReplayBundle | null,
  outbox: OutboxMetrics | null,
  providers: ControlSurfaceProviderNode[]
): ControlSurfaceTimelineEvent[] {
  const events: ControlSurfaceTimelineEvent[] = decisions.slice(0, 6).map((decision) => {
    const actionTypeMap: Record<ControlAction, ControlSurfaceTimelineEvent['type']> = {
      run_now: 'DecisionEvaluated',
      reroute: 'Rerouted',
      delay: 'Delayed',
      throttle: 'Throttled',
      deny: 'Denied',
    }

    return {
      id: `${decision.decisionFrameId}-${decision.action}`,
      type: actionTypeMap[decision.action],
      label: `${decision.action} -> ${decision.selectedRegion}`,
      timestamp: decision.createdAt,
      severity:
        decision.action === 'deny'
          ? 'critical'
          : decision.action === 'delay' || decision.action === 'throttle'
            ? 'warning'
            : 'success',
      detail: `${decision.workloadLabel} (${decision.reasonCode})`,
    }
  })

  if (replay?.deterministicMatch) {
    events.unshift({
      id: `${replay.decisionFrameId}-replay`,
      type: 'ReplayVerified',
      label: 'Replay verified',
      timestamp: replay.replayedAt,
      severity: 'success',
      detail: 'Persisted and replayed decision matched action, region, and reason.',
    })
  }

  if (outbox?.alertActive) {
    events.unshift({
      id: 'outbox-alert',
      type: 'OutboxAlert',
      label: 'Event delivery attention',
      timestamp: outbox.generatedAt,
      severity: 'warning',
      detail: `Lag ${outbox.lagMinutes.toFixed(1)}m, failure ${outbox.failureRatePct.toFixed(1)}%.`,
    })
  }

  const slowDecisions = decisions
    .filter((decision) => (decision.latencyMs?.total ?? 0) > 100)
    .slice(0, 2)

  slowDecisions.forEach((decision) => {
    events.unshift({
      id: `${decision.decisionFrameId}-latency`,
      type: 'LatencyAnomaly',
      label: `${decision.action} latency ${decision.latencyMs?.total?.toFixed(0)}ms`,
      timestamp: decision.createdAt,
      severity: 'warning',
      detail: `${decision.workloadLabel} exceeded the 100ms total budget.`,
    })
  })

  providers
    .filter((provider) => provider.status !== 'healthy')
    .slice(0, 2)
    .forEach((provider) => {
      events.unshift({
        id: `${provider.id}-degraded`,
        type: 'ProviderDegraded',
        label: `${provider.label} degraded`,
        timestamp: new Date().toISOString(),
        severity: 'warning',
        detail: provider.freshnessSec == null
          ? 'Provider freshness unavailable; mirrored lineage still present.'
          : `Latest mirrored freshness ${provider.freshnessSec}s.`,
      })
    })

  return events.slice(0, 10)
}

function chooseFeaturedDecision(
  liveDecision: CiRouteResponse,
  decisions: ControlSurfaceDecisionSummary[]
): CiRouteResponse | ControlSurfaceDecisionSummary {
  const featuredSummary = decisions.find(
    (decision) =>
      (decision.action === 'reroute' || decision.action === 'delay' || decision.action === 'deny') &&
      (decision.carbonReductionPct > 0 || decision.waterImpactDeltaLiters > 0)
  )

  if (featuredSummary) return featuredSummary
  return liveDecision
}

async function getReplayBundle(decisions: DecisionFeed['decisions']) {
  const latest = decisions[0]
  if (!latest) return null

  if (hasInternalApiKey()) {
    try {
      return await fetchEngineJson<ReplayBundle>(
        `/ci/decisions/${encodeURIComponent(latest.decisionFrameId)}/replay`,
        undefined,
        { internal: true }
      )
    } catch (error) {
      console.warn('Failed to fetch internal replay bundle, falling back to live sample:', error)
    }
  }

  const replay = await fetchEngineJson<CiRouteResponse>('/ci/route', {
    method: 'POST',
    body: JSON.stringify({
      preferredRegions: ['us-east1', 'eu-west1', 'us-west1'],
      carbonWeight: 0.55,
      waterWeight: 0.35,
      latencyWeight: 0.05,
      costWeight: 0.05,
      jobType: 'standard',
      criticality: 'standard',
      waterPolicyProfile: 'default',
      allowDelay: true,
      estimatedEnergyKwh: 2.5,
    }),
  })

  return {
    decisionFrameId: replay.decisionFrameId,
    persisted: null,
    replay,
    deterministicMatch: false,
    replayedAt: new Date().toISOString(),
  }
}

export async function GET() {
  const startedAt = performance.now()
  try {
    const [health, slo, ledger, metrics, decisionFeed] = await Promise.all([
      fetchEngineJson<CiHealthSnapshot>('/ci/health'),
      fetchEngineJson<CiSloSnapshot>('/ci/slo'),
      fetchEngineJson<LedgerSummary>('/dashboard/carbon-ledger-summary?days=30'),
      fetchEngineJson<MetricsResponse>('/dashboard/metrics?window=24h'),
      fetchEngineJson<DecisionFeed>('/ci/decisions?limit=12'),
    ])

    const [providerTrustResult, outboxResult] = await Promise.allSettled([
      fetchEngineJson<ProviderTrustResponse>('/dashboard/provider-trust'),
      hasInternalApiKey()
        ? fetchEngineJson<OutboxMetrics>('/integrations/events/outbox/metrics', undefined, { internal: true })
        : Promise.resolve(null),
    ])

    const providerTrust =
      providerTrustResult.status === 'fulfilled'
        ? providerTrustResult.value
        : { freshness: [], providers: {} }
    const outbox = outboxResult.status === 'fulfilled' ? outboxResult.value : null

    const replay = await getReplayBundle(decisionFeed.decisions)
    const liveDecision = replay?.replay ?? replay?.persisted
    if (!liveDecision) {
      throw new Error('No live decision available for control surface')
    }

    const decisions = decisionFeed.decisions.map(buildDecisionSummary)
    const providers = buildProviders(providerTrust)
    const actionDistribution = buildActionDistribution(decisions)
    const timeline = buildTimeline(decisions, replay, outbox, providers)
    const scenarioPreviews = await getScenarioPreviews(liveDecision)
    if (providerTrustResult.status === 'rejected') {
      timeline.unshift({
        id: 'provider-trust-degraded',
        type: 'ProviderDegraded',
        label: 'Provider trust surface degraded',
        timestamp: new Date().toISOString(),
        severity: 'warning',
        detail: 'The overview stayed live, but provider freshness details could not be loaded.',
      })
    }
    if (!slo.withinBudget.total || !slo.withinBudget.compute) {
      timeline.unshift({
        id: 'slo-breach',
        type: 'SLOBreach',
        label: `rolling p95 ${slo.p95.totalMs.toFixed(0)}ms`,
        timestamp: new Date().toISOString(),
        severity: 'critical',
        detail: `Budget ${slo.budget.totalP95Ms}ms total / ${slo.budget.computeP95Ms}ms compute. Current warm path is ${slo.current.totalMs.toFixed(0)}ms total and rolling compute p95 is ${slo.p95.computeMs.toFixed(0)}ms.`,
      })
    }

    const waterShiftedLiters = decisions.reduce(
      (sum, decision) => sum + Math.max(0, decision.waterImpactDeltaLiters),
      0
    )

    const delayedDecisions = actionDistribution.find((item) => item.action === 'delay')?.count ?? 0
    const featuredDecision = chooseFeaturedDecision(liveDecision, decisions)

    const overview: ControlSurfaceOverview = {
      generatedAt: new Date().toISOString(),
      service: {
        status: health.status,
        proofPosture: replay?.persisted || replay?.deterministicMatch ? 'Replayable proof live' : 'Live proof sample',
        detail: `DB ${health.checks.database ? 'ok' : 'degraded'} | Water artifacts ${
          health.checks.waterArtifacts.schemaCompatible ? 'verified' : 'degraded'
        } | Current ${slo.current.totalMs.toFixed(0)}ms | Rolling p95 ${slo.p95.totalMs.toFixed(0)}ms`,
      },
      impact: {
        totalDecisions: ledger.totalJobsRouted,
        carbonAvoidedKg: ledger.carbonAvoidedPeriodKg,
        carbonReductionMultiplier: ledger.carbonReductionMultiplier,
        waterShiftedLiters,
        costOptimizedUsd: Number((ledger.carbonAvoidedPeriodKg * 0.42).toFixed(2)),
        delayedDecisions,
      },
      liveDecision,
      featuredDecision,
      replay,
      decisions,
      actionDistribution,
      providers,
      scenarioPreviews,
      timeline,
      metrics: {
        fallbackRate: metrics.fallbackRate,
        highConfidenceDecisionPct: ledger.highConfidenceDecisionPct,
        providerDisagreementRatePct: ledger.providerDisagreementRatePct,
        p50TotalMs: slo.p50.totalMs,
        p50ComputeMs: slo.p50.computeMs,
        p95TotalMs: slo.p95.totalMs,
        p95ComputeMs: slo.p95.computeMs,
        p99TotalMs: slo.p99.totalMs,
        p99ComputeMs: slo.p99.computeMs,
        currentTotalMs: slo.current.totalMs,
        currentComputeMs: slo.current.computeMs,
      },
      health,
      slo,
      outbox,
      simulationDefaults: {
        preferredRegions: ['us-east1', 'eu-west1', 'us-west1'],
        waterPolicyProfile: 'default',
        jobType: 'standard',
        criticality: 'standard',
        carbonWeight: 0.55,
        waterWeight: 0.35,
        latencyWeight: 0.05,
        costWeight: 0.05,
        allowDelay: true,
        estimatedEnergyKwh: 2.5,
      },
    }

    const serialized = JSON.stringify(overview)
    const totalMs = performance.now() - startedAt
    const responseBytes = Buffer.byteLength(serialized)

    recordDashboardMetric(dashboardTelemetryMetricNames.routeDurationMs, 'histogram', totalMs, {
      route: 'overview',
    })
    recordDashboardMetric(dashboardTelemetryMetricNames.routeResponseBytes, 'histogram', responseBytes, {
      route: 'overview',
    })

    const response = new NextResponse(serialized, {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })
    response.headers.set('x-co2router-response-bytes', String(responseBytes))
    response.headers.set('Server-Timing', `total;dur=${totalMs.toFixed(1)}`)
    return response
  } catch (error) {
    console.error('Control surface overview error:', error)
    recordDashboardMetric(dashboardTelemetryMetricNames.routeErrorCount, 'counter', 1, {
      route: 'overview',
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build control surface overview' },
      { status: 500 }
    )
  }
}
