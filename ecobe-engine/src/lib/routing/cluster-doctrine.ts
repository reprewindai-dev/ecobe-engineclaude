import { env } from '../../config/env'
import type { RoutingSignal } from '../carbon/provider-router'

export type ClusterRole =
  | 'ALWAYS_ON_PREFERRED'
  | 'TEMPORAL_ONLY'
  | 'AVOID_IF_POSSIBLE'
  | 'DUMP_ELIGIBLE'

export type EnsoPhase =
  | 'NEUTRAL'
  | 'EL_NINO_WATCH'
  | 'EL_NINO_MODERATE'
  | 'EL_NINO_STRONG'
  | 'EL_NINO_SUPER'

export interface ClusterDefinition {
  clusterId: string
  role: ClusterRole
  balancingAuthorities: string[]
  operatorHints: string[]
  residencyTier: string
  latencyTier: string
  authorityMode: 'live_verified' | 'computed_structural'
  notes: string
  regions: string[]
  cleanWindowMaxIntensity?: number
  structuralBias: number
}

export interface ClusterDoctrineResolution {
  clusterId: string | null
  clusterRole: ClusterRole | null
  clusterBiasApplied: number
  clusterReason: string | null
  ensoPhase: EnsoPhase
  structuralModifier: number
  temporalWindowQualified: boolean
  effectiveRole: ClusterRole | null
}

type ClusterModifier = {
  scoreAdjustment: number
  roleOverride?: ClusterRole
  intensityMultiplier?: number
  temporalOnly?: boolean
}

const CLUSTERS: ClusterDefinition[] = [
  {
    clusterId: 'NA_ONTARIO_CLEAN_BASELOAD',
    role: 'ALWAYS_ON_PREFERRED',
    balancingAuthorities: ['IESO'],
    operatorHints: ['ontario', 'ieso'],
    residencyTier: 'CA',
    latencyTier: 'NA_EAST',
    authorityMode: 'computed_structural',
    notes: 'Ontario clean baseload anchor backed by nuclear and hydro weighting.',
    regions: ['northamerica-northeast2', 'canadacentral'],
    structuralBias: -18,
  },
  {
    clusterId: 'NA_QUEBEC_HYDRO',
    role: 'DUMP_ELIGIBLE',
    balancingAuthorities: ['HYDRO_QUEBEC'],
    operatorHints: ['quebec', 'hydro_quebec'],
    residencyTier: 'CA',
    latencyTier: 'NA_EAST',
    authorityMode: 'computed_structural',
    notes: 'Hydro-backed Quebec cluster with live-verified structural preference.',
    regions: ['ca-central-1', 'northamerica-northeast1', 'canadaeast'],
    structuralBias: -14,
  },
  {
    clusterId: 'NA_BC_HYDRO',
    role: 'DUMP_ELIGIBLE',
    balancingAuthorities: ['BC_HYDRO'],
    operatorHints: ['british_columbia', 'bc_hydro'],
    residencyTier: 'CA',
    latencyTier: 'NA_WEST',
    authorityMode: 'computed_structural',
    notes: 'Hydro-backed British Columbia cluster with stricter stress handling.',
    regions: ['canadawest'],
    structuralBias: -11,
  },
  {
    clusterId: 'NA_CA_SOLAR_WINDOW',
    role: 'TEMPORAL_ONLY',
    balancingAuthorities: ['CAISO'],
    operatorHints: ['caiso'],
    residencyTier: 'US',
    latencyTier: 'NA_WEST',
    authorityMode: 'live_verified',
    notes: 'California clean-window bias only when live low-carbon window is active.',
    regions: ['us-west-1'],
    cleanWindowMaxIntensity: 140,
    structuralBias: -6,
  },
  {
    clusterId: 'EU_NORWAY_HYDRO',
    role: 'DUMP_ELIGIBLE',
    balancingAuthorities: ['STATNETT'],
    operatorHints: ['statnett', 'norway'],
    residencyTier: 'EU',
    latencyTier: 'EU_NORTH',
    authorityMode: 'live_verified',
    notes: 'ENSO-neutral Nordic hydro backbone.',
    regions: ['norwayeast', 'norwaywest'],
    structuralBias: -10,
  },
  {
    clusterId: 'EU_SWEDEN_HYDRO_NUCLEAR',
    role: 'DUMP_ELIGIBLE',
    balancingAuthorities: ['SVENSKA_KRAFTNAT'],
    operatorHints: ['sweden', 'svenska_kraftnat'],
    residencyTier: 'EU',
    latencyTier: 'EU_NORTH',
    authorityMode: 'live_verified',
    notes: 'Hydro and nuclear weighted Nordic cluster.',
    regions: ['eu-north-1', 'swedencentral'],
    structuralBias: -9,
  },
  {
    clusterId: 'EU_FINLAND_NUCLEAR_WIND',
    role: 'DUMP_ELIGIBLE',
    balancingAuthorities: ['FINGRID'],
    operatorHints: ['finland', 'fingrid'],
    residencyTier: 'EU',
    latencyTier: 'EU_NORTH',
    authorityMode: 'live_verified',
    notes: 'Finland nuclear and wind structural winner.',
    regions: ['europe-north1'],
    structuralBias: -9,
  },
  {
    clusterId: 'EU_DENMARK_WIND',
    role: 'TEMPORAL_ONLY',
    balancingAuthorities: ['ENERGINET'],
    operatorHints: ['denmark', 'energinet'],
    residencyTier: 'EU',
    latencyTier: 'EU_NORTH',
    authorityMode: 'live_verified',
    notes: 'Wind-heavy Denmark cluster used opportunistically.',
    regions: ['dk1-west', 'dk2-east'],
    cleanWindowMaxIntensity: 120,
    structuralBias: -4,
  },
]

const REGION_TO_CLUSTER = new Map<string, ClusterDefinition>()
for (const cluster of CLUSTERS) {
  for (const region of cluster.regions) {
    REGION_TO_CLUSTER.set(region, cluster)
  }
}

const ENSO_MODIFIERS: Record<string, Record<EnsoPhase, ClusterModifier>> = {
  NA_ONTARIO_CLEAN_BASELOAD: {
    NEUTRAL: { scoreAdjustment: -18 },
    EL_NINO_WATCH: { scoreAdjustment: -16 },
    EL_NINO_MODERATE: { scoreAdjustment: -14 },
    EL_NINO_STRONG: { scoreAdjustment: -10 },
    EL_NINO_SUPER: { scoreAdjustment: -8 },
  },
  NA_QUEBEC_HYDRO: {
    NEUTRAL: { scoreAdjustment: -14 },
    EL_NINO_WATCH: { scoreAdjustment: -11 },
    EL_NINO_MODERATE: { scoreAdjustment: -6 },
    EL_NINO_STRONG: { scoreAdjustment: 2, roleOverride: 'TEMPORAL_ONLY' },
    EL_NINO_SUPER: { scoreAdjustment: 8, roleOverride: 'TEMPORAL_ONLY' },
  },
  NA_BC_HYDRO: {
    NEUTRAL: { scoreAdjustment: -11 },
    EL_NINO_WATCH: { scoreAdjustment: -8 },
    EL_NINO_MODERATE: { scoreAdjustment: -3 },
    EL_NINO_STRONG: { scoreAdjustment: 4, roleOverride: 'TEMPORAL_ONLY' },
    EL_NINO_SUPER: { scoreAdjustment: 9, roleOverride: 'TEMPORAL_ONLY' },
  },
  NA_CA_SOLAR_WINDOW: {
    NEUTRAL: { scoreAdjustment: -8, temporalOnly: true, intensityMultiplier: 1.05 },
    EL_NINO_WATCH: { scoreAdjustment: -10, temporalOnly: true, intensityMultiplier: 1.1 },
    EL_NINO_MODERATE: { scoreAdjustment: -12, temporalOnly: true, intensityMultiplier: 1.15 },
    EL_NINO_STRONG: { scoreAdjustment: -15, temporalOnly: true, intensityMultiplier: 1.2 },
    EL_NINO_SUPER: { scoreAdjustment: -18, temporalOnly: true, intensityMultiplier: 1.25 },
  },
  EU_NORWAY_HYDRO: {
    NEUTRAL: { scoreAdjustment: -10 },
    EL_NINO_WATCH: { scoreAdjustment: -10 },
    EL_NINO_MODERATE: { scoreAdjustment: -10 },
    EL_NINO_STRONG: { scoreAdjustment: -10 },
    EL_NINO_SUPER: { scoreAdjustment: -10 },
  },
  EU_SWEDEN_HYDRO_NUCLEAR: {
    NEUTRAL: { scoreAdjustment: -9 },
    EL_NINO_WATCH: { scoreAdjustment: -9 },
    EL_NINO_MODERATE: { scoreAdjustment: -9 },
    EL_NINO_STRONG: { scoreAdjustment: -9 },
    EL_NINO_SUPER: { scoreAdjustment: -9 },
  },
  EU_FINLAND_NUCLEAR_WIND: {
    NEUTRAL: { scoreAdjustment: -9 },
    EL_NINO_WATCH: { scoreAdjustment: -9 },
    EL_NINO_MODERATE: { scoreAdjustment: -9 },
    EL_NINO_STRONG: { scoreAdjustment: -9 },
    EL_NINO_SUPER: { scoreAdjustment: -9 },
  },
  EU_DENMARK_WIND: {
    NEUTRAL: { scoreAdjustment: -4, temporalOnly: true },
    EL_NINO_WATCH: { scoreAdjustment: -4, temporalOnly: true },
    EL_NINO_MODERATE: { scoreAdjustment: -4, temporalOnly: true },
    EL_NINO_STRONG: { scoreAdjustment: -4, temporalOnly: true },
    EL_NINO_SUPER: { scoreAdjustment: -4, temporalOnly: true },
  },
}

function resolveTemporalQualification(cluster: ClusterDefinition, signal: RoutingSignal, modifier: ClusterModifier) {
  if (cluster.role !== 'TEMPORAL_ONLY' && !modifier.temporalOnly) {
    return true
  }

  if (signal.provenance.fallbackUsed || signal.confidence < 0.45) {
    return false
  }

  const maxIntensity = (cluster.cleanWindowMaxIntensity ?? 130) * (modifier.intensityMultiplier ?? 1)
  return signal.carbonIntensity <= maxIntensity
}

function buildReason(cluster: ClusterDefinition, effectiveRole: ClusterRole, temporalWindowQualified: boolean, modifier: ClusterModifier) {
  if (effectiveRole === 'TEMPORAL_ONLY' && !temporalWindowQualified) {
    return `${cluster.clusterId} withheld because the temporal clean-window qualification did not pass.`
  }

  if (modifier.roleOverride && modifier.roleOverride !== cluster.role) {
    return `${cluster.clusterId} role tightened from ${cluster.role} to ${modifier.roleOverride} under ${env.CARBON_CLUSTER_ENSO_PHASE}.`
  }

  return `${cluster.clusterId} bias applied under ${env.CARBON_CLUSTER_ENSO_PHASE} doctrine.`
}

export function resolveClusterDefinition(region: string) {
  return REGION_TO_CLUSTER.get(region) ?? null
}

export function resolveClusterDoctrine(region: string, signal: RoutingSignal): ClusterDoctrineResolution {
  const cluster = resolveClusterDefinition(region)
  const ensoPhase = env.CARBON_CLUSTER_ENSO_PHASE as EnsoPhase

  if (!cluster) {
    return {
      clusterId: null,
      clusterRole: null,
      clusterBiasApplied: 0,
      clusterReason: null,
      ensoPhase,
      structuralModifier: 0,
      temporalWindowQualified: false,
      effectiveRole: null,
    }
  }

  const modifier = ENSO_MODIFIERS[cluster.clusterId]?.[ensoPhase] ?? { scoreAdjustment: cluster.structuralBias }
  const effectiveRole = modifier.roleOverride ?? cluster.role
  const temporalWindowQualified = resolveTemporalQualification(cluster, signal, modifier)
  const structuralModifier = modifier.scoreAdjustment
  const clusterBiasApplied =
    effectiveRole === 'TEMPORAL_ONLY' && !temporalWindowQualified
      ? Math.abs(structuralModifier) + 12
      : structuralModifier

  return {
    clusterId: cluster.clusterId,
    clusterRole: cluster.role,
    clusterBiasApplied,
    clusterReason: buildReason(cluster, effectiveRole, temporalWindowQualified, modifier),
    ensoPhase,
    structuralModifier,
    temporalWindowQualified,
    effectiveRole,
  }
}

export function getClusterCatalog() {
  return [...CLUSTERS]
}
