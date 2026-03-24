import { prisma } from '../db'
import { getWaterPolicyProfile, type WaterPolicyProfileId } from '../methodology'
import { loadWaterBundle, loadWaterManifest } from './bundle'
import type {
  ResolvedWaterSignal,
  WaterComputation,
  WaterEvaluation,
  WaterSignalInput,
} from './types'

export class WaterGuardrailViolationError extends Error {
  code = 'WATER_GUARDRAIL_TRIGGERED' as const
  evaluations: Array<{ region: string; reasonCode: string; waterStressIndex: number | null }>

  constructor(
    evaluations: Array<{ region: string; reasonCode: string; waterStressIndex: number | null }>
  ) {
    super('All candidate regions were blocked by water guardrails or missing required water signals.')
    this.evaluations = evaluations
  }
}

export async function loadLatestWaterSignals(
  regions: string[]
): Promise<Map<string, ResolvedWaterSignal>> {
  if (regions.length === 0) {
    return new Map()
  }

  if (!(prisma as any)?.waterSignal?.findMany) {
    return new Map()
  }

  let rows: Array<any> = []
  try {
    rows = await prisma.waterSignal.findMany({
      where: {
        region: {
          in: regions,
        },
      },
      orderBy: [{ referenceTime: 'desc' }, { createdAt: 'desc' }],
    })
  } catch (error) {
    console.warn('WaterSignal DB lookup failed, falling back to local water bundle:', error)
    return new Map()
  }

  const result = new Map<string, ResolvedWaterSignal>()
  for (const row of rows) {
    if (result.has(row.region)) continue
    result.set(row.region, {
      region: row.region,
      waterIntensityLPerKwh: row.waterIntensityLPerKwh,
      waterStressIndex: row.waterStressIndex,
      waterQualityIndex: row.waterQualityIndex,
      droughtRiskIndex: row.droughtRiskIndex,
      scarcityCfMonthly: row.scarcityCfMonthly,
      scarcityCfAnnual: row.scarcityCfAnnual,
      siteWaterIntensityLPerKwh: row.siteWaterIntensityLPerKwh,
      source: row.source,
      referenceTime: row.referenceTime.toISOString(),
      dataQuality: normalizeWaterQuality(row.dataQuality),
      signalType: normalizeWaterSignalType(row.signalType),
      confidence: row.confidence,
      datasetVersion: row.datasetVersion,
      metadata: asRecord(row.metadata),
    })
  }

  return result
}

export async function resolveWaterSignals(
  regions: string[],
  overrides?: Record<string, WaterSignalInput>
): Promise<Map<string, ResolvedWaterSignal>> {
  const resolved = new Map<string, ResolvedWaterSignal>()

  for (const [region, signal] of Object.entries(overrides ?? {})) {
    resolved.set(region, normalizeWaterSignalInput(signal))
  }

  const unresolvedRegions = regions.filter((region) => !resolved.has(region))
  const latestSignals = await loadLatestWaterSignals(unresolvedRegions)
  for (const [region, signal] of latestSignals.entries()) {
    resolved.set(region, signal)
  }

  const remainingRegions = regions.filter((region) => !resolved.has(region))
  if (remainingRegions.length === 0) {
    return resolved
  }

  const bundle = await loadWaterBundle()
  for (const region of remainingRegions) {
    const bundled = bundle[region]
    if (!bundled) continue

    resolved.set(region, {
      region,
      waterIntensityLPerKwh: bundled.waterIntensityLPerKwh,
      waterStressIndex: bundled.waterStressScore,
      waterQualityIndex: bundled.waterQualityIndex ?? null,
      droughtRiskIndex: bundled.droughtRiskScore ?? null,
      scarcityCfMonthly: resolveMonthlyScarcityFactor(bundled.scarcityFactorMonthly),
      scarcityCfAnnual: bundled.scarcityFactorAnnual ?? null,
      siteWaterIntensityLPerKwh: null,
      source: bundled.sources.join('+'),
      referenceTime: bundled.referenceTime ?? null,
      dataQuality: bundled.dataQuality ?? inferDataQualityFromConfidence(bundled.confidence),
      signalType: normalizeWaterSignalType(bundled.signalType ?? 'scarcity_weighted_operational'),
      confidence: bundled.confidence,
      datasetVersion: Object.values(bundled.datasetVersions).join('|') || null,
      metadata: {
        waterStressRawRatio: bundled.waterStressRawRatio,
        overallWaterRiskScore: bundled.overallWaterRiskScore,
        datasetVersions: bundled.datasetVersions,
        sources: bundled.sources,
        manifestBuiltAt: (await loadWaterManifest())?.built_at ?? null,
        ...(bundled.metadata ?? {}),
      },
    })
  }

  return resolved
}

export async function upsertWaterSignals(inputs: WaterSignalInput[]): Promise<{ upserted: number }> {
  if (!(prisma as any)?.waterSignal?.upsert) {
    throw new Error('WaterSignal persistence is not available in this runtime.')
  }

  let upserted = 0
  for (const input of inputs) {
    const normalized = normalizeWaterSignalInput(input)
    const referenceTime = normalized.referenceTime ? new Date(normalized.referenceTime) : new Date()

    await prisma.waterSignal.upsert({
      where: {
        water_region_reference_source: {
          region: normalized.region,
          referenceTime,
          source: normalized.source,
        },
      },
      update: {
        waterIntensityLPerKwh: normalized.waterIntensityLPerKwh,
        waterStressIndex: normalized.waterStressIndex,
        waterQualityIndex: normalized.waterQualityIndex,
        droughtRiskIndex: normalized.droughtRiskIndex,
        scarcityCfMonthly: normalized.scarcityCfMonthly,
        scarcityCfAnnual: normalized.scarcityCfAnnual,
        siteWaterIntensityLPerKwh: normalized.siteWaterIntensityLPerKwh,
        dataQuality: normalized.dataQuality,
        signalType: normalized.signalType,
        confidence: normalized.confidence,
        datasetVersion: normalized.datasetVersion,
        metadata: normalized.metadata,
      },
      create: {
        region: normalized.region,
        waterIntensityLPerKwh: normalized.waterIntensityLPerKwh,
        waterStressIndex: normalized.waterStressIndex,
        waterQualityIndex: normalized.waterQualityIndex,
        droughtRiskIndex: normalized.droughtRiskIndex,
        scarcityCfMonthly: normalized.scarcityCfMonthly,
        scarcityCfAnnual: normalized.scarcityCfAnnual,
        siteWaterIntensityLPerKwh: normalized.siteWaterIntensityLPerKwh,
        source: normalized.source,
        referenceTime,
        dataQuality: normalized.dataQuality,
        signalType: normalized.signalType,
        confidence: normalized.confidence,
        datasetVersion: normalized.datasetVersion,
        metadata: normalized.metadata,
      },
    })

    upserted += 1
  }

  return { upserted }
}

export function normalizeWaterSignalInput(input: WaterSignalInput): ResolvedWaterSignal {
  return {
    region: input.region,
    waterIntensityLPerKwh: input.waterIntensityLPerKwh,
    waterStressIndex: input.waterStressIndex,
    waterQualityIndex: input.waterQualityIndex ?? null,
    droughtRiskIndex: input.droughtRiskIndex ?? null,
    scarcityCfMonthly: input.scarcityCfMonthly ?? null,
    scarcityCfAnnual: input.scarcityCfAnnual ?? null,
    siteWaterIntensityLPerKwh: input.siteWaterIntensityLPerKwh ?? null,
    source: input.source,
    referenceTime: input.referenceTime ?? null,
    dataQuality: input.dataQuality ?? 'medium',
    signalType: input.signalType ?? 'average_operational',
    confidence: input.confidence ?? null,
    datasetVersion: input.datasetVersion ?? null,
    metadata: input.metadata ?? {},
  }
}

export function computeWaterImpact(
  signal: ResolvedWaterSignal,
  energyEstimateKwh: number
): WaterComputation {
  const totalWaterIntensityLPerKwh =
    signal.waterIntensityLPerKwh + (signal.siteWaterIntensityLPerKwh ?? 0)
  const waterLiters = totalWaterIntensityLPerKwh * energyEstimateKwh
  const scarcityCf = signal.scarcityCfMonthly ?? signal.scarcityCfAnnual ?? 1
  const scarcityWeightedImpact = (waterLiters / 1000) * scarcityCf

  return {
    totalWaterIntensityLPerKwh: round4(totalWaterIntensityLPerKwh),
    waterLiters: round4(waterLiters),
    scarcityWeightedImpact: round4(scarcityWeightedImpact),
  }
}

export function evaluateWaterCandidate(args: {
  region: string
  energyEstimateKwh: number
  criticality: 'critical' | 'standard' | 'deferable'
  profileId?: WaterPolicyProfileId | null
  signal?: ResolvedWaterSignal | null
}): WaterEvaluation {
  const profile = getWaterPolicyProfile(args.profileId)
  const incomingSignal = args.signal ?? null

  if (!incomingSignal) {
    const fallbackSignal = buildConservativeFallbackSignal(args.region, profile.id)
    const fallbackImpact = computeWaterImpact(fallbackSignal, args.energyEstimateKwh)
    const hardBlocked = profile.missingSignalMode === 'fail_closed' && args.criticality !== 'critical'

    return {
      signal: fallbackSignal,
      source: fallbackSignal.source,
      confidence: fallbackSignal.confidence,
      fallbackUsed: true,
      guardrailTriggered: true,
      hardBlocked,
      reasonCode: hardBlocked ? 'WATER_SIGNAL_UNAVAILABLE' : 'WATER_SIGNAL_FALLBACK',
      ...fallbackImpact,
    }
  }

  const computed = computeWaterImpact(incomingSignal, args.energyEstimateKwh)
  const guardrailTriggered =
    incomingSignal.waterStressIndex >= profile.guardrailStressThreshold &&
    computed.scarcityWeightedImpact >= profile.guardrailScarcityThreshold
  const hardBlocked = guardrailTriggered && args.criticality !== 'critical'

  return {
    signal: incomingSignal,
    source: incomingSignal.source,
    confidence: incomingSignal.confidence,
    fallbackUsed: false,
    guardrailTriggered,
    hardBlocked,
    reasonCode: hardBlocked ? 'WATER_GUARDRAIL_TRIGGERED' : null,
    ...computed,
  }
}

function buildConservativeFallbackSignal(
  region: string,
  profileId: WaterPolicyProfileId
): ResolvedWaterSignal {
  const profile = getWaterPolicyProfile(profileId)
  return {
    region,
    waterIntensityLPerKwh: profile.conservativeFallbackIntensityLPerKwh,
    waterStressIndex: 5,
    waterQualityIndex: null,
    droughtRiskIndex: null,
    scarcityCfMonthly: profile.conservativeFallbackScarcityCf,
    scarcityCfAnnual: profile.conservativeFallbackScarcityCf,
    siteWaterIntensityLPerKwh: null,
    source: 'WATER_CONSERVATIVE_FALLBACK',
    referenceTime: null,
    dataQuality: 'low',
    signalType: 'unknown',
    confidence: 0.2,
    datasetVersion: null,
    metadata: {
      fallbackProfile: profileId,
    },
  }
}

function normalizeWaterQuality(value: string): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value
  }
  return 'medium'
}

function normalizeWaterSignalType(value: string): ResolvedWaterSignal['signalType'] {
  if (
    value === 'average_operational' ||
    value === 'scarcity_weighted_operational' ||
    value === 'site_measured'
  ) {
    return value
  }
  return 'unknown'
}

function inferDataQualityFromConfidence(
  confidence: number | null | undefined
): ResolvedWaterSignal['dataQuality'] {
  if (confidence == null) return 'medium'
  if (confidence >= 0.8) return 'high'
  if (confidence >= 0.5) return 'medium'
  return 'low'
}

function resolveMonthlyScarcityFactor(monthly: Record<string, number> | null | undefined): number | null {
  if (!monthly) return null
  const currentMonth = String(new Date().getUTCMonth() + 1).padStart(2, '0')
  return monthly[currentMonth] ?? monthly[String(Number(currentMonth))] ?? null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}
