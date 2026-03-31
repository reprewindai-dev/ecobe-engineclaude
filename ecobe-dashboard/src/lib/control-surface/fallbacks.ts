import type {
  CommandCenterSnapshot,
  ControlSurfaceOverview,
  LiveSystemSnapshot,
} from '@/types/control-surface'

const UNAVAILABLE_DATASETS: LiveSystemSnapshot['providers']['datasets'] = [
  { name: 'aqueduct', verificationStatus: 'unavailable', datasetVersion: null, manifestHash: null, computedHash: null },
  { name: 'aware', verificationStatus: 'unavailable', datasetVersion: null, manifestHash: null, computedHash: null },
  { name: 'wwf', verificationStatus: 'unavailable', datasetVersion: null, manifestHash: null, computedHash: null },
  { name: 'nrel', verificationStatus: 'unavailable', datasetVersion: null, manifestHash: null, computedHash: null },
]

export const FALLBACK_LIVE_SYSTEM_SNAPSHOT: LiveSystemSnapshot = {
  generatedAt: 'Shell ready',
  recentDecisions: {
    available: false,
    error: 'Live decision frames are hydrating.',
    items: [],
  },
  traceLedger: {
    available: false,
    error: 'Trace posture will attach when the live frame resolves.',
    traceAvailable: false,
    traceHash: null,
    inputSignalHash: null,
    sequenceNumber: null,
    proofAvailable: false,
    replayConsistent: null,
  },
  governance: {
    available: false,
    error: 'SAIQ state will attach when live governance resolves.',
    frameworkLabel: 'SAIQ',
    active: null,
    policyState: null,
    latestDecisionAction: null,
    latestReasonCode: null,
  },
  providers: {
    available: false,
    error: 'Verified provider posture is hydrating.',
    datasets: UNAVAILABLE_DATASETS,
  },
  latency: {
    available: false,
    error: 'Live latency data is hydrating.',
    samples: null,
    p95TotalMs: null,
    p95ComputeMs: null,
    budgetTotalP95Ms: null,
    budgetComputeP95Ms: null,
    withinBudget: {
      total: null,
      compute: null,
    },
  },
}

export const FALLBACK_COMMAND_CENTER_SNAPSHOT: CommandCenterSnapshot = {
  generatedAt: 'Shell ready',
  selectedDecisionFrameId: null,
  header: {
    systemActive: null,
    systemStatus: 'shell-ready',
    saiqEnforced: null,
    traceLocked: null,
    replayVerified: null,
    detail: 'Command-center structure is live. Decision data attaches as the current frame resolves.',
  },
  world: {
    nodes: [],
    flows: [],
  },
  decisionCore: {
    recentDecisions: [],
    selectedDecision: null,
    selectedTrace: null,
    selectedReplay: null,
  },
  governance: {
    frameworkLabel: 'SAIQ',
    source: null,
    active: null,
    strict: null,
    enforcementMode: null,
    selectedScore: null,
    thresholds: null,
    weights: null,
    impact: {
      carbonReductionPct: null,
      waterImpactDeltaLiters: null,
      signalConfidence: null,
      constraintsApplied: 0,
      cacheHit: null,
    },
  },
  traceStream: {
    items: [],
  },
  health: {
    service: {
      status: 'shell-ready',
      proofPosture: 'Proof posture attaches with the live frame.',
      detail: 'Latency, provenance, and provider state will populate without replacing the command center shell.',
    },
    latency: FALLBACK_LIVE_SYSTEM_SNAPSHOT.latency,
    provenance: FALLBACK_LIVE_SYSTEM_SNAPSHOT.providers,
    providers: [],
  },
}

export const FALLBACK_OVERVIEW: Pick<
  ControlSurfaceOverview,
  'actionDistribution' | 'providers' | 'replay'
> = {
  actionDistribution: [],
  providers: [],
  replay: null,
}
