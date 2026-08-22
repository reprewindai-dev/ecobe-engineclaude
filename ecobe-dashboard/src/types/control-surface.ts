export type ControlAction = 'run_now' | 'reroute' | 'delay' | 'throttle' | 'deny'

export interface ControlSurfaceDecisionSummary {
  decisionFrameId: string
  createdAt: string
  workloadLabel: string
  action: ControlAction
  decisionMode: 'runtime_authorization' | 'scenario_planning'
  reasonCode: string
  selectedRegion: string
  selectedRunner: string
  carbonIntensity: number
  baselineCarbonIntensity: number
  carbonReductionPct: number
  waterSelectedLiters: number
  waterBaselineLiters: number
  waterImpactDeltaLiters: number
  waterScarcityImpact: number
  waterStressIndex: number
  signalConfidence: number
  fallbackUsed: boolean
  sourceMode: 'live' | 'mirrored' | 'fallback'
  signalMode: 'marginal' | 'average' | 'fallback'
  accountingMethod: 'marginal' | 'flow-traced' | 'average'
  waterAuthorityMode?: 'basin' | 'facility_overlay' | 'fallback'
  waterScenario?: 'current' | '2030' | '2050' | '2080'
  facilityId?: string | null
  precedenceOverrideApplied?: boolean
  notBefore: string | null
  proofHash: string
  summaryReason: string
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
}

export interface ControlSurfaceTimelineEvent {
  id: string
  type:
    | 'DecisionEvaluated'
    | 'Rerouted'
    | 'Delayed'
    | 'Throttled'
    | 'Denied'
    | 'FallbackActivated'
    | 'ReplayVerified'
    | 'ProofExportReady'
    | 'OutboxAlert'
    | 'ProviderDegraded'
    | 'LatencyAnomaly'
    | 'SLOBreach'
  label: string
  timestamp: string
  severity: 'info' | 'success' | 'warning' | 'critical'
  detail: string
}

export interface ControlSurfaceProviderNode {
  id: string
  label: string
  providerType?: 'carbon' | 'water'
  status: 'healthy' | 'degraded' | 'offline'
  statusReasonCode?:
    | 'HEALTHY_LIVE'
    | 'VERIFIED_STATIC'
    | 'DEGRADED_RATE_LIMIT'
    | 'DEGRADED_STALE'
    | 'EXPIRED_BUNDLE'
    | 'HASH_MISMATCH'
    | 'PROVENANCE_FAILED'
    | 'OFFLINE'
    | null
  statusLabel?: string | null
  freshnessSec: number | null
  latencyMs?: number | null
  confidence: number | null
  mirrored: boolean
  lineageCount: number
  mode?: 'live' | 'mirrored' | 'fallback'
  signalAuthority?: 'marginal' | 'average' | 'fallback'
  authorityRole?: 'authoritative' | 'advisory' | 'fallback'
  authorityMode?: 'basin' | 'facility_overlay' | 'fallback'
  scenario?: 'current' | '2030' | '2050' | '2080'
  degradedReason?: string | null
  mirrorVersion?: string | null
  ttlSec?: number | null
  provenanceStatus?: 'verified' | 'unverified' | 'missing_source' | 'mismatch' | 'unavailable' | null
}

export interface ScenarioPreview {
  scenario: 'current' | '2030' | '2050' | '2080'
  decision: ControlAction
  selectedRegion: string
  carbonReductionPct: number
  waterImpactDeltaLiters: number
  executable: boolean
  proofHash: string
}

export interface ActionDistributionItem {
  action: ControlAction
  count: number
  pct: number
}

export interface OutboxMetrics {
  generatedAt: string
  counts: {
    pending: number
    processing: number
    failed: number
    deadLetter: number
    sent: number
  }
  lagMinutes: number
  failureRatePct: number
  alertActive: boolean
  alerts: {
    lagBreached: boolean
    failureRateBreached: boolean
    deadLetterBreached: boolean
  }
}

export interface CiHealthSnapshot {
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
  }
  errors: string[]
  sloBudgetMs: {
    totalP95Ms: number
    computeP95Ms: number
  }
}

export interface CiSloSnapshot {
  samples: number
  p50: {
    totalMs: number
    computeMs: number
  }
  p95: {
    totalMs: number
    computeMs: number
  }
  p99: {
    totalMs: number
    computeMs: number
  }
  current: {
    totalMs: number
    computeMs: number
  }
  budget: {
    totalP95Ms: number
    computeP95Ms: number
  }
  withinBudget: {
    total: boolean
    compute: boolean
  }
}

export interface CiRouteResponse {
  decision: ControlAction
  decisionMode: 'runtime_authorization' | 'scenario_planning'
  reasonCode: string
  decisionFrameId: string
  selectedRunner: string
  selectedRegion: string
  recommendation: string
  signalConfidence: number
  fallbackUsed: boolean
  signalMode: 'marginal' | 'average' | 'fallback'
  accountingMethod: 'marginal' | 'flow-traced' | 'average'
  notBefore: string | null
  proofHash: string
  waterAuthority: {
    authorityMode: 'basin' | 'facility_overlay' | 'fallback'
    scenario: 'current' | '2030' | '2050' | '2080'
    confidence: number
    supplierSet: string[]
    evidenceRefs: string[]
    facilityId?: string | null
    telemetryRef?: string | null
    bundleHash: string | null
    manifestHash: string | null
  }
  policyTrace: Record<string, unknown> & {
    policyVersion?: string
    profile?: string
    reasonCodes?: string[]
    precedenceOverrideApplied?: boolean
  }
  baseline: {
    region: string
    carbonIntensity: number
    waterImpactLiters: number
    waterScarcityImpact: number
  }
  selected: {
    region: string
    carbonIntensity: number
    waterImpactLiters: number
    waterScarcityImpact: number
  }
  capacity?: {
    targetTime: string
    reserved: boolean
    queueDepth: number
    costMultiplier: number
    pressureLevel: 'low' | 'elevated' | 'high' | 'severe'
    cpuUtilization: number
    gpuUtilization: number
    commandUtilization: number
  }
  savings: {
    carbonReductionPct: number
    waterImpactDeltaLiters: number
  }
  water: {
    selectedLiters: number
    baselineLiters: number
    selectedScarcityImpact: number
    baselineScarcityImpact: number
    intensityLPerKwh: number
    stressIndex: number
    qualityIndex: number | null
    droughtRiskIndex: number | null
    confidence: number
    source: string[]
    datasetVersion: Record<string, string>
    guardrailTriggered: boolean
    fallbackUsed: boolean
  }
  kubernetesEnforcement?: Record<string, unknown>
  enforcementBundle?: {
    kubernetes: Record<string, unknown>
    githubActions: {
      executable: boolean
      decision: ControlAction
      concurrency: {
        group: string
        cancelInProgress: boolean
      }
      maxParallel: number
      environment: string
      notBefore: string | null
      matrixAllowedRegions: string[]
    }
  }
  workloadClass?: WorkloadClass
  decisionExplanation?: DecisionExplanationContract | null
  decisionTrust?: DecisionTrustContract | null
  workflowOutputs: Record<string, string | number | boolean | null>
  candidateEvaluations: Array<{
    region: string
    score: number
    carbonIntensity: number
    waterImpactLiters: number
    scarcityImpact: number
    reliabilityMultiplier: number
    defensiblePenalty: number
    defensibleReasonCodes: string[]
    supplierSet?: string[]
    evidenceRefs?: string[]
    authorityMode?: 'basin' | 'facility_overlay' | 'fallback'
    guardrailCandidateBlocked: boolean
    guardrailReasons: string[]
    capacityCandidateBlocked?: boolean
    capacityReasonCodes?: string[]
    capacityPenalty?: number
    capacity?: {
      available: boolean
      queueDepth: number
      costMultiplier: number
      cpuUtilization: number
      gpuUtilization: number
      commandUtilization: number
      pressureLevel: 'low' | 'elevated' | 'high' | 'severe'
      bucketStartTs: string
    }
  }>
  proofRecord: {
    job_id: string
    baseline_region: string
    selected_region: string
    carbon_delta: number
    water_delta: number
    signals_used: string[]
    timestamp: string
    dataset_versions: Record<string, string>
    confidence_score: number
    proof_hash: string
    provider_snapshot_refs: string[]
    water_bundle_hash?: string | null
    water_manifest_hash?: string | null
    supplier_refs?: string[]
    facility_telemetry_refs?: string[]
    water_scenario?: 'current' | '2030' | '2050' | '2080'
    external_policy_refs?: string[]
    water_evidence_refs?: string[]
  }
  latencyMs?: {
    total: number
    compute: number
    providerResolution?: number
    cacheStatus?: 'live' | 'warm' | 'redis' | 'lkg' | 'degraded-safe' | 'fallback'
    influencedDecision?: boolean
    providers?: {
      electricityMaps?: number | null
      wattTime?: number | null
      validation?: number | null
    }
    budget?: {
      totalP95Ms: number
      computeP95Ms: number
    }
    withinEnvelope?: boolean
  }
}

export type SimulationMode = 'fast' | 'full'

export interface SimulationFastResponse {
  mode: 'fast'
  decision: ControlAction
  decisionMode: 'runtime_authorization' | 'scenario_planning'
  reasonCode: string
  decisionFrameId: string
  selectedRunner: string
  selectedRegion: string
  recommendation: string
  signalConfidence: number
  fallbackUsed: boolean
  signalMode: 'marginal' | 'average' | 'fallback'
  accountingMethod: 'marginal' | 'flow-traced' | 'average'
  notBefore: string | null
  proofHash: string
  waterAuthority: CiRouteResponse['waterAuthority']
  baseline: CiRouteResponse['baseline']
  selected: CiRouteResponse['selected']
  savings: CiRouteResponse['savings']
  policyTrace: Pick<
    CiRouteResponse['policyTrace'],
    | 'policyVersion'
    | 'profile'
    | 'reasonCodes'
    | 'precedenceOverrideApplied'
    | 'operatingMode'
    | 'sekedPolicy'
    | 'externalPolicy'
  >
  latencyMs?: CiRouteResponse['latencyMs']
  proofRef: {
    proofHash: string
    decisionFrameId: string
    traceAvailable: boolean
  }
}

export type SimulationRouteResponse = SimulationFastResponse | CiRouteResponse

export interface ReplayBundle {
  decisionFrameId: string
  persisted: CiRouteResponse | null
  replay: CiRouteResponse
  deterministicMatch: boolean
  replayedAt: string
}

export type LiveSystemDatasetStatus =
  | 'verified'
  | 'unverified'
  | 'missing_source'
  | 'mismatch'
  | 'unavailable'

export interface LiveSystemTraceResponse {
  decisionFrameId: string
  sequenceNumber: number
  traceHash: string
  previousTraceHash: string | null
  inputSignalHash: string
  traceAvailable: true
  governanceSource: string
  action: string
  reasonCode: string
  selectedRegion: string
  operatingMode: string
  proofHash: string | null
  totalMs: number | null
  computeMs: number | null
  cacheHit: boolean
  createdAt: string
}

export interface LiveSystemReplayResponse {
  decisionFrameId: string
  persisted: CiRouteResponse | null
  replay: CiRouteResponse
  consistent: boolean
  deterministicMatch: boolean
  traceBacked: boolean
  legacy: boolean
  mismatches: string[]
  replayedAt: string
}

export interface LiveSystemRecentDecision {
  decisionFrameId: string
  createdAt: string
  action: string
  reasonCode: string
  selectedRegion: string
  proofHash: string | null
  traceAvailable: boolean
  governanceSource: string | null
}

export interface LiveSystemTraceLedger {
  available: boolean
  error: string | null
  traceAvailable: boolean
  traceHash: string | null
  inputSignalHash: string | null
  sequenceNumber: number | null
  proofAvailable: boolean
  replayConsistent: boolean | null
}

export interface LiveSystemSnapshot {
  generatedAt: string
  recentDecisions: {
    available: boolean
    error: string | null
    items: LiveSystemRecentDecision[]
  }
  traceLedger: LiveSystemTraceLedger
  governance: {
    available: boolean
    error: string | null
    frameworkLabel: 'SAIQ'
    active: boolean | null
    policyState: string | null
    latestDecisionAction: string | null
    latestReasonCode: string | null
  }
  providers: {
    available: boolean
    error: string | null
    datasets: Array<{
      name: 'aqueduct' | 'aware' | 'wwf' | 'nrel'
      verificationStatus: LiveSystemDatasetStatus
      datasetVersion: string | null
      manifestHash: string | null
      computedHash: string | null
    }>
  }
  latency: {
    available: boolean
    error: string | null
    samples: number | null
    p95TotalMs: number | null
    p95ComputeMs: number | null
    budgetTotalP95Ms: number | null
    budgetComputeP95Ms: number | null
    withinBudget: {
      total: boolean | null
      compute: boolean | null
    }
  }
}

export interface ControlSurfaceOverview {
  generatedAt: string
  service: {
    status: string
    proofPosture: string
    detail: string
  }
  impact: {
    totalDecisions: number
    carbonAvoidedKg: number
    carbonReductionMultiplier: number | null
    waterShiftedLiters: number
    costOptimizedUsd: number
    delayedDecisions: number
  }
  liveDecision: CiRouteResponse
  featuredDecision?: CiRouteResponse | ControlSurfaceDecisionSummary
  replay: ReplayBundle | null
  decisions: ControlSurfaceDecisionSummary[]
  actionDistribution: ActionDistributionItem[]
  providers: ControlSurfaceProviderNode[]
  scenarioPreviews: ScenarioPreview[]
  timeline: ControlSurfaceTimelineEvent[]
  metrics: {
    fallbackRate: number
    highConfidenceDecisionPct: number
    providerDisagreementRatePct: number
    p50TotalMs: number
    p50ComputeMs: number
    p95TotalMs: number
    p95ComputeMs: number
    p99TotalMs: number
    p99ComputeMs: number
    currentTotalMs: number
    currentComputeMs: number
  }
  health: CiHealthSnapshot
  slo: CiSloSnapshot
  outbox: OutboxMetrics | null
  simulationDefaults: {
    preferredRegions: string[]
    waterPolicyProfile: 'default' | 'drought_sensitive' | 'eu_data_center_reporting' | 'high_water_sensitivity'
    jobType: 'standard' | 'heavy' | 'light'
    criticality: 'critical' | 'standard' | 'batch'
    carbonWeight: number
    waterWeight: number
    latencyWeight: number
    costWeight: number
    allowDelay: boolean
    estimatedEnergyKwh: number
  }
}

export interface LandingSnapshot {
  generatedAt: string
  liveStatus: {
    visible: boolean
    generatedAt: string
    lastUpdatedLabel: string
    detail: string
  }
  overview: Pick<
    ControlSurfaceOverview,
    'actionDistribution' | 'providers'
  > & {
    featuredDecision: ControlSurfaceDecisionSummary | null
    liveStrip: Array<
      Pick<
        ControlSurfaceDecisionSummary,
        | 'decisionFrameId'
        | 'workloadLabel'
        | 'action'
        | 'selectedRegion'
        | 'carbonReductionPct'
      >
    >
    proofContext: {
      proofRef: string | null
      governance: string
      traceRef: string | null
      replay: string
      provenance: string
    }
  }
  liveSystem: LiveSystemSnapshot
}

export type WorldExecutionState = 'active' | 'marginal' | 'blocked'

export type WorkloadClass = 'batch' | 'interactive' | 'critical' | 'regulated' | 'emergency'

export interface DecisionExplanationContract {
  whyAction: string
  dominantConstraint: string
  counterfactualCondition: string
}

export interface DecisionTrustContract {
  signalFreshness: {
    carbonFreshnessSec: number | null
    waterFreshnessSec: number | null
  }
  providerTrust: {
    providerTrustTier: string
    carbonProvider: string
  }
  replayability: {
    summary: string
  }
  degradedState: {
    degraded: boolean
    summary: string
  }
  fallbackMode: {
    engaged: boolean
    summary: string
  }
}

export interface HallOGridAdapterProfile {
  id: string
  label: string
  kind: 'canonical' | 'sse' | 'websocket' | 'polling'
  enabled: boolean
  notes: string
}

export type HallOGridEntitlement =
  | 'public_preview'
  | 'pro_eval'
  | 'pro_production'
  | 'compliance_pack'

export type HallOGridRole = 'viewer' | 'operator' | 'governance_admin' | 'org_admin'

export interface HallOGridConsoleAccess {
  tenantId: string
  entitlements: HallOGridEntitlement[]
  role: HallOGridRole
  mode: 'public_preview' | 'pro_eval' | 'pro_production'
  label: 'Live Mirror' | 'Operator Console'
  isReadOnlyPreview: boolean
  canViewOperatorConsole: boolean
  canAccessControls: boolean
  canManageDoctrine: boolean
  canViewCompliance: boolean
  redactionDelayMinutes: number
  upgradePrompts: string[]
  proHighlights: string[]
  upgradeUrl: string
}

export interface HallOGridLaneBudgets {
  hotP95Ms: number
  warmP95Ms: number
  coldQueued: boolean
}

export interface HallOGridMirrorMetrics {
  decisionP50Ms: number | null
  decisionP95Ms: number | null
  decisionP99Ms: number | null
  consoleSnapshotP50Ms: number | null
  consoleSnapshotP95Ms: number | null
  providerRefreshAgeSec: number | null
  mirrorGenerationMs: number | null
  replayGenerationMs: number | null
  exportQueueDepth: number
}

export interface HallOGridMirrorPosture {
  tenantId: string
  generatedAt: string
  sourceFreshnessSec: number | null
  freshnessBudgetSec: number
  safeDelayWindowSec: number
  mirrorMode: 'hot' | 'warm' | 'cold'
  degraded: boolean
  degradedReason: string | null
  laneBudgets: HallOGridLaneBudgets
  metrics: HallOGridMirrorMetrics
}

export interface HallOGridFrame {
  id: string
  createdAt: string
  action: 'run_now' | 'reroute' | 'delay' | 'throttle' | 'deny'
  region: string
  reasonCode: string
  reasonLabel: string
  workloadClass: WorkloadClass
  proofState: 'available' | 'unavailable'
  replayState: 'verified' | 'mismatch' | 'pending' | 'unavailable'
  traceState: 'locked' | 'unavailable'
  governanceSource: string | null
  explanation: {
    headline: string
    dominantConstraint: string
    counterfactual: string
  }
  trust: {
    tier: string
    freshnessLabel: string
    replayability: string
    degraded: boolean
    summary: string
  }
  metrics: {
    totalLatencyMs: number | null
    computeLatencyMs: number | null
    carbonReductionPct: number | null
    waterImpactDeltaLiters: number | null
    signalConfidence: number | null
  }
  runtime: {
    signalMode: string | null
    accountingMethod: string | null
    waterAuthorityMode: string | null
    fallbackUsed: boolean
    systemState: WorldExecutionState
  }
  balancingAuthority?: string | null
  demandRampPct?: number | null
  carbonSpikeProbability?: number | null
  curtailmentProbability?: number | null
  importCarbonLeakageScore?: number | null
  estimatedFlag?: boolean | null
  syntheticFlag?: boolean | null
}

export interface HallOGridFrameDetail {
  generatedAt: string
  mirror?: HallOGridMirrorPosture
  frame: HallOGridFrame
  evidence: {
    trace: {
      available: boolean
      hash: string | null
      inputHash: string | null
      sequenceNumber: number | null
      createdAt: string | null
      governanceSource: string | null
      constraintsApplied: string[]
      candidates: Array<{
        region: string
        score: number
        waterStressIndex: number
        cacheStatus: string | null
      }>
    }
    replay: {
      available: boolean
      deterministicMatch: boolean | null
      traceBacked: boolean
      mismatches: string[]
      selectedRegion: string | null
      selectedAction: string | null
      reasonCode: string | null
      proofHash: string | null
    }
    proof: {
      hash: string | null
      evidenceRefs: string[]
      providerSnapshotRefs: string[]
      notBefore: string | null
    }
  }
  explanation: DecisionExplanationContract | null
  trust: DecisionTrustContract | null
}

export interface HallOGridCounterfactual {
  id: string
  label: string
  status: 'selected' | 'viable' | 'blocked'
  region: string
  action: HallOGridFrame['action']
  carbonDeltaPct: number
  costDeltaPct: number
  latencyDeltaMs: number
  riskLevel: 'low' | 'guarded' | 'high'
  rationale: string
}

export interface HallOGridDoctrineSummary {
  doctrineId: string
  doctrineLabel: string
  version: string
  status: 'draft' | 'candidate' | 'certified' | 'expired'
  automationMode: 'advisory_only' | 'supervised_automatic' | 'full_authority'
  failMode: 'fail_safe_deny' | 'fail_guarded_delay' | 'fail_open_last_safe_doctrine'
  signedBy: string
  signedAt: string
  certificationScope: string[]
  controlPoints: string[]
  activePolicyLabel: string
}

export interface HallOGridOverrideRecord {
  id: string
  requestedAction: 'approve_anyway' | 'force_reroute' | 'force_delay' | 'force_deny' | 'switch_to_advisory'
  reasonCode: string
  scope: string
  status: 'active' | 'scheduled' | 'expired'
  requestedBy: string
  createdAt: string
  expiresAt: string | null
  ticketRef: string
}

export interface HallOGridHazardEvent {
  id: string
  type: 'near_miss' | 'degraded_stream' | 'policy_pressure' | 'stale_signal' | 'capacity_risk'
  severity: 'info' | 'warning' | 'critical'
  status: 'open' | 'watching' | 'resolved'
  summary: string
  region: string | null
  detectedAt: string
  decisionFrameId: string | null
}

export interface HallOGridBusinessImpact {
  avoidedCo2Kg: number
  avoidedCostUsd: number
  avoidedSloBreaches: number
  alertsAbsorbed: number
  operatorHoursRecovered: number
}

export interface HallOGridDrillRun {
  id: string
  scenario: string
  status: 'simulated'
  failMode: HallOGridDoctrineSummary['failMode']
  riskDelta: 'low' | 'guarded' | 'high'
  runAt: string
  summary: string
}

export interface HallOGridProWorkspace {
  generatedAt: string
  mirror?: HallOGridMirrorPosture
  frameId: string
  counterfactuals: HallOGridCounterfactual[]
  doctrine: HallOGridDoctrineSummary
  overrides: HallOGridOverrideRecord[]
  hazards: HallOGridHazardEvent[]
  businessImpact: HallOGridBusinessImpact
}

export interface CommandCenterProjectionSnapshot {
  dataStatus: 'live' | 'stale' | 'broken'
  projectionLagSec: number | null
  latestProjectionAt?: string | null
  latestCanonicalAt?: string | null
  quality: { suspectCount: number; invalidCount: number }
  outbox: {
    pending: number
    failed: number
  } | null
}

export interface HallOGridSnapshot {
  generatedAt: string
  selectedFrameId: string | null
  title: string
  subtitle: string
  access: HallOGridConsoleAccess
  mirror: HallOGridMirrorPosture
  projection: CommandCenterProjectionSnapshot
  selectedFrame: HallOGridFrameDetail | null
  frames: HallOGridFrame[]
  world: {
    nodes: WorldRegionState[]
    flows: WorldRoutingFlow[]
  }
  governance: SaiqGovernanceSnapshot
  traceStream: {
    items: TraceEventItem[]
  }
  health: SystemHealthSnapshot
  transport: {
    mode: string
    streamHealthy: boolean
    snapshotUrl: string
    streamUrl: string
    adapters: HallOGridAdapterProfile[]
  }
}

export interface DecisionTraceRawRecord {
  sequenceNumber: number
  decisionFrameId: string
  traceHash: string
  previousTraceHash: string | null
  inputSignalHash: string
  createdAt: string
  payload: {
    identity: {
      traceId: string
      decisionFrameId: string
      requestId: string
      createdAt: string
      sequenceNumber: number
    }
    inputSignals: {
      request: Record<string, unknown>
      resolvedCandidates: Array<{
        region: string
        runner: string
        carbonIntensity: number
        signalMode: 'marginal' | 'average' | 'fallback'
        accountingMethod: 'marginal' | 'flow-traced' | 'average'
        waterSignal: {
          waterStressIndex: number
          scenario: 'current' | '2030' | '2050' | '2080'
          fallbackUsed?: boolean
        }
        waterImpactLiters: number
        scarcityImpact: number
        reliabilityMultiplier: number
        score: number
        defensiblePenalty: number
        defensibleReasonCodes: string[]
        guardrailCandidateBlocked: boolean
        guardrailReasons: string[]
        providerSnapshotRef: string
        waterAuthority: {
          authorityMode: 'basin' | 'facility_overlay' | 'fallback'
          scenario: 'current' | '2030' | '2050' | '2080'
          confidence: number
          supplierSet: string[]
          evidenceRefs: string[]
          facilityId?: string | null
        }
        cacheStatus: 'live' | 'warm' | 'redis' | 'lkg' | 'degraded-safe'
        providerResolutionMs: number
        carbonFreshnessSec: number | null
        waterFreshnessSec: number | null
      }>
    }
    normalizedSignals: {
      candidates: Array<{
        region: string
        score: number
        carbonIntensity: number
        waterStressIndex: number
        waterImpactLiters: number
        scarcityImpact: number
        reliabilityMultiplier: number
        defensiblePenalty: number
        defensibleReasonCodes: string[]
        guardrailBlocked: boolean
        guardrailReasons: string[]
        cacheStatus: 'live' | 'warm' | 'redis' | 'lkg' | 'degraded-safe'
        authorityMode: 'basin' | 'facility_overlay' | 'fallback'
        signalMode: 'marginal' | 'average' | 'fallback'
        accountingMethod: 'marginal' | 'flow-traced' | 'average'
        carbonFreshnessSec: number | null
        waterFreshnessSec: number | null
        fallbackApplied: boolean
      }>
    }
    decisionPath: {
      evaluatedRegions: string[]
      rejectedRegions: Array<{
        region: string
        reasonCodes: string[]
      }>
      selectedRegion: string
      baselineRegion: string
      action: string
      reasonCode: string
      operatingMode: string
      rerouteFrom: string | null
      precedenceOverrideApplied: boolean
      delayWindow: {
        allowed: boolean
        delayMinutes: number | null
        notBefore: string | null
        reason: string
      }
    }
    governance: {
      label: 'SAIQ'
      source: string
      strict: boolean
      score?: number | null
      zone?: 'green' | 'amber' | 'red' | null
      weights?: {
        carbon: number | null
        water: number | null
        latency: number | null
        cost: number | null
      } | null
      thresholds?: Record<string, number | null> | null
      constraintsApplied: string[]
      policyReferences: string[]
      seked: {
        enabled: boolean
        strict: boolean
        evaluated: boolean
        applied: boolean
        hookStatus: string
        reasonCodes: string[]
        policyReference: string | null
      }
      external: {
        enabled: boolean
        strict: boolean
        evaluated: boolean
        applied: boolean
        hookStatus: string
        reasonCodes: string[]
        policyReference: string | null
      }
    }
    proof: {
      proofHash: string
      datasetReferences: Array<{
        name?: string
        datasetVersion?: string | null
        manifestHash?: string | null
        computedHash?: string | null
        sourceUrl?: string | null
      }>
      bundleHash: string | null
      manifestHash: string | null
      artifactMetadata: Record<string, unknown>
      providerSnapshotRefs: string[]
      evidenceRefs: string[]
      supplierRefs: string[]
      adapter: Record<string, unknown>
    }
    performance: {
      totalMs: number | null
      computeMs: number | null
      stageTimings: {
        artifactSnapshotMs: number
        candidateEvaluationMs: number
        policyHookMs: number
        doctrineAssemblyMs: number
        traceAssemblyMs: number
      }
      providerTimings: Array<{
        region: string
        latencyMs: number
        cacheStatus: 'live' | 'warm' | 'redis' | 'lkg' | 'degraded-safe'
        carbonFreshnessSec: number | null
        waterFreshnessSec: number | null
        stalenessSec: number | null
      }>
      cacheHit: boolean
    }
  }
}

export interface CommandCenterHeader {
  systemActive: boolean | null
  systemStatus: string
  saiqEnforced: boolean | null
  traceLocked: boolean | null
  replayVerified: boolean | null
  detail: string
}

export interface CommandCenterDecisionItem {
  decisionFrameId: string
  createdAt: string
  action: string
  reasonCode: string
  selectedRegion: string
  proofHash: string | null
  traceAvailable: boolean
  governanceSource: string | null
  latencyTotalMs: number | null
  latencyComputeMs: number | null
  signalConfidence: number | null
  signalMode: 'marginal' | 'average' | 'fallback' | null
  accountingMethod: 'marginal' | 'flow-traced' | 'average' | null
  waterAuthorityMode: 'basin' | 'facility_overlay' | 'fallback' | null
  fallbackUsed: boolean
  systemState: WorldExecutionState
}

export interface WorldRegionState {
  region: string
  label: string
  x: number
  y: number
  state: WorldExecutionState
  decisionFrameId: string | null
  action: string | null
  reasonCode: string | null
  confidenceTier: 'high' | 'medium' | 'low'
  freshnessState: 'fresh' | 'degraded' | 'stale'
  pressureLevel: 'low' | 'medium' | 'high'
  signalConfidence: number | null
  decisionState: 'run' | 'guarded' | 'blocked'
  providerHealth?: { healthy: number; degraded: number; offline: number }
  selected?: boolean
  lastChangedAt?: string
  routePressure?: number
  blockedFocusLanes?: number
}

export interface WorldRoutingFlow {
  id: string
  fromRegion: string
  toRegion: string
  mode: 'route' | 'blocked'
}

export interface SaiqGovernanceSnapshot {
  frameworkLabel: 'SAIQ'
  source: string | null
  active: boolean | null
  strict: boolean | null
  enforcementMode: string | null
  selectedScore: number | null
  thresholds: Record<string, number | null> | null
  weights: {
    carbon: number | null
    water: number | null
    latency: number | null
    cost: number | null
  } | null
  impact: {
    carbonReductionPct: number | null
    waterImpactDeltaLiters: number | null
    signalConfidence: number | null
    constraintsApplied: number
    cacheHit: boolean | null
  }
}

export interface TraceEventItem {
  decisionFrameId: string
  createdAt: string
  action: string
  region: string
  reasonCode: string
  proofAvailable: boolean
  traceAvailable: boolean
  governanceSource: string | null
  replayVerified: boolean | null
}

export interface SystemHealthSnapshot {
  service: ControlSurfaceOverview['service']
  latency: LiveSystemSnapshot['latency']
  provenance: LiveSystemSnapshot['providers']
  providers: ControlSurfaceProviderNode[]
}

export interface CommandCenterSnapshot {
  generatedAt: string
  selectedDecisionFrameId: string | null
  projection: CommandCenterProjectionSnapshot
  header: CommandCenterHeader
  world: {
    nodes: WorldRegionState[]
    flows: WorldRoutingFlow[]
  }
  decisionCore: {
    recentDecisions: CommandCenterDecisionItem[]
    selectedDecision: CommandCenterDecisionItem | null
    selectedTrace: DecisionTraceRawRecord | null
    selectedReplay: LiveSystemReplayResponse | null
  }
  governance: SaiqGovernanceSnapshot
  traceStream: {
    items: TraceEventItem[]
  }
  health: SystemHealthSnapshot
}
