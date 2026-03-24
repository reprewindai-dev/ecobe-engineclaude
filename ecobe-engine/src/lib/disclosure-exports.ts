import { createHash, createHmac } from 'crypto'

import {
  POLICY_MODES,
  STANDARDS_MAPPING,
  inferSignalType,
  type PolicyMode,
  type RoutingMode,
  type SignalType,
  type StandardsMappingRow,
  type PolicyModeDefinition,
} from './methodology'

export type DisclosureExportScope = 'organization' | 'system' | 'global'

export interface LedgerDisclosureEntry {
  id: string
  orgId: string
  decisionFrameId?: string | null
  createdAt: Date
  chosenStartTs?: Date | null
  jobClass: string
  workloadType?: string | null
  baselineRegion: string
  chosenRegion: string
  baselineCarbonGPerKwh: number
  chosenCarbonGPerKwh: number
  energyEstimateKwh: number
  baselineCarbonG: number
  chosenCarbonG: number
  carbonSavedG: number
  actualCarbonGPerKwh?: number | null
  actualCarbonG?: number | null
  accountingMethod: string
  sourceUsed?: string | null
  validationSource?: string | null
  fallbackUsed: boolean
  estimatedFlag: boolean
  syntheticFlag: boolean
  qualityTier?: string | null
  confidenceLabel?: string | null
  disagreementFlag: boolean
  disagreementPct?: number | null
  routingMode?: string | null
  policyMode?: string | null
  signalTypeUsed?: string | null
  referenceTime?: Date | null
  dataFreshnessSeconds?: number | null
  confidenceBandLow?: number | null
  confidenceBandMid?: number | null
  confidenceBandHigh?: number | null
  lowerHalfBenchmarkGPerKwh?: number | null
  lowerHalfQualified?: boolean | null
  baselineWaterL?: number | null
  chosenWaterL?: number | null
  waterSavedL?: number | null
  baselineWaterScarcityImpact?: number | null
  chosenWaterScarcityImpact?: number | null
  baselineWaterIntensityLPerKwh?: number | null
  chosenWaterIntensityLPerKwh?: number | null
  waterStressIndex?: number | null
  waterQualityIndex?: number | null
  droughtRiskIndex?: number | null
  waterConfidenceScore?: number | null
  waterSource?: string | null
  waterSignalType?: string | null
  waterDatasetVersion?: string | null
  waterPolicyProfile?: string | null
  waterGuardrailTriggered?: boolean | null
  waterFallbackUsed?: boolean | null
  waterReferenceTime?: Date | null
  metadata?: Record<string, unknown> | null
}

export interface DisclosureRecord {
  timestamp: string
  decision_timestamp: string
  organization_id: string
  workload_type: string | null
  job_class: string
  decision_id: string
  decision_frame_id: string | null
  region: string
  baseline_region: string
  estimated_kwh: number
  emissions_gco2: number
  baseline_emissions_gco2: number
  carbon_saved_gco2: number
  intensity_gco2_per_kwh: number
  baseline_intensity_gco2_per_kwh: number
  signal_type: SignalType
  source: string | null
  validation_source: string | null
  mode: RoutingMode
  policy_mode: PolicyMode
  assurance_mode: boolean
  quality_tier: string | null
  confidence_label: string | null
  ci_low: number | null
  ci_mid: number | null
  ci_high: number | null
  fallback_used: boolean
  estimated_flag: boolean
  synthetic_flag: boolean
  disagreement_flag: boolean
  disagreement_pct: number | null
  reference_time: string | null
  data_freshness_seconds: number | null
  location_based_scope2_gco2: number
  market_based_scope2_gco2: number | null
  accounting_method: string
  lower_half_benchmark_gco2_per_kwh: number | null
  lower_half_qualified: boolean | null
  water_liters: number | null
  baseline_water_liters: number | null
  water_saved_liters: number | null
  water_scarcity_impact: number | null
  baseline_water_scarcity_impact: number | null
  water_intensity_l_per_kwh: number | null
  baseline_water_intensity_l_per_kwh: number | null
  water_stress_index: number | null
  water_quality_index: number | null
  drought_risk_index: number | null
  water_confidence_score: number | null
  water_source: string | null
  water_signal_type: string | null
  water_dataset_version: string | null
  water_policy_profile: string | null
  water_guardrail_triggered: boolean
  water_fallback_used: boolean
  water_reference_time: string | null
}

export interface DisclosureEnvelope {
  batch_id: string
  generated_at: string
  scope: DisclosureExportScope
  org_id: string | null
  record_count: number
  integrity: {
    payload_digest: string
    digest_algorithm: 'sha256'
    signature: string | null
    signature_algorithm: 'hmac-sha256' | null
    signed: boolean
    hash_scope: 'canonical_payload_excluding_integrity_values'
  }
  standards_mapping: StandardsMappingRow[]
  policy_modes: PolicyModeDefinition[]
  records: DisclosureRecord[]
}

type EnvelopeArgs = {
  batchId: string
  generatedAt: string
  scope: DisclosureExportScope
  orgId: string | null
  records: DisclosureRecord[]
  signingSecret?: string
}

export function resolveDisclosureScope(
  orgId?: string,
  requestedScope?: DisclosureExportScope
): { scope: DisclosureExportScope; orgId: string | null } {
  if (requestedScope === 'organization' && !orgId) {
    throw new Error('orgId is required when scope=organization')
  }

  if (requestedScope === 'global' && orgId) {
    throw new Error('orgId cannot be combined with scope=global')
  }

  if (orgId) {
    return { scope: 'organization', orgId }
  }

  return { scope: requestedScope ?? 'system', orgId: null }
}

export function toDisclosureRecord(entry: LedgerDisclosureEntry): DisclosureRecord {
  const mode = normalizeRoutingMode(entry.routingMode)
  const policyMode = normalizePolicyMode(entry.policyMode)
  const signalType = normalizeSignalType(entry.signalTypeUsed, entry.sourceUsed)
  const emissions = entry.actualCarbonG ?? entry.chosenCarbonG
  const intensity = entry.actualCarbonGPerKwh ?? entry.chosenCarbonGPerKwh
  const timestamp = entry.chosenStartTs ?? entry.createdAt

  return {
    timestamp: timestamp.toISOString(),
    decision_timestamp: entry.createdAt.toISOString(),
    organization_id: entry.orgId,
    workload_type: entry.workloadType ?? null,
    job_class: entry.jobClass,
    decision_id: entry.id,
    decision_frame_id: entry.decisionFrameId ?? null,
    region: entry.chosenRegion,
    baseline_region: entry.baselineRegion,
    estimated_kwh: round3(entry.energyEstimateKwh),
    emissions_gco2: round3(emissions),
    baseline_emissions_gco2: round3(entry.baselineCarbonG),
    carbon_saved_gco2: round3(entry.carbonSavedG),
    intensity_gco2_per_kwh: round3(intensity),
    baseline_intensity_gco2_per_kwh: round3(entry.baselineCarbonGPerKwh),
    signal_type: signalType,
    source: entry.sourceUsed ?? null,
    validation_source: entry.validationSource ?? null,
    mode,
    policy_mode: policyMode,
    assurance_mode: mode === 'assurance',
    quality_tier: entry.qualityTier ?? null,
    confidence_label: entry.confidenceLabel ?? null,
    ci_low: entry.confidenceBandLow != null ? round3(entry.confidenceBandLow) : null,
    ci_mid:
      entry.confidenceBandMid != null ? round3(entry.confidenceBandMid) : round3(intensity),
    ci_high: entry.confidenceBandHigh != null ? round3(entry.confidenceBandHigh) : null,
    fallback_used: entry.fallbackUsed,
    estimated_flag: entry.estimatedFlag,
    synthetic_flag: entry.syntheticFlag,
    disagreement_flag: entry.disagreementFlag,
    disagreement_pct:
      entry.disagreementPct != null ? round3(entry.disagreementPct) : null,
    reference_time: entry.referenceTime?.toISOString() ?? null,
    data_freshness_seconds: entry.dataFreshnessSeconds ?? null,
    location_based_scope2_gco2: round3(emissions),
    market_based_scope2_gco2: null,
    accounting_method: entry.accountingMethod,
    lower_half_benchmark_gco2_per_kwh:
      entry.lowerHalfBenchmarkGPerKwh != null ? round3(entry.lowerHalfBenchmarkGPerKwh) : null,
    lower_half_qualified: entry.lowerHalfQualified ?? null,
    water_liters: entry.chosenWaterL != null ? round3(entry.chosenWaterL) : null,
    baseline_water_liters: entry.baselineWaterL != null ? round3(entry.baselineWaterL) : null,
    water_saved_liters: entry.waterSavedL != null ? round3(entry.waterSavedL) : null,
    water_scarcity_impact:
      entry.chosenWaterScarcityImpact != null ? round3(entry.chosenWaterScarcityImpact) : null,
    baseline_water_scarcity_impact:
      entry.baselineWaterScarcityImpact != null
        ? round3(entry.baselineWaterScarcityImpact)
        : null,
    water_intensity_l_per_kwh:
      entry.chosenWaterIntensityLPerKwh != null ? round3(entry.chosenWaterIntensityLPerKwh) : null,
    baseline_water_intensity_l_per_kwh:
      entry.baselineWaterIntensityLPerKwh != null
        ? round3(entry.baselineWaterIntensityLPerKwh)
        : null,
    water_stress_index: entry.waterStressIndex != null ? round3(entry.waterStressIndex) : null,
    water_quality_index:
      entry.waterQualityIndex != null ? round3(entry.waterQualityIndex) : null,
    drought_risk_index:
      entry.droughtRiskIndex != null ? round3(entry.droughtRiskIndex) : null,
    water_confidence_score:
      entry.waterConfidenceScore != null ? round3(entry.waterConfidenceScore) : null,
    water_source: entry.waterSource ?? null,
    water_signal_type: entry.waterSignalType ?? null,
    water_dataset_version: entry.waterDatasetVersion ?? null,
    water_policy_profile: entry.waterPolicyProfile ?? null,
    water_guardrail_triggered: entry.waterGuardrailTriggered ?? false,
    water_fallback_used: entry.waterFallbackUsed ?? false,
    water_reference_time: entry.waterReferenceTime?.toISOString() ?? null,
  }
}

export function buildDisclosureEnvelope(args: EnvelopeArgs): DisclosureEnvelope {
  const unsignedEnvelope: DisclosureEnvelope = {
    batch_id: args.batchId,
    generated_at: args.generatedAt,
    scope: args.scope,
    org_id: args.orgId,
    record_count: args.records.length,
    integrity: {
      payload_digest: '',
      digest_algorithm: 'sha256',
      signature: null,
      signature_algorithm: args.signingSecret ? 'hmac-sha256' : null,
      signed: Boolean(args.signingSecret),
      hash_scope: 'canonical_payload_excluding_integrity_values',
    },
    standards_mapping: STANDARDS_MAPPING,
    policy_modes: POLICY_MODES,
    records: args.records,
  }

  const canonical = canonicalStringify(unsignedEnvelope)
  const payloadDigest = createHash('sha256').update(canonical).digest('hex')
  const signature = args.signingSecret
    ? createHmac('sha256', args.signingSecret).update(payloadDigest).digest('hex')
    : null

  return {
    ...unsignedEnvelope,
    integrity: {
      ...unsignedEnvelope.integrity,
      payload_digest: payloadDigest,
      signature,
    },
  }
}

export function buildDisclosureCsv(records: DisclosureRecord[]): string {
  const columns: Array<keyof DisclosureRecord> = [
    'timestamp',
    'decision_timestamp',
    'organization_id',
    'workload_type',
    'job_class',
    'decision_id',
    'decision_frame_id',
    'region',
    'baseline_region',
    'estimated_kwh',
    'emissions_gco2',
    'baseline_emissions_gco2',
    'carbon_saved_gco2',
    'intensity_gco2_per_kwh',
    'baseline_intensity_gco2_per_kwh',
    'signal_type',
    'source',
    'validation_source',
    'mode',
    'policy_mode',
    'assurance_mode',
    'quality_tier',
    'confidence_label',
    'ci_low',
    'ci_mid',
    'ci_high',
    'fallback_used',
    'estimated_flag',
    'synthetic_flag',
    'disagreement_flag',
    'disagreement_pct',
    'reference_time',
    'data_freshness_seconds',
    'location_based_scope2_gco2',
    'market_based_scope2_gco2',
    'accounting_method',
    'lower_half_benchmark_gco2_per_kwh',
    'lower_half_qualified',
    'water_liters',
    'baseline_water_liters',
    'water_saved_liters',
    'water_scarcity_impact',
    'baseline_water_scarcity_impact',
    'water_intensity_l_per_kwh',
    'baseline_water_intensity_l_per_kwh',
    'water_stress_index',
    'water_quality_index',
    'drought_risk_index',
    'water_confidence_score',
    'water_source',
    'water_signal_type',
    'water_dataset_version',
    'water_policy_profile',
    'water_guardrail_triggered',
    'water_fallback_used',
    'water_reference_time',
  ]

  const escape = (value: unknown) => {
    if (value === null || value === undefined) return ''
    const text = String(value)
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
    return text
  }

  const lines = [columns.join(',')]
  for (const record of records) {
    lines.push(columns.map((column) => escape(record[column])).join(','))
  }

  return lines.join('\n')
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2)
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }

  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    )
    return Object.fromEntries(entries.map(([key, inner]) => [key, sortKeys(inner)]))
  }

  return value
}

function normalizeRoutingMode(mode?: string | null): RoutingMode {
  return mode === 'assurance' ? 'assurance' : 'optimize'
}

function normalizePolicyMode(policyMode?: string | null): PolicyMode {
  if (policyMode === 'sec_disclosure_strict' || policyMode === 'eu_24x7_ready') {
    return policyMode
  }
  return 'default'
}

function normalizeSignalType(signalType?: string | null, sourceUsed?: string | null): SignalType {
  if (
    signalType === 'average_operational' ||
    signalType === 'marginal_estimate' ||
    signalType === 'consumed_emissions'
  ) {
    return signalType
  }
  return inferSignalType(sourceUsed)
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}
