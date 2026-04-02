import { randomUUID } from 'crypto'

import type { Prisma } from '@prisma/client'

import { prisma } from '../db'
import {
  buildDecisionProjectionPayloadFromPersistedDecision,
  computeCarbonSavingsRatio,
  computeCo2Grams,
  enqueueDecisionProjection,
} from './decision-projection'

type LegacyCanonicalDecisionInput = {
  createdAt?: Date
  decisionFrameId?: string | null
  selectedRunner?: string | null
  workloadName?: string | null
  opName?: string | null
  baselineRegion: string
  chosenRegion: string
  carbonIntensityBaselineGPerKwh: number | null
  carbonIntensityChosenGPerKwh: number | null
  baselineEnergyKwh?: number | null
  chosenEnergyKwh?: number | null
  estimatedKwh?: number | null
  fallbackUsed?: boolean
  lowConfidence?: boolean
  signalConfidence?: number | null
  reason?: string | null
  decisionAction?: string | null
  decisionMode?: string | null
  latencyEstimateMs?: number | null
  latencyActualMs?: number | null
  requestCount?: number
  sourceUsed?: string | null
  validationSource?: string | null
  disagreementFlag?: boolean | null
  disagreementPct?: number | null
  estimatedFlag?: boolean | null
  syntheticFlag?: boolean | null
  balancingAuthority?: string | null
  demandRampPct?: number | null
  carbonSpikeProbability?: number | null
  curtailmentProbability?: number | null
  importCarbonLeakageScore?: number | null
  dataFreshnessSeconds?: number | null
  referenceTime?: Date | null
  preferredRegions?: string[]
  carbonWeight?: number
  metadata?: Record<string, unknown>
  jobType?: string
}

type CarbonDataQuality = 'EXACT' | 'DERIVED' | 'INCOMPLETE'

function sanitizePositiveNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return Number(value.toFixed(6))
}

function sanitizeIntensity(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0 || value > 2000) return null
  return Number(value.toFixed(6))
}

function deriveCarbonDataQuality(input: {
  baselineEnergyKwh: number | null
  chosenEnergyKwh: number | null
  estimatedKwh: number | null
}): CarbonDataQuality {
  const explicitPair = input.baselineEnergyKwh !== null && input.chosenEnergyKwh !== null
  if (explicitPair && input.estimatedKwh == null) return 'EXACT'
  if (explicitPair) return 'DERIVED'
  return 'INCOMPLETE'
}

export async function persistLegacyCanonicalDecision(input: LegacyCanonicalDecisionInput) {
  const baselineIntensity = sanitizeIntensity(input.carbonIntensityBaselineGPerKwh)
  const chosenIntensity = sanitizeIntensity(input.carbonIntensityChosenGPerKwh)
  const sharedEstimatedKwh = sanitizePositiveNumber(input.estimatedKwh)
  const baselineEnergyKwh = sanitizePositiveNumber(input.baselineEnergyKwh) ?? sharedEstimatedKwh
  const chosenEnergyKwh = sanitizePositiveNumber(input.chosenEnergyKwh) ?? sharedEstimatedKwh
  const carbonDataQuality = deriveCarbonDataQuality({
    baselineEnergyKwh,
    chosenEnergyKwh,
    estimatedKwh: sharedEstimatedKwh,
  })
  const baselineCo2G = computeCo2Grams(baselineIntensity, baselineEnergyKwh)
  const chosenCo2G = computeCo2Grams(chosenIntensity, chosenEnergyKwh)
  const co2DeltaG =
    baselineCo2G !== null && chosenCo2G !== null
      ? Number((baselineCo2G - chosenCo2G).toFixed(6))
      : null
  const carbonSavingsRatio = computeCarbonSavingsRatio(baselineIntensity, chosenIntensity)
  const decisionFrameId = input.decisionFrameId?.trim() || randomUUID()
  const createdAt = input.createdAt ?? new Date()
  const metadata = {
    ...(input.metadata ?? {}),
    legacyIngress: {
      source: input.selectedRunner ?? 'legacy-admin-ingest',
      baselineEnergyKwh,
      chosenEnergyKwh,
      estimatedKwh: sharedEstimatedKwh,
      carbonDataQuality,
    },
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const persisted = await tx.cIDecision.create({
      data: {
        decisionFrameId,
        selectedRunner: input.selectedRunner?.trim() || 'legacy-admin-ingest',
        baselineRegion: input.baselineRegion,
        selectedRegion: input.chosenRegion,
        carbonIntensity: chosenIntensity ?? 0,
        baseline: baselineIntensity ?? 0,
        savings: carbonSavingsRatio != null ? Number((carbonSavingsRatio * 100).toFixed(6)) : 0,
        carbonSavingsRatio,
        baselineEnergyKwh,
        chosenEnergyKwh,
        estimatedKwh: sharedEstimatedKwh,
        baselineCo2G,
        chosenCo2G,
        co2DeltaG,
        carbonDataQuality,
        jobType: input.jobType ?? 'legacy',
        preferredRegions: input.preferredRegions ?? [input.baselineRegion, input.chosenRegion],
        carbonWeight: input.carbonWeight ?? 1,
        recommendation: input.reason ?? 'Legacy ingress decision recorded',
        decisionAction: input.decisionAction ?? 'run_now',
        decisionMode: input.decisionMode ?? 'scenario_planning',
        reasonCode: input.reason ?? 'LEGACY_INGEST',
        signalConfidence: input.signalConfidence ?? null,
        fallbackUsed: Boolean(input.fallbackUsed),
        lowConfidence: Boolean(input.lowConfidence),
        proofHash: null,
        metadata,
        createdAt,
      },
    })

    await enqueueDecisionProjection(
      tx,
      buildDecisionProjectionPayloadFromPersistedDecision(persisted)
    )

    return persisted
  })
}
