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
    cacheStatus?: 'live' | 'warm' | 'redis' | 'fallback'
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
  freshnessSec: number | null
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
    cacheStatus?: 'live' | 'warm' | 'redis' | 'fallback'
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

export type WorldExecutionState = 'active' | 'marginal' | 'blocked'

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
        cacheStatus: 'live' | 'warm' | 'fallback'
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
        cacheStatus: 'live' | 'warm' | 'fallback'
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
        cacheStatus: 'live' | 'warm' | 'fallback'
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
