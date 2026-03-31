const DEFAULT_ENGINE_URL = 'http://localhost:3000'

function titleCaseWords(value: string) {
  return value
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function formatProviderName(name: string) {
  const normalized = name.trim()
  const aliases: Record<string, string> = {
    EMBER: 'Ember',
    EMBER_STRUCTURAL_BASELINE: 'Ember structural baseline',
    WATTTIME_MOER: 'WattTime MOER',
    EIA930: 'EIA-930',
    ELECTRICITY_MAPS: 'Electricity Maps',
    aqueduct: 'Aqueduct',
    aware: 'AWARE',
    nrel: 'NREL',
    wwf: 'WWF Water Risk Filter',
  }

  return aliases[normalized] ?? titleCaseWords(normalized.replace(/-/g, ' '))
}

function inferSignalStatus(latestObservedAt: string | null): 'healthy' | 'degraded' | 'offline' {
  if (!latestObservedAt) return 'offline'

  const ageMs = Date.now() - Date.parse(latestObservedAt)
  if (Number.isNaN(ageMs)) return 'offline'
  if (ageMs <= 1000 * 60 * 60) return 'healthy'
  if (ageMs <= 1000 * 60 * 60 * 24) return 'degraded'
  return 'offline'
}

function buildMethodologyProviders(
  providerTrust: ProviderTrust | null,
  waterProviders: WaterProviders | null
): MethodologyProviders {
  const items = new Map<string, MethodologyProviders['providers'][number]>()

  for (const [providerName, signals] of Object.entries(providerTrust?.providers ?? {})) {
    const latest = [...signals]
      .filter((signal) => signal.observedAt)
      .sort((a, b) => Date.parse(b.observedAt ?? '') - Date.parse(a.observedAt ?? ''))[0]

    items.set(providerName, {
      name: formatProviderName(providerName),
      status: inferSignalStatus(latest?.observedAt ?? null),
      latencyMs: null,
      lastSuccessAt: latest?.observedAt ?? null,
      disagreementPct: null,
    })
  }

  for (const provider of waterProviders?.providers ?? []) {
    const rawName =
      typeof provider.provider === 'string' && provider.provider.trim().length > 0
        ? provider.provider
        : 'water-source'
    const authorityStatus =
      typeof provider.authorityStatus === 'string' ? provider.authorityStatus.toLowerCase() : ''

    items.set(`water:${rawName}`, {
      name: formatProviderName(rawName),
      status: authorityStatus === 'authoritative' ? 'healthy' : authorityStatus === 'fallback' ? 'degraded' : 'offline',
      latencyMs: null,
      lastSuccessAt:
        typeof provider.lastObservedAt === 'string' && provider.lastObservedAt.length > 0
          ? provider.lastObservedAt
          : null,
      disagreementPct: null,
    })
  }

  return {
    providers: Array.from(items.values()).sort((a, b) => a.name.localeCompare(b.name)),
  }
}

function getEngineBaseUrl() {
  return (process.env.ECOBE_API_URL || process.env.NEXT_PUBLIC_ECOBE_API_URL || DEFAULT_ENGINE_URL).replace(/\/$/, '')
}

function getInternalHeaders() {
  const internalKey = process.env.ECOBE_INTERNAL_API_KEY
  return internalKey ? { 'x-ecobe-internal-key': internalKey } : {}
}

async function fetchEngineJson<T>(
  path: string,
  init?: RequestInit & {
    internal?: boolean
  }
): Promise<T | null> {
  try {
    const { internal, headers: initHeaders, ...requestInit } = init ?? {}
    const headers = new Headers(initHeaders)
    headers.set('Content-Type', 'application/json')
    if (internal) {
      for (const [key, value] of Object.entries(getInternalHeaders())) {
        headers.set(key, value)
      }
    }

    const response = await fetch(`${getEngineBaseUrl()}/api/v1${path}`, {
      ...requestInit,
      headers,
      cache: 'no-store',
    })

    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

export type EngineHealth = {
  status: 'healthy' | 'degraded'
  timestamp: string
  checks: {
    database: boolean
    waterArtifacts: {
      bundlePresent: boolean
      manifestPresent: boolean
      schemaCompatible: boolean
      regionCount: number
      sourceCount: number
      datasetHashesPresent: boolean
    }
    assuranceReady: boolean
  }
  assurance?: {
    operationallyUsable: boolean
    assuranceReady: boolean
    status?: 'operational' | 'assurance_ready' | 'degraded'
    unhashedDatasets: string[]
  }
  provenance?: {
    verified: number
    unverified: number
    missingSource: number
    mismatch: number
  }
  errors: string[]
  sloBudgetMs: {
    totalP95: number
    computeP95: number
    totalP95Ms?: number
    computeP95Ms?: number
  }
}

export type EngineSlo = {
  budgetMs: {
    totalP95: number
    computeP95: number
  }
  currentMs: {
    total: { p50: number; p95: number; p99: number; current?: number }
    compute: { p50: number; p95: number; p99: number; current?: number }
  }
  counts: {
    totalSamples: number
    computeSamples: number
  }
}

export type CiDecision = {
  decisionFrameId: string
  selectedRegion: string
  baseline: number
  carbonIntensity: number
  savings: number
  action: 'run_now' | 'reroute' | 'delay' | 'throttle' | 'deny'
  decisionMode: 'runtime_authorization' | 'scenario_planning'
  reasonCode: string
  signalConfidence: number
  waterImpactLiters: number
  waterBaselineLiters: number
  waterScarcityImpact: number
  waterStressIndex: number
  waterConfidence: number
  waterAuthorityMode: 'basin' | 'facility_overlay' | 'fallback'
  waterScenario: 'current' | '2030' | '2050' | '2080'
  facilityId: string | null
  proofHash: string | null
  waterEvidenceRefs: string[]
  fallbackUsed: boolean
  createdAt: string
  signalMode: 'marginal' | 'average' | 'fallback'
  accountingMethod: 'marginal' | 'flow-traced' | 'average'
  notBefore: string | null
  latencyMs: {
    total: number
    compute: number
    providerResolution?: number
    cacheStatus?: 'live' | 'warm' | 'redis' | 'lkg' | 'degraded-safe' | 'fallback'
    influencedDecision?: boolean
  } | null
  decisionEnvelope?: Record<string, unknown> | null
  proofEnvelope?: Record<string, unknown> | null
  telemetryBridge?: Record<string, unknown> | null
  adapterContext?: Record<string, unknown> | null
}

export type ProviderTrust = {
  freshness: Record<string, unknown> | null
  providers: Record<
    string,
    Array<{
      zone: string
      signalType: string
      value: number
      confidence: number
      freshnessSec: number | null
      observedAt: string | null
      metadata: Record<string, unknown> | null
    }>
  >
  waterProviders: Array<{
    provider?: string
    authorityRole?: string
    region?: string
    scenario?: string
    authorityMode?: string
    confidence?: number
    observedAt?: string | null
    evidenceRefs?: string[]
    metadata?: Record<string, unknown>
  }>
}

export type WaterProviders = {
  generatedAt: string
  bundleVersion: string
  bundleHash: string | null
  manifestHash: string | null
  providers: Array<Record<string, unknown>>
  authorityStatus: {
    doctrine: string
    sourceCount: number
    suppliers: string[]
    datasetHashesPresent?: boolean
  }
}

export type MethodologyProviders = {
  providers: Array<{
    name: string
    status: 'healthy' | 'degraded' | 'offline'
    latencyMs: number | null
    lastSuccessAt: string | null
    disagreementPct: number | null
  }>
}

export type WaterEvidence = {
  decisionFrameId: string
  decision: {
    selectedRegion: string
    decisionMode: string
    waterAuthorityMode: string
    waterScenario: string
    facilityId: string | null
    proofHash: string | null
    waterEvidenceRefs: string[]
  }
  evidence: Array<Record<string, unknown>>
  scenarioRuns: Array<Record<string, unknown>>
  telemetry: Array<Record<string, unknown>>
  generatedAt: string
}

export type ReplayDecision = {
  storedResponse?: Record<string, unknown>
  replayedResponse?: Record<string, unknown>
  consistent?: boolean
  mismatches?: string[]
}

export type AdapterSpec = {
  version: string
  adapters: Array<{
    id: string
    runtime: string
    controlPoints: string[]
  }>
}

export type WaterProvenance = {
  checkedAt: string
  summary: {
    verified: number
    unverified: number
    missingSource: number
    mismatch: number
  }
  datasets: Array<{
    name: string
    datasetVersion: string
    verificationStatus: 'verified' | 'unverified' | 'missing_source' | 'mismatch'
    discoveredSourcePath: string | null
    manifestHash: string | null
    computedHash: string | null
  }>
}

export type TelemetryBridgeSnapshot = {
  generatedAt: string
  otel: {
    enabled: boolean
    endpoint: string | null
    serviceName: string
  }
  metrics: {
    generatedAt: string
    metrics: Array<{
      name: string
      kind: string
      samples: number
      sum: number
      lastValue: number | null
      lastRecordedAt: string | null
      p50: number | null
      p95: number | null
      attributes: Record<string, unknown>
    }>
  } | null
}

export async function getControlPlaneSnapshot() {
  const [health, slo, decisions, providerTrust, waterProviders, methodologyProviders, adapters, provenance, telemetry] = await Promise.all([
    fetchEngineJson<EngineHealth>('/ci/health'),
    fetchEngineJson<EngineSlo>('/ci/slo'),
    fetchEngineJson<{ decisions: CiDecision[]; total: number }>('/ci/decisions?limit=8'),
    fetchEngineJson<ProviderTrust>('/dashboard/provider-trust'),
    fetchEngineJson<WaterProviders>('/water/providers'),
    fetchEngineJson<MethodologyProviders>('/dashboard/methodology/providers'),
    fetchEngineJson<AdapterSpec>('/adapters/spec'),
    fetchEngineJson<WaterProvenance>('/water/provenance'),
    fetchEngineJson<TelemetryBridgeSnapshot>('/ci/telemetry'),
  ])

  const latestDecision = decisions?.decisions?.[0] ?? null
  const [evidence, replay] = latestDecision
    ? await Promise.all([
        fetchEngineJson<WaterEvidence>(`/water/evidence/${latestDecision.decisionFrameId}`),
        fetchEngineJson<ReplayDecision>(`/ci/decisions/${latestDecision.decisionFrameId}/replay`, {
          internal: true,
        }),
      ])
    : [null, null]

  return {
    health,
    slo,
    decisions: decisions?.decisions ?? [],
    totalDecisions: decisions?.total ?? 0,
    providerTrust,
    waterProviders,
    methodologyProviders: methodologyProviders ?? buildMethodologyProviders(providerTrust, waterProviders),
    adapters,
    provenance,
    telemetry,
    latestDecision,
    evidence,
    replay,
  }
}

export async function getLandingScenarioSample() {
  return fetchEngineJson<{
    generatedAt: string
    count: number
    decisions: Array<{
      decision: 'run_now' | 'reroute' | 'delay' | 'throttle' | 'deny'
      selectedRegion: string
      reasonCode: string
      savings: { carbonReductionPct: number; waterImpactDeltaLiters: number }
      waterAuthority: { authorityMode: string; scenario: string }
      assurance: { status: string; assuranceReady: boolean }
      operatingMode: 'NORMAL' | 'STRESS' | 'CRISIS'
      fallbackUsed: boolean
      doctrineVersion: string
      decisionExplanation: {
        whyAction: string
        whyTarget: string
      }
    }>
  }>('/water/scenarios/plan', {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          preferredRegions: ['us-east-1', 'eu-west-1', 'eu-central-1'],
          carbonWeight: 0.55,
          waterWeight: 0.35,
          latencyWeight: 0.2,
          costWeight: 0.05,
          jobType: 'heavy',
          criticality: 'batch',
          waterPolicyProfile: 'high_water_sensitivity',
          allowDelay: true,
          maxDelayMinutes: 90,
          signalPolicy: 'marginal_first',
          waterContext: {
            scenario: '2030',
          },
          schedulerHints: {
            bottleneckScore: 0.25,
          },
        },
      ],
    }),
  })
}

export function classifySourceMode(input: {
  decisionMode: 'runtime_authorization' | 'scenario_planning'
  fallbackUsed: boolean
}) {
  if (input.decisionMode === 'scenario_planning') return 'simulation'
  if (input.fallbackUsed) return 'degraded'
  return 'live'
}

export function formatMs(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
  return `${Math.round(value)} ms`
}

export function formatPct(value?: number | null, fractionDigits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
  return `${Number(value).toFixed(fractionDigits)}%`
}

export function formatSignedNumber(value?: number | null, fractionDigits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
  const fixed = Number(value).toFixed(fractionDigits)
  return value > 0 ? `+${fixed}` : fixed
}
