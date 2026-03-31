export interface InvestorComparisonRow {
  systemType: string
  decisionAuthority: string
  proof: string
  multiObjective: string
  realTimeEnforcement: string
}

export interface ApproachGroup {
  title: string
  description: string
  examples: string[]
  limitations: string[]
}

export interface RouterAction {
  name: 'run_now' | 'reroute' | 'delay' | 'throttle' | 'deny'
  description: string
}

export interface ProofArtifact {
  name: string
  description: string
}

export interface SourceLink {
  label: string
  href: string
}

export const investorComparisonRows: InvestorComparisonRow[] = [
  {
    systemType: 'Academic schedulers',
    decisionAuthority: 'Advisory',
    proof: 'No',
    multiObjective: 'Partial',
    realTimeEnforcement: 'No',
  },
  {
    systemType: 'Carbon APIs',
    decisionAuthority: 'Informational',
    proof: 'No',
    multiObjective: 'Carbon-only',
    realTimeEnforcement: 'No',
  },
  {
    systemType: 'Cloud policies',
    decisionAuthority: 'Static rules',
    proof: 'No',
    multiObjective: 'Limited',
    realTimeEnforcement: 'Partial',
  },
  {
    systemType: 'CO2 Router',
    decisionAuthority: 'Deterministic',
    proof: 'Yes',
    multiObjective: 'Carbon + water + latency + cost',
    realTimeEnforcement: 'Yes',
  },
]

export const existingApproachGroups: ApproachGroup[] = [
  {
    title: 'Academic schedulers',
    description:
      'PCAPS, carbon-aware cluster schedulers, and microservice placement systems optimize placement with mathematical models, heuristics, or probabilistic guarantees.',
    examples: ['PCAPS / CAP', 'DRO fleet schedulers', 'Aceso'],
    limitations: [
      'Advisory, not binding',
      'No audit-grade proof',
      'Not built as production enforcement layers',
    ],
  },
  {
    title: 'Signal providers',
    description:
      'Carbon and water signal providers expose telemetry that others can consume, but they do not decide or enforce where compute runs.',
    examples: ['WattTime', 'WRI Aqueduct', 'AWARE'],
    limitations: [
      'No decision authority',
      'No enforcement path',
      'No multi-objective reasoning on their own',
    ],
  },
  {
    title: 'Audit systems',
    description:
      'Tamper-evident logging systems prove that a record was not modified, but they do not control execution or policy outcomes.',
    examples: ['Ratifio', 'Hash-chain audit patterns'],
    limitations: [
      'No decision intelligence',
      'No execution control',
      'No routing or workload governance',
    ],
  },
  {
    title: 'Enforcement primitives',
    description:
      'Admission controllers and policy engines can block unsafe resources, but they do not perform multi-objective routing or generate full decision proof on their own.',
    examples: ['Gatekeeper', 'Validating admission policy'],
    limitations: [
      'No carbon-water decision intelligence',
      'No replayable baseline-vs-selected proof',
      'Require a control plane to tell them what to enforce',
    ],
  },
]

export const routerActions: RouterAction[] = [
  {
    name: 'run_now',
    description: 'Execute immediately because the current target satisfies doctrine, latency, and cost constraints.',
  },
  {
    name: 'reroute',
    description: 'Move execution to a cleaner or less water-stressed region before resources are allocated.',
  },
  {
    name: 'delay',
    description: 'Hold execution until a cleaner time window arrives inside the workload deadline.',
  },
  {
    name: 'throttle',
    description: 'Reduce resource intensity when the job must proceed but environmental conditions are degraded.',
  },
  {
    name: 'deny',
    description: 'Block execution when doctrine is violated and no acceptable alternative exists.',
  },
]

export const proofArtifacts: ProofArtifact[] = [
  {
    name: 'Baseline vs selected outcome',
    description: 'Shows the counterfactual target beside the enforced choice and the delta achieved.',
  },
  {
    name: 'Signal lineage',
    description: 'Records which carbon and water signals were used, with freshness and fallback state.',
  },
  {
    name: 'Policy trace',
    description: 'Captures which doctrine rules and thresholds produced the final action.',
  },
  {
    name: 'Replayable decision frame',
    description: 'Preserves the exact decision context so the engine can recompute the result later.',
  },
  {
    name: 'Cryptographic hash-chain record',
    description: 'Makes the historical trail tamper-evident instead of narrative-only logging.',
  },
]

export const methodologySources: SourceLink[] = [
  {
    label: 'WattTime: Marginal CO2 signal methodology',
    href: 'https://watttime.org/data-science/data-signals/marginal-co2/',
  },
  {
    label: 'WattTime: Average vs marginal emissions',
    href: 'https://watttime.org/data-science/data-signals/average-vs-marginal/',
  },
  {
    label: 'WRI Aqueduct 4.0 monthly water risk dataset',
    href: 'https://developers.google.com/earth-engine/datasets/catalog/WRI_Aqueduct_Water_Risk_V4_baseline_monthly',
  },
  {
    label: 'WULCA: AWARE water scarcity method',
    href: 'https://wulca-waterlca.org/aware/what-is-aware/',
  },
  {
    label: 'Ratifio: Tamper-proof audit trails',
    href: 'https://ratifio.com/resources/tamper-proof-audit-trails/',
  },
  {
    label: 'VeritasChain: SHA-256 hash-chain audit log pattern',
    href: 'https://dev.to/veritaschain/building-a-tamper-evident-audit-log-with-sha-256-hash-chains-zero-dependencies-h0b',
  },
  {
    label: 'Gatekeeper validating admission policy integration',
    href: 'https://open-policy-agent.github.io/gatekeeper/website/docs/v3.16.x/validating-admission-policy/',
  },
  {
    label: 'IBM: Control plane vs data plane',
    href: 'https://www.ibm.com/think/topics/control-plane-vs-data-plane',
  },
  {
    label: 'Carbon-aware computing with probabilistic guarantees',
    href: 'https://arxiv.org/html/2410.21510v3',
  },
  {
    label: 'Aceso: Carbon-aware and cost-effective microservice placement',
    href: 'https://arxiv.org/html/2603.10768',
  },
  {
    label: 'PCAPS: Carbon- and precedence-aware scheduling',
    href: 'https://arxiv.org/html/2502.09717v1',
  },
]
