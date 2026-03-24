import { randomUUID } from 'crypto'

import { mapRegionToWattTimeRegion, providerRouter } from './carbon/provider-router'
import { prisma } from './db'
import { generateLease, retryAsync } from './governance'
import { GridSignalAudit } from './grid-signals/grid-signal-audit'
import { GridSignalCache } from './grid-signals/grid-signal-cache'
import {
  ASSURANCE_DISAGREEMENT_THRESHOLD_PCT,
  DEFAULT_ROUTING_WEIGHTS,
  LOWEST_DEFENSIBLE_SIGNAL_DOCTRINE,
  ROUTING_LEGAL_DISCLAIMER,
  getPolicyModeDefinition,
  inferSignalType,
  normalizeRoutingWeights,
  resolvePolicyMode,
  resolveRoutingMode,
  type PolicyMode,
  type RoutingMode,
  type RoutingWeightSet,
  type SignalType,
  type WaterPolicyProfileId,
} from './methodology'
import {
  CarbonBudgetViolationError,
  classifyJob,
  evaluateOrgCarbonBudgets,
  recordLedgerEntry,
  storeProviderSnapshot,
} from './routing'
import { wattTime } from './watttime'
import {
  WaterGuardrailViolationError,
  evaluateWaterCandidate,
  resolveWaterSignals,
} from './water/signals'
import type { WaterEvaluation, WaterSignalInput } from './water/types'

export interface RoutingRequest {
  preferredRegions: string[]
  maxCarbonGPerKwh?: number
  latencyMsByRegion?: Record<string, number>
  costIndexByRegion?: Record<string, number>
  costWeight?: number
  carbonWeight?: number
  waterWeight?: number
  latencyWeight?: number
  mode?: RoutingMode
  policyMode?: PolicyMode
  targetTime?: string
  durationMinutes?: number
  orgId?: string
  workloadType?: string
  workloadName?: string
  energyEstimateKwh?: number
  criticality?: 'critical' | 'standard' | 'deferable'
  waterPolicyProfile?: WaterPolicyProfileId
  waterSignalsByRegion?: Record<string, WaterSignalInput>
}

export interface RoutingResult {
  selectedRegion: string
  carbonIntensity: number
  estimatedLatency?: number
  score: number
  qualityTier: 'high' | 'medium' | 'low'
  carbon_delta_g_per_kwh: number | null
  forecast_stability: 'stable' | 'medium' | 'unstable' | null
  provider_disagreement: { flag: boolean; pct: number | null }
  balancingAuthority: string | null
  demandRampPct: number | null
  carbonSpikeProbability: number | null
  curtailmentProbability: number | null
  importCarbonLeakageScore: number | null
  source_used: string | null
  validation_source: string | null
  fallback_used: boolean | null
  estimatedFlag: boolean | null
  syntheticFlag: boolean | null
  predicted_clean_window: object | null
  decisionFrameId: string | null
  alternatives: Array<{
    region: string
    carbonIntensity: number
    score: number
    reason?: string
  }>
  evaluatedCandidates?: Array<{
    region: string
    carbonIntensity: number
    effectiveCarbonIntensity?: number
    estimatedLatency?: number
    costIndex?: number
    waterLiters?: number | null
    waterScarcityImpact?: number | null
    waterStressIndex?: number | null
    waterIntensityLPerKwh?: number | null
    waterConfidence?: number | null
    waterGuardrailTriggered?: boolean
    score: number
  }>
  lease_id?: string
  lease_expires_at?: string
  must_revalidate_after?: string
  explanation?: string
  forecastAvailable?: boolean
  confidenceBand?: { low: number; mid: number; high: number; empirical: boolean }
  dataResolutionMinutes?: number
  weights: RoutingWeightSet
  legalDisclaimer: string
  doctrine: string
  mode: RoutingMode
  policyMode: PolicyMode
  signalTypeUsed: SignalType
  water: {
    policyProfile: WaterPolicyProfileId
    selectedWaterLiters: number | null
    baselineWaterLiters: number | null
    selectedWaterScarcityImpact: number | null
    baselineWaterScarcityImpact: number | null
    selectedWaterIntensityLPerKwh: number | null
    baselineWaterIntensityLPerKwh: number | null
    waterStressIndex: number | null
    waterQualityIndex: number | null
    droughtRiskIndex: number | null
    confidence: number | null
    source: string | null
    signalType: string | null
    datasetVersion: string | null
    fallbackUsed: boolean
    guardrailTriggered: boolean
    referenceTime: string | null
  }
  assurance: {
    enabled: boolean
    disagreementThresholdPct: number
    confidenceLabel: 'high' | 'medium' | 'low'
    conservativeAccounting: boolean
    accountingIntensityGPerKwh?: number
    reason?: string
  }
  budgetStatus?: Awaited<ReturnType<typeof evaluateOrgCarbonBudgets>>
}

type RegionCandidate = {
  region: string
  carbonIntensity: number
  effectiveCarbonIntensity: number
  latency: number
  costIndex: number
  signal: any
  signalTypeUsed: SignalType
  waterEvaluation: WaterEvaluation
}

export async function routeGreen(request: RoutingRequest): Promise<RoutingResult> {
  const {
    preferredRegions,
    maxCarbonGPerKwh,
    latencyMsByRegion = {},
    costIndexByRegion = {},
    carbonWeight = DEFAULT_ROUTING_WEIGHTS.carbon,
    waterWeight = DEFAULT_ROUTING_WEIGHTS.water,
    latencyWeight = DEFAULT_ROUTING_WEIGHTS.latency,
    costWeight = DEFAULT_ROUTING_WEIGHTS.cost,
    mode,
    policyMode,
    targetTime,
    durationMinutes,
    orgId,
    workloadType,
    workloadName,
    energyEstimateKwh = 0.05,
    criticality = 'standard',
    waterPolicyProfile = 'default',
    waterSignalsByRegion,
  } = request

  if (preferredRegions.length === 0) {
    throw new Error('At least one preferred region is required')
  }

  const normalizedWeights = normalizeRoutingWeights({
    carbon: carbonWeight,
    water: waterWeight,
    latency: latencyWeight,
    cost: costWeight,
  })
  const appliedMode = resolveRoutingMode(mode, policyMode)
  const appliedPolicyMode = resolvePolicyMode(policyMode, appliedMode)
  const policyDefinition = getPolicyModeDefinition(appliedPolicyMode)
  const assuranceEnabled = appliedMode === 'assurance'
  const resolvedWaterSignals = await resolveWaterSignals(preferredRegions, waterSignalsByRegion)

  const regionSignals = new Map<string, any>()
  const regionData: RegionCandidate[] = await Promise.all(
    preferredRegions.map(async (region) => {
      const waterEvaluation = evaluateWaterCandidate({
        region,
        energyEstimateKwh,
        criticality,
        profileId: waterPolicyProfile,
        signal: resolvedWaterSignals.get(region) ?? null,
      })

      try {
        const signal = await providerRouter.getRoutingSignal(region, new Date(), {
          allowedSignalTypes: assuranceEnabled ? policyDefinition.preferredSignalTypes : undefined,
        })
        regionSignals.set(region, signal)

        return {
          region,
          carbonIntensity: signal.carbonIntensity,
          effectiveCarbonIntensity: computeEffectiveCarbonIntensity(
            signal.carbonIntensity,
            signal,
            appliedMode
          ),
          latency: latencyMsByRegion[region] ?? 100,
          costIndex: costIndexByRegion[region] ?? 1,
          signal,
          signalTypeUsed: inferSignalType(signal.provenance?.sourceUsed ?? null),
          waterEvaluation,
        }
      } catch (error) {
        console.error(`Failed to get routing signal for ${region}:`, error)
        return {
          region,
          carbonIntensity: 400,
          effectiveCarbonIntensity: computeEffectiveCarbonIntensity(400, null, appliedMode),
          latency: latencyMsByRegion[region] ?? 100,
          costIndex: costIndexByRegion[region] ?? 1,
          signal: null,
          signalTypeUsed: 'unknown' as SignalType,
          waterEvaluation,
        }
      }
    })
  )

  const feasibleByWater = regionData.filter((candidate) => !candidate.waterEvaluation.hardBlocked)
  if (feasibleByWater.length === 0) {
    throw new WaterGuardrailViolationError(
      regionData.map((candidate) => ({
        region: candidate.region,
        reasonCode: candidate.waterEvaluation.reasonCode ?? 'WATER_GUARDRAIL_TRIGGERED',
        waterStressIndex: candidate.waterEvaluation.signal?.waterStressIndex ?? null,
      }))
    )
  }

  const filtered = maxCarbonGPerKwh
    ? feasibleByWater.filter((candidate) => candidate.carbonIntensity <= maxCarbonGPerKwh)
    : feasibleByWater

  if (filtered.length === 0) {
    const sorted = [...feasibleByWater].sort(
      (left, right) => left.effectiveCarbonIntensity - right.effectiveCarbonIntensity
    )
    const best = sorted[0]
    const baselineWaterEvaluation = sorted[sorted.length - 1]?.waterEvaluation ?? best.waterEvaluation

    return {
      selectedRegion: best.region,
      carbonIntensity: best.carbonIntensity,
      estimatedLatency: best.latency,
      score: 0,
      qualityTier: 'low',
      carbon_delta_g_per_kwh: null,
      forecast_stability: null,
      provider_disagreement: { flag: false, pct: null },
      balancingAuthority: null,
      demandRampPct: null,
      carbonSpikeProbability: null,
      curtailmentProbability: null,
      importCarbonLeakageScore: null,
      source_used: null,
      validation_source: null,
      fallback_used: null,
      estimatedFlag: null,
      syntheticFlag: null,
      predicted_clean_window: null,
      decisionFrameId: randomUUID(),
      weights: normalizedWeights,
      legalDisclaimer: ROUTING_LEGAL_DISCLAIMER,
      doctrine: LOWEST_DEFENSIBLE_SIGNAL_DOCTRINE,
      mode: appliedMode,
      policyMode: appliedPolicyMode,
      signalTypeUsed: best.signalTypeUsed,
      water: buildWaterResult(best.waterEvaluation, baselineWaterEvaluation, waterPolicyProfile),
      assurance: {
        enabled: assuranceEnabled,
        disagreementThresholdPct: ASSURANCE_DISAGREEMENT_THRESHOLD_PCT,
        confidenceLabel: 'low',
        conservativeAccounting: assuranceEnabled,
        accountingIntensityGPerKwh: Math.round(best.effectiveCarbonIntensity),
        reason: assuranceEnabled
          ? `Policy ${appliedPolicyMode} allows ${policyDefinition.preferredSignalTypes.join(', ')} only.`
          : undefined,
      },
      alternatives: sorted.slice(1, 3).map((candidate) => ({
        region: candidate.region,
        carbonIntensity: candidate.carbonIntensity,
        score: 0,
        reason: `Exceeds carbon budget (${maxCarbonGPerKwh} gCO2/kWh)`,
      })),
      evaluatedCandidates: sorted.map((candidate) => ({
        region: candidate.region,
        carbonIntensity: candidate.carbonIntensity,
        effectiveCarbonIntensity: candidate.effectiveCarbonIntensity,
        estimatedLatency: candidate.latency,
        costIndex: candidate.costIndex,
        waterLiters: candidate.waterEvaluation.waterLiters,
        waterScarcityImpact: candidate.waterEvaluation.scarcityWeightedImpact,
        waterStressIndex: candidate.waterEvaluation.signal?.waterStressIndex ?? null,
        waterIntensityLPerKwh: candidate.waterEvaluation.totalWaterIntensityLPerKwh,
        waterConfidence: candidate.waterEvaluation.confidence,
        waterGuardrailTriggered: candidate.waterEvaluation.guardrailTriggered,
        score: 0,
      })),
    }
  }

  const maxCarbon = Math.max(...filtered.map((candidate) => candidate.effectiveCarbonIntensity))
  const maxLatency = Math.max(...filtered.map((candidate) => candidate.latency))
  const maxCost = Math.max(...filtered.map((candidate) => candidate.costIndex))
  const minCost = Math.min(...filtered.map((candidate) => candidate.costIndex))
  const maxWaterScarcity = Math.max(
    ...filtered.map((candidate) => candidate.waterEvaluation.scarcityWeightedImpact)
  )

  const scored = filtered.map((candidate) => {
    const carbonScore =
      maxCarbon === 0 ? 1 : 1 - candidate.effectiveCarbonIntensity / maxCarbon
    const latencyScore = maxLatency === 0 ? 1 : 1 - candidate.latency / maxLatency
    const costScore =
      maxCost === minCost ? 1 : 1 - (candidate.costIndex - minCost) / (maxCost - minCost)
    const waterScore =
      maxWaterScarcity === 0
        ? 1
        : 1 - candidate.waterEvaluation.scarcityWeightedImpact / maxWaterScarcity
    const adjustedWaterScore = candidate.waterEvaluation.guardrailTriggered
      ? Math.min(waterScore, 0.05)
      : waterScore

    const score =
      normalizedWeights.carbon * carbonScore +
      normalizedWeights.water * adjustedWaterScore +
      normalizedWeights.latency * latencyScore +
      normalizedWeights.cost * costScore

    return {
      ...candidate,
      score,
      carbonScore,
      waterScore: adjustedWaterScore,
      latencyScore,
      costScore,
    }
  })

  scored.sort((left, right) => right.score - left.score)

  const best = scored[0]
  const bestSignal = regionSignals.get(best.region)
  const signalTypeUsed =
    best.signalTypeUsed ?? inferSignalType(bestSignal?.provenance?.sourceUsed ?? null)
  const gridSnapshot = await getLatestGridSnapshot(best.region)
  const cleanWindows = await getCleanWindowSafe(best.region)
  const worstIntensity = Math.max(...scored.map((candidate) => candidate.carbonIntensity))

  let qualityTier: 'high' | 'medium' | 'low' = 'low'
  if (bestSignal) {
    try {
      const validation = await providerRouter.validateSignalQuality(bestSignal)
      qualityTier = validation.qualityTier
    } catch {
      qualityTier =
        bestSignal.confidence >= 0.8
          ? 'high'
          : bestSignal.confidence >= 0.5
            ? 'medium'
            : 'low'
    }
  }

  const forecastStability = bestSignal
    ? deriveStability(bestSignal.confidence, {
        flag: bestSignal.provenance.disagreementFlag,
        pct: bestSignal.provenance.disagreementPct,
      })
    : null
  const confidenceLabel = deriveConfidenceLabel(
    qualityTier,
    bestSignal?.provenance.disagreementPct ?? 0
  )
  const accountingIntensity = assuranceEnabled
    ? Math.round(best.effectiveCarbonIntensity)
    : Math.round(best.carbonIntensity)
  const baselineAccountingIntensity = assuranceEnabled
    ? Math.round((scored[scored.length - 1] ?? best).effectiveCarbonIntensity)
    : Math.round((scored[scored.length - 1] ?? best).carbonIntensity)
  const baselineWaterEvaluation = (scored[scored.length - 1] ?? best).waterEvaluation
  const assuranceReason = assuranceEnabled
    ? `Policy ${appliedPolicyMode} restricted routing to ${policyDefinition.preferredSignalTypes.join(', ')}.`
    : undefined
  const confidenceBand = bestSignal
    ? deriveConfidenceBand(
        best.carbonIntensity,
        bestSignal.confidence,
        bestSignal.provenance.disagreementPct ?? 0
      )
    : deriveConfidenceBand(best.carbonIntensity, 0.25, 0)
  const dataFreshnessSeconds = bestSignal
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(bestSignal.provenance.fetchedAt).getTime()) / 1000)
      )
    : null
  const decisionFrameId = randomUUID()

  const lease = generateLease(qualityTier, decisionFrameId)
  const {
    lease_id: leaseId,
    lease_expires_at: leaseExpiresAt,
    must_revalidate_after: mustRevalidateAfter,
    leaseMinutes,
  } = lease

  const governanceWarnings: string[] = []
  if (qualityTier === 'low' && bestSignal?.provenance.fallbackUsed) {
    governanceWarnings.push(
      'LOW_QUALITY_FALLBACK: Decision based on static fallback data, not live provider signals.'
    )
  }
  if (bestSignal?.provenance.disagreementFlag && (bestSignal.provenance.disagreementPct ?? 0) > 25) {
    governanceWarnings.push(
      `HIGH_DISAGREEMENT: Provider signals diverge by ${bestSignal.provenance.disagreementPct?.toFixed(1)}%. Decision confidence reduced.`
    )
  }
  if (assuranceEnabled && !policyDefinition.preferredSignalTypes.includes(signalTypeUsed)) {
    governanceWarnings.push(
      `ASSURANCE_MODE_SIGNAL_CLASS: Assurance mode selected ${signalTypeUsed}; review policy ${appliedPolicyMode} and provider configuration.`
    )
  }
  if (forecastStability === 'unstable') {
    governanceWarnings.push(
      'UNSTABLE_FORECAST: Grid conditions are volatile. Recommend shorter execution windows.'
    )
  }
  if (best.waterEvaluation.guardrailTriggered) {
    governanceWarnings.push(
      `WATER_GUARDRAIL_ACTIVE: Selected region ${best.region} remains permissible only because workload criticality is ${criticality}.`
    )
  }

  if (bestSignal) {
    retryAsync(
      () => providerRouter.recordSignalProvenance(bestSignal, decisionFrameId),
      'signal-provenance'
    )

    retryAsync(
      () =>
        GridSignalAudit.recordRoutingDecision(
          decisionFrameId,
          best.region,
          {
            balancingAuthority: gridSnapshot?.balancingAuthority ?? null,
            demandRampPct: gridSnapshot?.demandChangePct ?? null,
            carbonSpikeProbability: gridSnapshot?.carbonSpikeProbability ?? null,
            curtailmentProbability: gridSnapshot?.curtailmentProbability ?? null,
            importCarbonLeakageScore: gridSnapshot?.importCarbonLeakageScore ?? null,
            signalQuality: qualityTier,
            estimatedFlag: bestSignal.isForecast,
            syntheticFlag: bestSignal.source === 'fallback',
          },
          {
            sourceUsed: bestSignal.provenance.sourceUsed,
            validationSource:
              bestSignal.provenance.contributingSources.length > 1 ? 'ember' : undefined,
            referenceTime: bestSignal.provenance.referenceTime,
            fetchedAt: bestSignal.provenance.fetchedAt,
            fallbackUsed: bestSignal.provenance.fallbackUsed,
            disagreementFlag: bestSignal.provenance.disagreementFlag,
            disagreementPct: bestSignal.provenance.disagreementPct,
          }
        ),
      'grid-signal-audit'
    )
  }

  const classification = classifyJob({
    executionMode: 'immediate',
    latencySlaMs: best.latency,
  })
  const candidateStartTs = targetTime ? new Date(targetTime) : new Date()
  const scoringCandidates = scored.map((candidate, index) => ({
    candidateId: `candidate-${index + 1}`,
    region: candidate.region,
    startTs: candidateStartTs,
    carbonEstimateGPerKwh: assuranceEnabled
      ? Math.round(candidate.effectiveCarbonIntensity)
      : candidate.carbonIntensity,
    latencyEstimateMs: candidate.latency,
    queueDelayEstimateSec: null,
    costEstimateUsd: null,
    confidenceScore: candidate.signal?.confidence ?? null,
    retryRiskScore: null,
    waterEstimateLiters: candidate.waterEvaluation.waterLiters,
    waterScarcityImpact: candidate.waterEvaluation.scarcityWeightedImpact,
    waterStressIndex: candidate.waterEvaluation.signal?.waterStressIndex ?? null,
    waterIntensityLPerKwh: candidate.waterEvaluation.totalWaterIntensityLPerKwh,
    waterConfidenceScore: candidate.waterEvaluation.confidence,
    balancingAuthority:
      candidate.region === best.region ? gridSnapshot?.balancingAuthority ?? null : null,
    demandRampPct: candidate.region === best.region ? gridSnapshot?.demandChangePct ?? null : null,
    carbonSpikeProbability:
      candidate.region === best.region ? gridSnapshot?.carbonSpikeProbability ?? null : null,
    curtailmentProbability:
      candidate.region === best.region ? gridSnapshot?.curtailmentProbability ?? null : null,
    importCarbonLeakageScore:
      candidate.region === best.region ? gridSnapshot?.importCarbonLeakageScore ?? null : null,
    estimatedFlag: candidate.signal?.isForecast ?? false,
    syntheticFlag: candidate.signal?.source === 'fallback',
    carbonScore: candidate.carbonScore,
    waterScore: candidate.waterScore,
    latencyScore: candidate.latencyScore,
    costScore: candidate.costScore,
    queueScore: null,
    uncertaintyScore: null,
    rankScore: candidate.score,
    isFeasible: true,
    rejectionReason: candidate.waterEvaluation.hardBlocked
      ? candidate.waterEvaluation.reasonCode
      : null,
    waterGuardrailTriggered: candidate.waterEvaluation.guardrailTriggered,
  }))
  const selectedCandidate = scoringCandidates[0]!
  const fallbackCandidate = scoringCandidates[1] ?? null
  const baselineCandidateRecord =
    scoringCandidates[scoringCandidates.length - 1] ?? selectedCandidate

  const budgetStatus = orgId
    ? await evaluateOrgCarbonBudgets(orgId, {
        workloadType: workloadType ?? null,
        projected: {
          workloadType: workloadType ?? null,
          chosenCarbonG: accountingIntensity * energyEstimateKwh,
          baselineCarbonG: baselineAccountingIntensity * energyEstimateKwh,
          lowerHalfQualified: null,
        },
      })
    : []
  const hardBudgetViolations = budgetStatus.filter((evaluation) => evaluation.hardStopTriggered)

  if (hardBudgetViolations.length > 0) {
    throw new CarbonBudgetViolationError(hardBudgetViolations)
  }

  retryAsync(
    () =>
      recordLedgerEntry({
        orgId: orgId ?? 'system',
        decisionFrameId,
        classification,
        workloadType: workloadType ?? undefined,
        energyEstimateKwh,
        baselineRegion: scored[scored.length - 1]?.region ?? best.region,
        sourceUsed: bestSignal?.provenance.sourceUsed ?? null,
        validationSource:
          (bestSignal?.provenance.contributingSources.length ?? 0) > 1 ? 'ember' : undefined,
        fallbackUsed: bestSignal?.provenance.fallbackUsed ?? false,
        estimatedFlag: bestSignal?.isForecast ?? false,
        syntheticFlag: bestSignal?.source === 'fallback',
        confidenceLabel,
        routingMode: appliedMode,
        policyMode: appliedPolicyMode,
        signalTypeUsed,
        referenceTime: bestSignal?.provenance.referenceTime
          ? new Date(bestSignal.provenance.referenceTime)
          : null,
        dataFreshnessSeconds,
        confidenceBand,
        forecastStability,
        disagreementFlag: bestSignal?.provenance.disagreementFlag ?? false,
        disagreementPct: bestSignal?.provenance.disagreementPct ?? null,
        waterPolicyProfile,
        metadata: {
          doctrine: LOWEST_DEFENSIBLE_SIGNAL_DOCTRINE,
          legalDisclaimer: ROUTING_LEGAL_DISCLAIMER,
          leaseId,
          leaseExpiresAt,
          mustRevalidateAfter,
          workloadName: workloadName ?? null,
          budgetStatus,
          water: {
            policyProfile: waterPolicyProfile,
            source: best.waterEvaluation.source,
            signalType: best.waterEvaluation.signal?.signalType ?? null,
            datasetVersion: best.waterEvaluation.signal?.datasetVersion ?? null,
            fallbackUsed: best.waterEvaluation.fallbackUsed,
            referenceTime: best.waterEvaluation.signal?.referenceTime ?? null,
            waterQualityIndex: best.waterEvaluation.signal?.waterQualityIndex ?? null,
            droughtRiskIndex: best.waterEvaluation.signal?.droughtRiskIndex ?? null,
          },
        },
        scoringResult: {
          candidates: scoringCandidates,
          selected: selectedCandidate,
          fallback: fallbackCandidate,
          baselineCandidate: baselineCandidateRecord,
          totalEvaluated: scored.length,
          totalFeasible: filtered.length,
        },
      }),
    'carbon-ledger'
  )

  if (bestSignal) {
    retryAsync(
      () =>
        storeProviderSnapshot({
          provider: bestSignal.provenance.sourceUsed ?? 'unknown',
          zone: best.region,
          signalType: 'intensity',
          signalValue: best.carbonIntensity,
          observedAt: new Date(bestSignal.provenance.fetchedAt),
          freshnessSec: Math.floor(
            (Date.now() - new Date(bestSignal.provenance.fetchedAt).getTime()) / 1000
          ),
          confidence: bestSignal.confidence,
        }),
      'provider-snapshot'
    )
  }

  const baselineCandidate = scored[scored.length - 1] ?? best
  const baselineIntensity = baselineAccountingIntensity
  const chosenIntensity = accountingIntensity
  const reason =
    governanceWarnings.length > 0
      ? `${governanceWarnings.join(' | ')} ${LOWEST_DEFENSIBLE_SIGNAL_DOCTRINE}`
      : `Routed to ${best.region} with ${qualityTier} confidence under the lowest defensible signal doctrine. Lease valid for ${leaseMinutes}m.`

  if ((prisma as any)?.dashboardRoutingDecision?.create) {
    await prisma.dashboardRoutingDecision.create({
      data: {
        workloadName: workloadName ?? null,
        opName: workloadType ?? 'route-green',
        baselineRegion: baselineCandidate.region,
        chosenRegion: best.region,
        zoneBaseline: baselineCandidate.region,
        zoneChosen: best.region,
        carbonIntensityBaselineGPerKwh: baselineIntensity,
        carbonIntensityChosenGPerKwh: chosenIntensity,
        estimatedKwh: energyEstimateKwh,
        co2BaselineG: baselineIntensity * energyEstimateKwh,
        co2ChosenG: chosenIntensity * energyEstimateKwh,
        reason,
        latencyEstimateMs: Math.round(best.latency),
        fallbackUsed: bestSignal?.provenance.fallbackUsed ?? false,
        balancingAuthority: gridSnapshot?.balancingAuthority ?? null,
        demandRampPct: gridSnapshot?.demandChangePct ?? null,
        carbonSpikeProbability: gridSnapshot?.carbonSpikeProbability ?? null,
        curtailmentProbability: gridSnapshot?.curtailmentProbability ?? null,
        importCarbonLeakageScore: gridSnapshot?.importCarbonLeakageScore ?? null,
        sourceUsed: bestSignal?.provenance.sourceUsed ?? null,
        validationSource:
          (bestSignal?.provenance.contributingSources.length ?? 0) > 1 ? 'ember' : null,
        referenceTime: bestSignal?.provenance.referenceTime
          ? new Date(bestSignal.provenance.referenceTime)
          : null,
        disagreementFlag: bestSignal?.provenance.disagreementFlag ?? false,
        disagreementPct: bestSignal?.provenance.disagreementPct ?? null,
        estimatedFlag: bestSignal?.isForecast ?? false,
        syntheticFlag: bestSignal?.source === 'fallback',
        meta: {
          decisionFrameId,
          leaseId,
          leaseExpiresAt,
          mustRevalidateAfter,
          qualityTier,
          confidenceLabel,
          forecast_stability: forecastStability,
          score: best.score,
          source: bestSignal?.provenance.sourceUsed ?? null,
          mode: appliedMode,
          policyMode: appliedPolicyMode,
          signalTypeUsed,
          water: buildWaterResult(best.waterEvaluation, baselineWaterEvaluation, waterPolicyProfile),
          weights: normalizedWeights,
          targetTime: targetTime ?? null,
          durationMinutes: durationMinutes ?? null,
          orgId: orgId ?? null,
          workloadType: workloadType ?? null,
          workloadName: workloadName ?? null,
          energyEstimateKwh,
          budgetStatus,
          alternatives: scored.slice(1, 3).map((candidate) => ({
            region: candidate.region,
            carbonIntensity: candidate.carbonIntensity,
            waterLiters: candidate.waterEvaluation.waterLiters,
            waterScarcityImpact: candidate.waterEvaluation.scarcityWeightedImpact,
            score: candidate.score,
          })),
          dataResolutionMinutes: bestSignal?.isForecast ? 60 : 5,
          confidenceBand,
          assurance: {
            enabled: assuranceEnabled,
            disagreementThresholdPct: ASSURANCE_DISAGREEMENT_THRESHOLD_PCT,
            confidenceLabel,
            conservativeAccounting: assuranceEnabled,
            accountingIntensityGPerKwh: accountingIntensity,
            reason: assuranceReason,
          },
          doctrine: LOWEST_DEFENSIBLE_SIGNAL_DOCTRINE,
          legalDisclaimer: ROUTING_LEGAL_DISCLAIMER,
        },
      },
    })
  }

  return {
    selectedRegion: best.region,
    carbonIntensity: best.carbonIntensity,
    estimatedLatency: best.latency,
    score: best.score,
    qualityTier,
    carbon_delta_g_per_kwh: scored.length > 1 ? worstIntensity - best.carbonIntensity : null,
    forecast_stability: forecastStability,
    provider_disagreement: bestSignal
      ? {
          flag: bestSignal.provenance.disagreementFlag,
          pct: bestSignal.provenance.disagreementPct,
        }
      : { flag: false, pct: null },
    balancingAuthority: gridSnapshot?.balancingAuthority ?? null,
    demandRampPct: gridSnapshot?.demandChangePct ?? null,
    carbonSpikeProbability: gridSnapshot?.carbonSpikeProbability ?? null,
    curtailmentProbability: gridSnapshot?.curtailmentProbability ?? null,
    importCarbonLeakageScore: gridSnapshot?.importCarbonLeakageScore ?? null,
    source_used: bestSignal?.provenance.sourceUsed ?? null,
    validation_source:
      (bestSignal?.provenance.contributingSources.length ?? 0) > 1 ? 'ember' : null,
    fallback_used: bestSignal?.provenance.fallbackUsed ?? null,
    estimatedFlag: bestSignal?.isForecast ?? null,
    syntheticFlag: bestSignal?.source === 'fallback' || null,
    predicted_clean_window: cleanWindows?.[0] ?? null,
    decisionFrameId,
    lease_id: leaseId,
    lease_expires_at: leaseExpiresAt,
    must_revalidate_after: mustRevalidateAfter,
    explanation: reason,
    alternatives: scored.slice(1, 3).map((candidate) => ({
      region: candidate.region,
      carbonIntensity: candidate.carbonIntensity,
      score: candidate.score,
    })),
    evaluatedCandidates: scored.map((candidate) => ({
      region: candidate.region,
      carbonIntensity: candidate.carbonIntensity,
      effectiveCarbonIntensity: candidate.effectiveCarbonIntensity,
      estimatedLatency: candidate.latency,
      costIndex: candidate.costIndex,
      waterLiters: candidate.waterEvaluation.waterLiters,
      waterScarcityImpact: candidate.waterEvaluation.scarcityWeightedImpact,
      waterStressIndex: candidate.waterEvaluation.signal?.waterStressIndex ?? null,
      waterIntensityLPerKwh: candidate.waterEvaluation.totalWaterIntensityLPerKwh,
      waterConfidence: candidate.waterEvaluation.confidence,
      waterGuardrailTriggered: candidate.waterEvaluation.guardrailTriggered,
      score: candidate.score,
    })),
    confidenceBand,
    dataResolutionMinutes: bestSignal?.isForecast ? 60 : 5,
    weights: normalizedWeights,
    legalDisclaimer: ROUTING_LEGAL_DISCLAIMER,
    doctrine: LOWEST_DEFENSIBLE_SIGNAL_DOCTRINE,
    mode: appliedMode,
    policyMode: appliedPolicyMode,
    signalTypeUsed,
    water: buildWaterResult(best.waterEvaluation, baselineWaterEvaluation, waterPolicyProfile),
    budgetStatus,
    assurance: {
      enabled: assuranceEnabled,
      disagreementThresholdPct: ASSURANCE_DISAGREEMENT_THRESHOLD_PCT,
      confidenceLabel,
      conservativeAccounting: assuranceEnabled,
      accountingIntensityGPerKwh: accountingIntensity,
      reason: assuranceReason,
    },
  }
}

async function getLatestGridSnapshot(region: string) {
  try {
    const cached = await GridSignalCache.getCachedSnapshots(region)
    return cached?.[0] ?? null
  } catch {
    return null
  }
}

async function getCleanWindowSafe(region: string) {
  try {
    const wattTimeRegion = mapRegionToWattTimeRegion(region)
    if (!wattTimeRegion) return null
    return await wattTime.getPredictedCleanWindows(wattTimeRegion)
  } catch {
    return null
  }
}

function deriveStability(
  confidence: number,
  providerDisagreement?: { flag: boolean; pct: number | null }
): 'stable' | 'medium' | 'unstable' {
  let score = confidence * 100

  if (providerDisagreement?.flag) {
    const pct = providerDisagreement.pct ?? 15
    score -= pct * 0.5
  }

  if (score >= 75) return 'stable'
  if (score >= 45) return 'medium'
  return 'unstable'
}

function deriveConfidenceBand(
  carbonIntensity: number,
  confidence: number,
  disagreementPct: number
): { low: number; mid: number; high: number; empirical: boolean } {
  const disagreementSpread = Math.max(0, disagreementPct / 100)
  const confidenceSpread = Math.max(0.06, (1 - confidence) * 0.28)
  const spread = Math.min(0.45, confidenceSpread + disagreementSpread * 0.35)

  return {
    low: Math.max(1, Math.round(carbonIntensity * (1 - spread))),
    mid: Math.round(carbonIntensity),
    high: Math.max(1, Math.round(carbonIntensity * (1 + spread))),
    empirical: disagreementPct > 0,
  }
}

function computeEffectiveCarbonIntensity(
  carbonIntensity: number,
  signal: any,
  mode: RoutingMode
): number {
  if (mode !== 'assurance') {
    return carbonIntensity
  }

  const confidence = signal?.confidence ?? 0.25
  const disagreementPct = signal?.provenance?.disagreementPct ?? 0
  const fallbackUsed = Boolean(signal?.provenance?.fallbackUsed || signal?.source === 'fallback')
  const conservativeBand = deriveConfidenceBand(carbonIntensity, confidence, disagreementPct)

  let effective = conservativeBand.high
  if (fallbackUsed) {
    effective = Math.max(effective, Math.round(carbonIntensity * 1.35))
  }
  if (disagreementPct >= ASSURANCE_DISAGREEMENT_THRESHOLD_PCT) {
    effective = Math.max(
      effective,
      Math.round(carbonIntensity * (1 + disagreementPct / 100))
    )
  }

  return effective
}

function deriveConfidenceLabel(
  qualityTier: 'high' | 'medium' | 'low',
  disagreementPct: number
): 'high' | 'medium' | 'low' {
  if (disagreementPct >= ASSURANCE_DISAGREEMENT_THRESHOLD_PCT) {
    return 'low'
  }
  if (qualityTier === 'high') return 'high'
  if (qualityTier === 'medium') return 'medium'
  return 'low'
}

function buildWaterResult(
  selected: WaterEvaluation,
  baseline: WaterEvaluation,
  profile: WaterPolicyProfileId
): RoutingResult['water'] {
  return {
    policyProfile: profile,
    selectedWaterLiters: selected.waterLiters,
    baselineWaterLiters: baseline.waterLiters,
    selectedWaterScarcityImpact: selected.scarcityWeightedImpact,
    baselineWaterScarcityImpact: baseline.scarcityWeightedImpact,
    selectedWaterIntensityLPerKwh: selected.totalWaterIntensityLPerKwh,
    baselineWaterIntensityLPerKwh: baseline.totalWaterIntensityLPerKwh,
    waterStressIndex: selected.signal?.waterStressIndex ?? null,
    waterQualityIndex: selected.signal?.waterQualityIndex ?? null,
    droughtRiskIndex: selected.signal?.droughtRiskIndex ?? null,
    confidence: selected.confidence,
    source: selected.source,
    signalType: selected.signal?.signalType ?? null,
    datasetVersion: selected.signal?.datasetVersion ?? null,
    fallbackUsed: selected.fallbackUsed,
    guardrailTriggered: selected.guardrailTriggered,
    referenceTime: selected.signal?.referenceTime ?? null,
  }
}
