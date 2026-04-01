import type { Prisma } from '@prisma/client'

import { env } from '../../config/env'
import { prisma } from '../db'

export const DECISION_PROJECTION_VERSION = 'ci_projection_v1'
export const LOW_CONFIDENCE_THRESHOLD = 0.6
const MAX_CARBON_INTENSITY_G_PER_KWH = 2000
const MAX_WATER_LITERS = 100000
const MAX_WATER_STRESS_INDEX = 10

export type DecisionProjectionDataStatus = 'healthy' | 'degraded' | 'stale' | 'broken'
export type DecisionProjectionQualityStatus = 'CLEAN' | 'SUSPECT' | 'INVALID'
export type CarbonDataQuality = 'EXACT' | 'DERIVED' | 'INCOMPLETE'

export interface DecisionProjectionPayload {
  sourceCiDecisionId: string
  sourceDecisionFrameId: string
  createdAt: string
  projectedFrom: 'ci_runtime' | 'ci_replay'
  workloadName: string | null
  opName: string | null
  baselineRegion: string | null
  chosenRegion: string
  zoneBaseline: string | null
  zoneChosen: string | null
  carbonIntensityBaselineGPerKwh: number | null
  carbonIntensityChosenGPerKwh: number | null
  baselineEnergyKwh: number | null
  chosenEnergyKwh: number | null
  estimatedKwh: number | null
  carbonDataQuality: CarbonDataQuality | null
  reason: string | null
  latencyEstimateMs: number | null
  latencyActualMs: number | null
  fallbackUsed: boolean
  lowConfidence: boolean
  signalConfidence: number | null
  dataFreshnessSeconds: number | null
  requestCount: number
  sourceUsed: string | null
  validationSource: string | null
  referenceTime: string | null
  disagreementFlag: boolean | null
  disagreementPct: number | null
  estimatedFlag: boolean | null
  syntheticFlag: boolean | null
  legacySavings: number | null
  carbonSavingsRatio: number | null
  waterImpactLiters: number | null
  waterBaselineLiters: number | null
  waterScarcityImpact: number | null
  waterStressIndex: number | null
  waterConfidence: number | null
  proofHash: string | null
  decisionAction: string | null
  decisionMode: string | null
  meta: Record<string, unknown>
}

type PersistedCiDecisionRecord = {
  id: string
  decisionFrameId: string
  createdAt: Date
  baselineRegion?: string | null
  selectedRegion: string
  carbonIntensity: number
  baseline: number
  savings?: number | null
  carbonSavingsRatio?: number | null
  baselineEnergyKwh?: number | null
  chosenEnergyKwh?: number | null
  estimatedKwh?: number | null
  baselineCo2G?: number | null
  chosenCo2G?: number | null
  co2DeltaG?: number | null
  carbonDataQuality?: CarbonDataQuality | null
  decisionAction?: string | null
  decisionMode?: string | null
  reasonCode?: string | null
  signalConfidence?: number | null
  fallbackUsed: boolean
  lowConfidence?: boolean | null
  waterImpactLiters?: number | null
  waterBaselineLiters?: number | null
  waterScarcityImpact?: number | null
  waterStressIndex?: number | null
  waterConfidence?: number | null
  proofHash?: string | null
  metadata: Prisma.JsonValue
}

type ProjectionOutcome = {
  qualityStatus: DecisionProjectionQualityStatus
  qualityFlags: string[]
  carbonSavingsRatio: number | null
  waterDeltaLiters: number | null
  row: {
    createdAt: Date
    projectedAt: Date
    projectionVersion: string
    sourceCiDecisionId: string
    sourceDecisionFrameId: string
    workloadName: string | null
    opName: string | null
    baselineRegion: string
    chosenRegion: string
    zoneBaseline: string | null
    zoneChosen: string | null
    carbonIntensityBaselineGPerKwh: number | null
    carbonIntensityChosenGPerKwh: number | null
    baselineEnergyKwh: number | null
    chosenEnergyKwh: number | null
    estimatedKwh: number | null
    baselineCo2G: number | null
    chosenCo2G: number | null
    co2DeltaG: number | null
    co2BaselineG: number | null
    co2ChosenG: number | null
    carbonDataQuality: CarbonDataQuality
    reason: string | null
    latencyEstimateMs: number | null
    latencyActualMs: number | null
    fallbackUsed: boolean
    lowConfidence: boolean
    dataFreshnessSeconds: number | null
    requestCount: number
    sourceUsed: string | null
    validationSource: string | null
    referenceTime: Date | null
    disagreementFlag: boolean | null
    disagreementPct: number | null
    estimatedFlag: boolean | null
    syntheticFlag: boolean | null
    qualityStatus: DecisionProjectionQualityStatus
    qualityFlags: Prisma.InputJsonValue
    meta: Prisma.InputJsonValue
  }
}

export type DecisionProjectionOutboxSummary = {
  processed: number
  projected: number
  failed: number
  deadLetter: number
  skipped: number
}

type ProjectionFreshnessRow = {
  latestProjectionAt: Date | null
  latestCanonicalAt: Date | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function getNestedValue(input: unknown, path: Array<string | number>): unknown {
  let cursor: unknown = input
  for (const key of path) {
    if (Array.isArray(cursor)) {
      if (typeof key !== 'number') return undefined
      cursor = cursor[key]
      continue
    }
    if (!cursor || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[String(key)]
  }
  return cursor
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  return null
}

function toStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    const parsed = toStringValue(value)
    if (parsed) return parsed
  }
  return null
}

function firstNumber(values: unknown[]): number | null {
  for (const value of values) {
    const parsed = toFiniteNumber(value)
    if (parsed !== null) return parsed
  }
  return null
}

function firstBoolean(values: unknown[]): boolean | null {
  for (const value of values) {
    const parsed = toBoolean(value)
    if (parsed !== null) return parsed
  }
  return null
}

function validCarbonIntensity(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 && value <= MAX_CARBON_INTENSITY_G_PER_KWH
}

function validWaterLiters(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= MAX_WATER_LITERS
}

function validWaterStressIndex(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= MAX_WATER_STRESS_INDEX
}

function sanitizePositiveFloat(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return Number(value.toFixed(6))
}

export function normalizeLegacySavingsRatio(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  if (Math.abs(value) > 1) return value / 100
  return value
}

export function computeCarbonSavingsRatio(
  baselineIntensity: number | null,
  chosenIntensity: number | null
) {
  if (
    baselineIntensity === null ||
    chosenIntensity === null ||
    !Number.isFinite(baselineIntensity) ||
    !Number.isFinite(chosenIntensity) ||
    baselineIntensity <= 0
  ) {
    return null
  }

  return Number(((baselineIntensity - chosenIntensity) / baselineIntensity).toFixed(6))
}

function computeDelta(baselineValue: number | null, chosenValue: number | null) {
  if (
    baselineValue === null ||
    chosenValue === null ||
    !Number.isFinite(baselineValue) ||
    !Number.isFinite(chosenValue)
  ) {
    return null
  }
  return Number((baselineValue - chosenValue).toFixed(6))
}

export function computeCo2Grams(intensity: number | null, estimatedKwh: number | null) {
  if (
    intensity === null ||
    estimatedKwh === null ||
    !Number.isFinite(intensity) ||
    !Number.isFinite(estimatedKwh) ||
    estimatedKwh <= 0
  ) {
    return null
  }

  return Number((intensity * estimatedKwh).toFixed(6))
}

function resolveEnergyBasis(payload: Pick<
  DecisionProjectionPayload,
  'baselineEnergyKwh' | 'chosenEnergyKwh' | 'estimatedKwh' | 'carbonDataQuality'
>) {
  const explicitBaselineEnergyKwh = sanitizePositiveFloat(payload.baselineEnergyKwh)
  const explicitChosenEnergyKwh = sanitizePositiveFloat(payload.chosenEnergyKwh)
  const sharedEstimatedKwh = sanitizePositiveFloat(payload.estimatedKwh)

  if (explicitBaselineEnergyKwh !== null && explicitChosenEnergyKwh !== null) {
    return {
      baselineEnergyKwh: explicitBaselineEnergyKwh,
      chosenEnergyKwh: explicitChosenEnergyKwh,
      estimatedKwh:
        explicitBaselineEnergyKwh === explicitChosenEnergyKwh ? explicitBaselineEnergyKwh : null,
      carbonDataQuality: (payload.carbonDataQuality ?? 'EXACT') as CarbonDataQuality,
      energyDerived: false,
    }
  }

  if (sharedEstimatedKwh !== null) {
    return {
      baselineEnergyKwh: explicitBaselineEnergyKwh ?? sharedEstimatedKwh,
      chosenEnergyKwh: explicitChosenEnergyKwh ?? sharedEstimatedKwh,
      estimatedKwh: sharedEstimatedKwh,
      carbonDataQuality: 'DERIVED' as CarbonDataQuality,
      energyDerived: true,
    }
  }

  const singleExplicitEnergyKwh = explicitBaselineEnergyKwh ?? explicitChosenEnergyKwh
  if (singleExplicitEnergyKwh !== null) {
    return {
      baselineEnergyKwh: explicitBaselineEnergyKwh ?? singleExplicitEnergyKwh,
      chosenEnergyKwh: explicitChosenEnergyKwh ?? singleExplicitEnergyKwh,
      estimatedKwh: singleExplicitEnergyKwh,
      carbonDataQuality: 'DERIVED' as CarbonDataQuality,
      energyDerived: true,
    }
  }

  return {
    baselineEnergyKwh: null,
    chosenEnergyKwh: null,
    estimatedKwh: null,
    carbonDataQuality: 'INCOMPLETE' as CarbonDataQuality,
    energyDerived: false,
  }
}

function extractEstimatedKwh(metadata: Record<string, unknown>, explicit: number | null | undefined) {
  const direct = toFiniteNumber(explicit)
  if (direct !== null) return direct

  return firstNumber([
    getNestedValue(metadata, ['request', 'estimatedEnergyKwh']),
    getNestedValue(metadata, ['request', 'estimatedKwh']),
    getNestedValue(metadata, ['request', 'energyKwh']),
    getNestedValue(metadata, ['request', 'metadata', 'estimatedEnergyKwh']),
    getNestedValue(metadata, ['request', 'metadata', 'estimatedKwh']),
    getNestedValue(metadata, ['request', 'metadata', 'energyKwh']),
    getNestedValue(metadata, ['response', 'estimatedEnergyKwh']),
    getNestedValue(metadata, ['response', 'estimatedKwh']),
    getNestedValue(metadata, ['metadata', 'estimatedEnergyKwh']),
    getNestedValue(metadata, ['metadata', 'estimatedKwh']),
  ])
}

function enrichProjectionMeta(payload: DecisionProjectionPayload, outcome: ProjectionOutcome) {
  return {
    ...payload.meta,
    projection: {
      version: DECISION_PROJECTION_VERSION,
      projectedFrom: payload.projectedFrom,
      sourceCiDecisionId: payload.sourceCiDecisionId,
      sourceDecisionFrameId: payload.sourceDecisionFrameId,
      carbonSavingsRatio: outcome.carbonSavingsRatio,
      waterDeltaLiters: outcome.waterDeltaLiters,
      qualityStatus: outcome.qualityStatus,
      qualityFlags: outcome.qualityFlags,
      carbonDataQuality: outcome.row.carbonDataQuality,
      signalConfidence: payload.signalConfidence,
      lowConfidence: payload.lowConfidence,
    },
  }
}

export function buildDecisionProjectionPayloadFromPersistedDecision(
  decision: PersistedCiDecisionRecord
): DecisionProjectionPayload {
  const metadata = asRecord(decision.metadata)
  const request = asRecord(metadata.request)
  const response = asRecord(metadata.response)
  const mss = asRecord(response.mss)
  const proofRecord = asRecord(response.proofRecord)
  const disagreement = asRecord(mss.disagreement)

  const preferredRegions = toStringArray(getNestedValue(metadata, ['request', 'preferredRegions']))
  const baselineRegion =
    firstString([
      decision.baselineRegion,
      getNestedValue(metadata, ['response', 'baseline', 'region']),
      preferredRegions[0],
      decision.selectedRegion,
    ]) ?? decision.selectedRegion

  const createdAt =
    firstString([
      getNestedValue(metadata, ['response', 'proofRecord', 'timestamp']),
      getNestedValue(metadata, ['response', 'decisionEnvelope', 'timing', 'createdAt']),
      getNestedValue(metadata, ['response', 'decisionEnvelope', 'timing', 'evaluatedAt']),
    ]) ?? decision.createdAt.toISOString()

  const referenceTime =
    firstString([
      getNestedValue(metadata, ['response', 'proofRecord', 'timestamp']),
      getNestedValue(metadata, ['response', 'decisionEnvelope', 'timing', 'createdAt']),
    ]) ?? createdAt

  const signalConfidence =
    toFiniteNumber(decision.signalConfidence) ??
    firstNumber([getNestedValue(metadata, ['response', 'signalConfidence'])])
  const lowConfidence =
    Boolean(decision.lowConfidence) ||
    (signalConfidence !== null && signalConfidence < LOW_CONFIDENCE_THRESHOLD)

  const explicitBaselineEnergyKwh = toFiniteNumber(decision.baselineEnergyKwh)
  const explicitChosenEnergyKwh = toFiniteNumber(decision.chosenEnergyKwh)
  const estimatedKwh = extractEstimatedKwh(metadata, decision.estimatedKwh)
  const energyBasis = resolveEnergyBasis({
    baselineEnergyKwh: explicitBaselineEnergyKwh,
    chosenEnergyKwh: explicitChosenEnergyKwh,
    estimatedKwh,
    carbonDataQuality: decision.carbonDataQuality ?? null,
  })
  const carbonSavingsRatio =
    computeCarbonSavingsRatio(decision.baseline, decision.carbonIntensity) ??
    normalizeLegacySavingsRatio(decision.carbonSavingsRatio ?? decision.savings ?? null)

  return {
    sourceCiDecisionId: decision.id,
    sourceDecisionFrameId: decision.decisionFrameId,
    createdAt,
    projectedFrom: 'ci_replay',
    workloadName:
      firstString([
        getNestedValue(metadata, ['request', 'requestId']),
        getNestedValue(metadata, ['request', 'metadata', 'requestId']),
        decision.decisionFrameId,
      ]) ?? decision.decisionFrameId,
    opName: 'ci-decision',
    baselineRegion,
    chosenRegion: decision.selectedRegion,
    zoneBaseline: baselineRegion,
    zoneChosen: decision.selectedRegion,
    carbonIntensityBaselineGPerKwh: decision.baseline,
    carbonIntensityChosenGPerKwh: decision.carbonIntensity,
    baselineEnergyKwh: energyBasis.baselineEnergyKwh,
    chosenEnergyKwh: energyBasis.chosenEnergyKwh,
    estimatedKwh: energyBasis.estimatedKwh,
    carbonDataQuality: energyBasis.carbonDataQuality,
    reason:
      firstString([
        decision.reasonCode,
        getNestedValue(metadata, ['response', 'reasonCode']),
      ]) ?? null,
    latencyEstimateMs: firstNumber([
      getNestedValue(metadata, ['response', 'latencyMs', 'compute']),
    ]),
    latencyActualMs: firstNumber([
      getNestedValue(metadata, ['response', 'latencyMs', 'total']),
    ]),
    fallbackUsed: Boolean(decision.fallbackUsed),
    lowConfidence,
    signalConfidence,
    dataFreshnessSeconds: firstNumber([
      getNestedValue(metadata, ['response', 'mss', 'waterFreshnessSec']),
      getNestedValue(metadata, ['response', 'mss', 'carbonFreshnessSec']),
    ]),
    requestCount: 1,
    sourceUsed: firstString([
      getNestedValue(metadata, ['response', 'mss', 'carbonProvider']),
      getNestedValue(metadata, ['response', 'selected', 'carbonSourceUsed']),
      getNestedValue(metadata, ['response', 'proofRecord', 'signals_used', 0]),
    ]),
    validationSource: firstString([
      getNestedValue(metadata, ['response', 'selected', 'carbonSourceUsed']),
      getNestedValue(metadata, ['response', 'mss', 'carbonProvider']),
    ]),
    referenceTime,
    disagreementFlag: firstBoolean([disagreement.flag]),
    disagreementPct: firstNumber([disagreement.pct]),
    estimatedFlag: firstBoolean([getNestedValue(metadata, ['response', 'mss', 'lastKnownGoodApplied'])]),
    syntheticFlag: false,
    legacySavings: decision.savings ?? null,
    carbonSavingsRatio,
    waterImpactLiters: decision.waterImpactLiters ?? null,
    waterBaselineLiters: decision.waterBaselineLiters ?? null,
    waterScarcityImpact: decision.waterScarcityImpact ?? null,
    waterStressIndex: decision.waterStressIndex ?? null,
    waterConfidence: decision.waterConfidence ?? null,
    proofHash:
      firstString([
        decision.proofHash,
        getNestedValue(metadata, ['response', 'proofHash']),
      ]) ?? null,
    decisionAction:
      firstString([
        decision.decisionAction,
        getNestedValue(metadata, ['response', 'decision']),
      ]) ?? null,
    decisionMode:
      firstString([
        decision.decisionMode,
        getNestedValue(metadata, ['response', 'decisionMode']),
      ]) ?? null,
    meta: {
      decisionFrameId: decision.decisionFrameId,
      reasonCode:
        firstString([
          decision.reasonCode,
          getNestedValue(metadata, ['response', 'reasonCode']),
        ]) ?? null,
      signalConfidence,
      waterAuthorityMode: firstString([
        getNestedValue(metadata, ['response', 'waterAuthority', 'authorityMode']),
      ]),
      waterScenario: firstString([
        getNestedValue(metadata, ['response', 'waterAuthority', 'scenario']),
      ]),
      waterImpactLiters: decision.waterImpactLiters ?? null,
      waterBaselineLiters: decision.waterBaselineLiters ?? null,
      waterScarcityImpact: decision.waterScarcityImpact ?? null,
      waterStressIndex: decision.waterStressIndex ?? null,
      waterConfidence: decision.waterConfidence ?? null,
      proofHash:
        firstString([
          decision.proofHash,
          getNestedValue(metadata, ['response', 'proofHash']),
        ]) ?? null,
      datasetVersions: getNestedValue(metadata, ['response', 'water', 'datasetVersion']) ?? {},
      projectedFrom: 'ci_replay',
    },
  }
}

export function projectDashboardRoutingDecision(payload: DecisionProjectionPayload): ProjectionOutcome {
  const qualityFlags: string[] = []
  const createdAt = new Date(payload.createdAt)
  const referenceTime = payload.referenceTime ? new Date(payload.referenceTime) : createdAt
  const baselineRegion = payload.baselineRegion?.trim() || payload.chosenRegion
  const chosenRegion = payload.chosenRegion?.trim() || baselineRegion
  const baselineIntensity = validCarbonIntensity(payload.carbonIntensityBaselineGPerKwh)
    ? payload.carbonIntensityBaselineGPerKwh
    : null
  const chosenIntensity = validCarbonIntensity(payload.carbonIntensityChosenGPerKwh)
    ? payload.carbonIntensityChosenGPerKwh
    : null
  const energyBasis = resolveEnergyBasis(payload)
  const baselineEnergyKwh = energyBasis.baselineEnergyKwh
  const chosenEnergyKwh = energyBasis.chosenEnergyKwh
  const estimatedKwh = energyBasis.estimatedKwh
  const waterImpactLiters = validWaterLiters(payload.waterImpactLiters) ? payload.waterImpactLiters : null
  const waterBaselineLiters = validWaterLiters(payload.waterBaselineLiters) ? payload.waterBaselineLiters : null
  const waterStressIndex = validWaterStressIndex(payload.waterStressIndex) ? payload.waterStressIndex : null

  if (payload.carbonIntensityBaselineGPerKwh !== null && baselineIntensity === null) {
    qualityFlags.push('invalid_baseline_carbon')
  }
  if (payload.carbonIntensityChosenGPerKwh !== null && chosenIntensity === null) {
    qualityFlags.push('invalid_chosen_carbon')
  }
  if (payload.waterImpactLiters !== null && waterImpactLiters === null) {
    qualityFlags.push('invalid_water_impact_liters')
  }
  if (payload.waterBaselineLiters !== null && waterBaselineLiters === null) {
    qualityFlags.push('invalid_water_baseline_liters')
  }
  if (payload.waterStressIndex !== null && waterStressIndex === null) {
    qualityFlags.push('invalid_water_stress_index')
  }
  if (!payload.baselineRegion) {
    qualityFlags.push('missing_baseline_region')
  }
  if (baselineEnergyKwh === null) {
    qualityFlags.push('missing_baseline_energy_kwh')
  }
  if (chosenEnergyKwh === null) {
    qualityFlags.push('missing_chosen_energy_kwh')
  }
  if (energyBasis.energyDerived) {
    qualityFlags.push('derived_energy_basis')
  }

  const computedSavingsRatio =
    computeCarbonSavingsRatio(baselineIntensity, chosenIntensity) ??
    normalizeLegacySavingsRatio(payload.carbonSavingsRatio ?? payload.legacySavings)

  if (
    computedSavingsRatio !== null &&
    (computedSavingsRatio < -1 || computedSavingsRatio > 1)
  ) {
    qualityFlags.push('out_of_bounds_savings_ratio')
  }

  const waterDeltaLiters = computeDelta(waterBaselineLiters, waterImpactLiters)
  const baselineCo2G = computeCo2Grams(baselineIntensity, baselineEnergyKwh)
  const chosenCo2G = computeCo2Grams(chosenIntensity, chosenEnergyKwh)
  const co2DeltaG = computeDelta(baselineCo2G, chosenCo2G)

  const carbonDataQuality: CarbonDataQuality =
    baselineIntensity !== null &&
    chosenIntensity !== null &&
    baselineEnergyKwh !== null &&
    chosenEnergyKwh !== null
      ? energyBasis.carbonDataQuality
      : 'INCOMPLETE'

  const blockingQualityFlags = qualityFlags.filter((flag) => flag !== 'derived_energy_basis')
  let qualityStatus: DecisionProjectionQualityStatus = 'CLEAN'
  if (
    blockingQualityFlags.some((flag) =>
      flag.startsWith('invalid_') || flag === 'out_of_bounds_savings_ratio'
    )
  ) {
    qualityStatus = 'INVALID'
  } else if (blockingQualityFlags.length > 0) {
    qualityStatus = 'SUSPECT'
  }

  const row = {
    createdAt,
    projectedAt: new Date(),
    projectionVersion: DECISION_PROJECTION_VERSION,
    sourceCiDecisionId: payload.sourceCiDecisionId,
    sourceDecisionFrameId: payload.sourceDecisionFrameId,
    workloadName: payload.workloadName,
    opName: payload.opName ?? 'ci-decision',
    baselineRegion,
    chosenRegion,
    zoneBaseline: payload.zoneBaseline ?? baselineRegion,
    zoneChosen: payload.zoneChosen ?? chosenRegion,
    carbonIntensityBaselineGPerKwh: baselineIntensity,
    carbonIntensityChosenGPerKwh: chosenIntensity,
    baselineEnergyKwh,
    chosenEnergyKwh,
    estimatedKwh,
    baselineCo2G,
    chosenCo2G,
    co2DeltaG,
    co2BaselineG: baselineCo2G,
    co2ChosenG: chosenCo2G,
    carbonDataQuality,
    reason: payload.reason,
    latencyEstimateMs: payload.latencyEstimateMs,
    latencyActualMs: payload.latencyActualMs,
    fallbackUsed: payload.fallbackUsed,
    lowConfidence: payload.lowConfidence,
    dataFreshnessSeconds: payload.dataFreshnessSeconds,
    requestCount: Math.max(1, payload.requestCount || 1),
    sourceUsed: payload.sourceUsed,
    validationSource: payload.validationSource,
    referenceTime,
    disagreementFlag: payload.disagreementFlag,
    disagreementPct: payload.disagreementPct,
    estimatedFlag: payload.estimatedFlag,
    syntheticFlag: payload.syntheticFlag,
    qualityStatus,
    qualityFlags: qualityFlags as Prisma.InputJsonValue,
    meta: enrichProjectionMeta(payload, {
      qualityStatus,
      qualityFlags,
      carbonSavingsRatio: computedSavingsRatio,
      waterDeltaLiters,
      row: {} as ProjectionOutcome['row'],
    }) as Prisma.InputJsonValue,
  }

  return {
    qualityStatus,
    qualityFlags,
    carbonSavingsRatio: computedSavingsRatio,
    waterDeltaLiters,
    row,
  }
}

export async function enqueueDecisionProjection(tx: any, payload: DecisionProjectionPayload) {
  return tx.decisionProjectionOutbox.upsert({
    where: {
      sourceCiDecisionId: payload.sourceCiDecisionId,
    },
    create: {
      sourceCiDecisionId: payload.sourceCiDecisionId,
      decisionFrameId: payload.sourceDecisionFrameId,
      payload: payload as unknown as Prisma.InputJsonValue,
      status: 'PENDING',
      attemptCount: 0,
      nextAttemptAt: new Date(),
      lastError: null,
      processedAt: null,
    },
    update: {
      decisionFrameId: payload.sourceDecisionFrameId,
      payload: payload as unknown as Prisma.InputJsonValue,
      status: 'PENDING',
      attemptCount: 0,
      nextAttemptAt: new Date(),
      lastError: null,
      processedAt: null,
    },
  })
}

export async function processDecisionProjectionOutboxBatch(
  limit = env.DECISION_PROJECTION_BATCH_SIZE
): Promise<DecisionProjectionOutboxSummary> {
  const now = new Date()
  const summary: DecisionProjectionOutboxSummary = {
    processed: 0,
    projected: 0,
    failed: 0,
    deadLetter: 0,
    skipped: 0,
  }

  const candidates = await prisma.decisionProjectionOutbox.findMany({
    where: {
      status: {
        in: ['PENDING', 'FAILED'],
      },
      nextAttemptAt: {
        lte: now,
      },
    },
    take: Math.max(1, limit),
    orderBy: {
      createdAt: 'asc',
    },
  })

  for (const candidate of candidates) {
    const claimed = await prisma.decisionProjectionOutbox.updateMany({
      where: {
        id: candidate.id,
        status: {
          in: ['PENDING', 'FAILED'],
        },
        nextAttemptAt: {
          lte: now,
        },
      },
      data: {
        status: 'PROCESSING',
        attemptCount: {
          increment: 1,
        },
        lastError: null,
      },
    })

    if (claimed.count === 0) {
      summary.skipped += 1
      continue
    }

    const item = await prisma.decisionProjectionOutbox.findUnique({
      where: { id: candidate.id },
    })

    if (!item) {
      summary.skipped += 1
      continue
    }

    summary.processed += 1

    try {
      const payload = item.payload as unknown as DecisionProjectionPayload
      const projected = projectDashboardRoutingDecision(payload)

      await prisma.$transaction(async (tx: any) => {
        await tx.dashboardRoutingDecision.upsert({
          where: {
            sourceCiDecisionId: payload.sourceCiDecisionId,
          },
          create: projected.row,
          update: projected.row,
        })

        await tx.decisionProjectionOutbox.update({
          where: { id: item.id },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
            lastError: null,
          },
        })
      })

      summary.projected += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_PROJECTION_ERROR'
      const attemptCount = item.attemptCount + 1
      const shouldDeadLetter = attemptCount >= env.DECISION_PROJECTION_MAX_ATTEMPTS
      await prisma.decisionProjectionOutbox.update({
        where: { id: item.id },
        data: {
          status: shouldDeadLetter ? 'DEAD_LETTER' : 'FAILED',
          nextAttemptAt: shouldDeadLetter
            ? item.nextAttemptAt
            : new Date(
                Date.now() +
                  Math.min(
                    15 * 60 * 1000,
                    env.DECISION_PROJECTION_RETRY_BASE_MS * Math.pow(2, Math.max(0, attemptCount))
                  )
              ),
          lastError: message.slice(0, 1000),
          processedAt: shouldDeadLetter ? new Date() : null,
        },
      })

      if (shouldDeadLetter) {
        summary.deadLetter += 1
      } else {
        summary.failed += 1
      }
    }
  }

  return summary
}

export async function getDecisionProjectionFreshness() {
  const [latestProjectionRow, latestCanonicalRow, suspectCount, invalidCount] = await Promise.all([
    prisma.dashboardRoutingDecision.findFirst({
      where: {
        sourceCiDecisionId: {
          not: null,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
        projectedAt: true,
      },
    }),
    prisma.cIDecision.findFirst({
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
      },
    }),
    prisma.dashboardRoutingDecision.count({
      where: {
        sourceCiDecisionId: {
          not: null,
        },
        qualityStatus: 'SUSPECT',
      },
    }),
    prisma.dashboardRoutingDecision.count({
      where: {
        sourceCiDecisionId: {
          not: null,
        },
        qualityStatus: 'INVALID',
      },
    }),
  ])

  const latestProjectedSourceAt = latestProjectionRow?.createdAt ?? null
  const latestProjectionAt = latestProjectionRow?.projectedAt ?? null
  const latestCanonicalAt = latestCanonicalRow?.createdAt ?? null
  const projectionLagSec =
    latestProjectedSourceAt && latestCanonicalAt
      ? Math.max(
          0,
          Math.floor((latestCanonicalAt.getTime() - latestProjectedSourceAt.getTime()) / 1000)
        )
      : latestCanonicalAt
        ? Number.POSITIVE_INFINITY
        : null

  return {
    latestProjectionAt,
    latestCanonicalAt,
    projectionLagSec,
    dataStatus: classifyDecisionProjectionStatus(projectionLagSec),
    quality: {
      suspectCount,
      invalidCount,
    },
  }
}

export function classifyDecisionProjectionStatus(projectionLagSec: number | null): DecisionProjectionDataStatus {
  if (projectionLagSec === null) return 'healthy'
  if (!Number.isFinite(projectionLagSec)) return 'broken'
  if (projectionLagSec < 5 * 60) return 'healthy'
  if (projectionLagSec < 30 * 60) return 'degraded'
  if (projectionLagSec < 2 * 60 * 60) return 'stale'
  return 'broken'
}

export async function enqueueDecisionProjectionReplayWindow(input: {
  since: Date
  take?: number
}) {
  const take = Math.max(50, input.take ?? 250)
  let cursorId: string | undefined
  let scanned = 0
  let enqueued = 0

  for (;;) {
    const rows = await prisma.cIDecision.findMany({
      where: {
        createdAt: {
          gte: input.since,
        },
      },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      take,
      ...(cursorId
        ? {
            cursor: { id: cursorId },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        decisionFrameId: true,
        createdAt: true,
        baselineRegion: true,
        selectedRegion: true,
        carbonIntensity: true,
        baseline: true,
        savings: true,
        carbonSavingsRatio: true,
        baselineEnergyKwh: true,
        chosenEnergyKwh: true,
        estimatedKwh: true,
        baselineCo2G: true,
        chosenCo2G: true,
        co2DeltaG: true,
        carbonDataQuality: true,
        decisionAction: true,
        decisionMode: true,
        reasonCode: true,
        signalConfidence: true,
        fallbackUsed: true,
        lowConfidence: true,
        waterImpactLiters: true,
        waterBaselineLiters: true,
        waterScarcityImpact: true,
        waterStressIndex: true,
        waterConfidence: true,
        proofHash: true,
        metadata: true,
      },
    })

    if (rows.length === 0) break

    for (const row of rows) {
      const payload = buildDecisionProjectionPayloadFromPersistedDecision(row)
      await prisma.decisionProjectionOutbox.upsert({
        where: {
          sourceCiDecisionId: row.id,
        },
        create: {
          sourceCiDecisionId: row.id,
          decisionFrameId: row.decisionFrameId,
          payload: payload as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
          attemptCount: 0,
          nextAttemptAt: new Date(),
          lastError: null,
          processedAt: null,
        },
        update: {
          decisionFrameId: row.decisionFrameId,
          payload: payload as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
          attemptCount: 0,
          nextAttemptAt: new Date(),
          lastError: null,
          processedAt: null,
        },
      })
      enqueued += 1
    }

    scanned += rows.length
    cursorId = rows[rows.length - 1]?.id
  }

  return {
    scanned,
    enqueued,
    since: input.since.toISOString(),
  }
}
