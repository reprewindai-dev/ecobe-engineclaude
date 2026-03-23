export interface RoutingWeightSet {
  carbon: number
  latency: number
  cost: number
}

export interface MethodologyTier {
  id: string
  name: string
  purpose: string
  providers: Array<{
    name: string
    role: string
    coverage: string
  }>
}

export const DEFAULT_ROUTING_WEIGHTS: RoutingWeightSet = {
  carbon: 0.5,
  latency: 0.2,
  cost: 0.3,
}

export const LOWEST_DEFENSIBLE_SIGNAL_DOCTRINE =
  'Ecobe bases routing decisions on the lowest defensible signal: the freshest, best-quality emissions signal that is traceable, validated where possible, and auditable after the fact.'

export const ROUTING_LEGAL_DISCLAIMER =
  'Ecobe recommends execution targets using best-available grid signals. Providers can diverge or degrade, and final execution responsibility remains with the operator. Every decision is logged with provenance for later review.'

export const METHODOLOGY_TIERS: MethodologyTier[] = [
  {
    id: 'tier-1',
    name: 'Tier 1',
    purpose: 'Operational routing signals used directly in live region selection.',
    providers: [
      {
        name: 'WattTime MOER',
        role: 'Primary causal routing signal for supported US regions',
        coverage: 'US balancing-authority mapped cloud regions',
      },
      {
        name: 'GB Carbon Intensity / DK Carbon / FI Carbon',
        role: 'Regional real-time primary signals',
        coverage: 'Great Britain, Denmark, Finland',
      },
    ],
  },
  {
    id: 'tier-1-5',
    name: 'Tier 1.5',
    purpose: 'Backbone telemetry and direct grid feeds used for validation, fallback, and predictive grid context.',
    providers: [
      {
        name: 'EIA-930 direct',
        role: 'Free federal backbone for US load, generation, and balancing telemetry',
        coverage: 'United States',
      },
      {
        name: 'GridStatus.io',
        role: 'Unified access layer over EIA and ISO/RTO datasets',
        coverage: 'US ISOs / balancing authorities',
      },
      {
        name: 'ISO / interchange telemetry',
        role: 'Demand ramp, interchange, curtailment, and leakage features',
        coverage: 'Mapped regions where grid telemetry is available',
      },
    ],
  },
  {
    id: 'tier-2',
    name: 'Tier 2',
    purpose: 'Forecast drivers and structural validation used to bound uncertainty and detect stale or implausible routing recommendations.',
    providers: [
      {
        name: 'WattTime / regional forecast feeds',
        role: 'Short-horizon forecast support for scheduling and clean-window detection',
        coverage: 'Provider-dependent by region',
      },
      {
        name: 'Ember structural profiles',
        role: 'Structural baseline and validation layer',
        coverage: 'Global country-level coverage',
      },
      {
        name: 'Historical cadence model',
        role: 'Fallback forecast generation with freshness gates and native-resolution awareness',
        coverage: 'All regions with sufficient history',
      },
    ],
  },
]

export function normalizeRoutingWeights(
  weights?: Partial<RoutingWeightSet> | null
): RoutingWeightSet {
  const candidate: RoutingWeightSet = {
    carbon: weights?.carbon ?? DEFAULT_ROUTING_WEIGHTS.carbon,
    latency: weights?.latency ?? DEFAULT_ROUTING_WEIGHTS.latency,
    cost: weights?.cost ?? DEFAULT_ROUTING_WEIGHTS.cost,
  }

  const total = candidate.carbon + candidate.latency + candidate.cost
  if (total <= 0) {
    return { ...DEFAULT_ROUTING_WEIGHTS }
  }

  return {
    carbon: candidate.carbon / total,
    latency: candidate.latency / total,
    cost: candidate.cost / total,
  }
}

