export interface RoutingWeightSet {
  carbon: number
  water: number
  latency: number
  cost: number
}

export type RoutingMode = 'optimize' | 'assurance'
export type PolicyMode = 'default' | 'sec_disclosure_strict' | 'eu_24x7_ready'
export type SignalType = 'average_operational' | 'marginal_estimate' | 'consumed_emissions' | 'unknown'
export type WaterPolicyProfileId =
  | 'default'
  | 'drought_sensitive'
  | 'eu_data_center_reporting'
  | 'high_water_sensitivity'

export interface WaterPolicyProfile {
  id: WaterPolicyProfileId
  name: string
  summary: string
  guardrailStressThreshold: number
  guardrailScarcityThreshold: number
  missingSignalMode: 'penalize' | 'fail_closed'
  conservativeFallbackIntensityLPerKwh: number
  conservativeFallbackScarcityCf: number
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

export interface PolicyModeDefinition {
  id: PolicyMode
  name: string
  summary: string
  assuranceMode: boolean
  conservativeDisagreement: boolean
  preferredSignalTypes: SignalType[]
}

export interface StandardsMappingRow {
  framework: string
  ecobeField: string
  standardField: string
  note: string
}

export const DEFAULT_ROUTING_WEIGHTS: RoutingWeightSet = {
  carbon: 0.5,
  water: 0,
  latency: 0.2,
  cost: 0.3,
}

export const ASSURANCE_DISAGREEMENT_THRESHOLD_PCT = 15

export const ASSURANCE_MODE_SUMMARY =
  'Assurance mode is a disclosure-ready routing policy that favors conservative treatment of provider disagreement, explicit uncertainty bands, and audit-grade export metadata over aggressive optimization.'

export const LOWEST_DEFENSIBLE_SIGNAL_DOCTRINE =
  'Ecobe bases routing decisions on the lowest defensible signal: the freshest, best-quality emissions signal that is traceable, validated where possible, and auditable after the fact.'

export const ROUTING_LEGAL_DISCLAIMER =
  'Ecobe recommends execution targets using best-available grid signals. Providers can diverge or degrade, and final execution responsibility remains with the operator. Every decision is logged with provenance for later review.'

export const WATER_POLICY_PROFILES: WaterPolicyProfile[] = [
  {
    id: 'default',
    name: 'Default Water Aware',
    summary: 'Applies water-aware scoring when signals are present and uses conservative penalties when they are not.',
    guardrailStressThreshold: 4,
    guardrailScarcityThreshold: 0.25,
    missingSignalMode: 'penalize',
    conservativeFallbackIntensityLPerKwh: 2.5,
    conservativeFallbackScarcityCf: 75,
  },
  {
    id: 'drought_sensitive',
    name: 'Drought Sensitive',
    summary: 'Raises stress sensitivity and fails closed for non-critical work when water signals are missing.',
    guardrailStressThreshold: 3.5,
    guardrailScarcityThreshold: 0.18,
    missingSignalMode: 'fail_closed',
    conservativeFallbackIntensityLPerKwh: 3,
    conservativeFallbackScarcityCf: 100,
  },
  {
    id: 'eu_data_center_reporting',
    name: 'EU Data Centre Reporting',
    summary: 'Optimizes for auditable water footprint reporting and conservative scarcity handling.',
    guardrailStressThreshold: 3.8,
    guardrailScarcityThreshold: 0.2,
    missingSignalMode: 'fail_closed',
    conservativeFallbackIntensityLPerKwh: 2.8,
    conservativeFallbackScarcityCf: 90,
  },
  {
    id: 'high_water_sensitivity',
    name: 'High Water Sensitivity',
    summary: 'Aggressively avoids high-stress, high-scarcity basins and treats unknown water signals as blocking.',
    guardrailStressThreshold: 3,
    guardrailScarcityThreshold: 0.12,
    missingSignalMode: 'fail_closed',
    conservativeFallbackIntensityLPerKwh: 3.5,
    conservativeFallbackScarcityCf: 125,
  },
]

export const POLICY_MODES: PolicyModeDefinition[] = [
  {
    id: 'default',
    name: 'Default Optimize',
    summary: 'Balances carbon, latency, and cost for normal production routing.',
    assuranceMode: false,
    conservativeDisagreement: false,
    preferredSignalTypes: ['average_operational', 'marginal_estimate', 'consumed_emissions'],
  },
  {
    id: 'sec_disclosure_strict',
    name: 'SEC Disclosure Strict',
    summary:
      'Uses assurance mode defaults, conservative disagreement handling, and disclosure-ready decision metadata for audit and filing support.',
    assuranceMode: true,
    conservativeDisagreement: true,
    preferredSignalTypes: ['average_operational'],
  },
  {
    id: 'eu_24x7_ready',
    name: 'EU 24/7 Ready',
    summary:
      'Uses assurance mode with hourly provenance, confidence bands, and granular-certificate-oriented export fields.',
    assuranceMode: true,
    conservativeDisagreement: true,
    preferredSignalTypes: ['average_operational', 'consumed_emissions'],
  },
]

export const STANDARDS_MAPPING: StandardsMappingRow[] = [
  {
    framework: 'GHG Protocol Scope 2',
    ecobeField: 'intensity_gco2_per_kwh',
    standardField: 'location-based emission factor',
    note: 'Supports reproducible location-based Scope 2 calculations for digital workloads.',
  },
  {
    framework: 'GHG Protocol Scope 2',
    ecobeField: 'emissions_gco2',
    standardField: 'reported Scope 2 emissions',
    note: 'Derived from estimated kWh and intensity used at decision time.',
  },
  {
    framework: 'EnergyTag / Granular Certificates',
    ecobeField: 'timestamp',
    standardField: 'time interval',
    note: 'Hourly or sub-hourly decision timestamp used for granular clean-energy matching.',
  },
  {
    framework: 'EnergyTag / Granular Certificates',
    ecobeField: 'region',
    standardField: 'location',
    note: 'Cloud region or balancing-area mapping for certificate alignment.',
  },
  {
    framework: 'EnergyTag / Granular Certificates',
    ecobeField: 'estimated_kwh',
    standardField: 'volume',
    note: 'Energy volume assigned to the routed workload record.',
  },
  {
    framework: 'SEC / CSRD audit support',
    ecobeField: 'source_used, signal_type, policy_mode, batch_hash',
    standardField: 'methodology / provenance / integrity evidence',
    note: 'Explains which signal drove the decision and proves the export batch was not altered.',
  },
]

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
    water: weights?.water ?? DEFAULT_ROUTING_WEIGHTS.water,
    latency: weights?.latency ?? DEFAULT_ROUTING_WEIGHTS.latency,
    cost: weights?.cost ?? DEFAULT_ROUTING_WEIGHTS.cost,
  }

  const total = candidate.carbon + candidate.water + candidate.latency + candidate.cost
  if (total <= 0) {
    return { ...DEFAULT_ROUTING_WEIGHTS }
  }

  return {
    carbon: candidate.carbon / total,
    water: candidate.water / total,
    latency: candidate.latency / total,
    cost: candidate.cost / total,
  }
}

export function resolveRoutingMode(
  mode?: RoutingMode | null,
  policyMode?: PolicyMode | null
): RoutingMode {
  if (mode) return mode
  if (policyMode && policyMode !== 'default') return 'assurance'
  return 'optimize'
}

export function resolvePolicyMode(
  policyMode?: PolicyMode | null,
  mode?: RoutingMode | null
): PolicyMode {
  if (policyMode) return policyMode
  if (mode === 'assurance') return 'sec_disclosure_strict'
  return 'default'
}

export function getPolicyModeDefinition(policyMode: PolicyMode): PolicyModeDefinition {
  const definition = POLICY_MODES.find((candidate) => candidate.id === policyMode)
  if (!definition) {
    throw new Error(`Unknown policy mode: ${policyMode}`)
  }
  return definition
}

export function inferSignalType(sourceUsed?: string | null): SignalType {
  const source = sourceUsed?.toUpperCase() ?? ''

  if (!source) return 'unknown'
  if (source.includes('WATTTIME')) return 'marginal_estimate'
  if (
    source.includes('GRIDSTATUS') ||
    source.includes('EIA') ||
    source.includes('EMBER') ||
    source.includes('GB_CARBON') ||
    source.includes('DK_CARBON') ||
    source.includes('FI_CARBON') ||
    source.includes('STATIC')
  ) {
    return 'average_operational'
  }

  return 'unknown'
}

export function getWaterPolicyProfile(profileId?: WaterPolicyProfileId | null): WaterPolicyProfile {
  const profile = WATER_POLICY_PROFILES.find((candidate) => candidate.id === (profileId ?? 'default'))
  if (!profile) {
    throw new Error(`Unknown water policy profile: ${profileId}`)
  }
  return profile
}
