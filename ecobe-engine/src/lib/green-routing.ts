import { providerRouter } from './carbon/provider-router'
import { GridSignalCache } from './grid-signals/grid-signal-cache'
import { GridSignalAudit } from './grid-signals/grid-signal-audit'
import { wattTime } from './watttime'
import { randomUUID } from 'crypto'
import { classifyJob, recordLedgerEntry, storeProviderSnapshot } from './routing'
import { generateLease, retryAsync } from './governance'
import { prisma } from './db'
import {
  DEFAULT_ROUTING_WEIGHTS,
  LOWEST_DEFENSIBLE_SIGNAL_DOCTRINE,
  ROUTING_LEGAL_DISCLAIMER,
  normalizeRoutingWeights,
  type RoutingWeightSet,
} from './methodology'

export interface RoutingRequest {
  preferredRegions: string[]
  maxCarbonGPerKwh?: number
  latencyMsByRegion?: Record<string, number>
  costIndexByRegion?: Record<string, number>
  costWeight?: number  // 0-1, default 0.3
  carbonWeight?: number  // 0-1, default 0.5
  latencyWeight?: number  // 0-1, default 0.2
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
  // Keep existing lease fields
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
}

export async function routeGreen(request: RoutingRequest): Promise<RoutingResult> {
  const {
    preferredRegions,
    maxCarbonGPerKwh,
    latencyMsByRegion = {},
    costIndexByRegion = {},
    carbonWeight = DEFAULT_ROUTING_WEIGHTS.carbon,
    latencyWeight = DEFAULT_ROUTING_WEIGHTS.latency,
    costWeight = DEFAULT_ROUTING_WEIGHTS.cost,
  } = request

  if (preferredRegions.length === 0) {
    throw new Error('At least one preferred region is required')
  }

  const normalizedWeights = normalizeRoutingWeights({
    carbon: carbonWeight,
    latency: latencyWeight,
    cost: costWeight,
  })

  // Get routing signals for all regions from ProviderRouter
  const regionSignals = new Map<string, any>()
  const regionData = await Promise.all(
    preferredRegions.map(async (region) => {
      try {
        // Get routing signal from provider router (uses WattTime + Electricity Maps)
        const signal = await providerRouter.getRoutingSignal(region, new Date())
        regionSignals.set(region, signal)

        return {
          region,
          carbonIntensity: signal.carbonIntensity,
          latency: latencyMsByRegion[region] ?? 100,
          costIndex: costIndexByRegion[region] ?? 1,
          signal,
        }
      } catch (error) {
        console.error(`Failed to get routing signal for ${region}:`, error)
        // Static fallback — degraded state, confidence 0.05
        return {
          region,
          carbonIntensity: 400,
          latency: latencyMsByRegion[region] ?? 100,
          costIndex: costIndexByRegion[region] ?? 1,
          signal: null,
        }
      }
    })
  )

  // Filter by max carbon if specified
  const filtered = maxCarbonGPerKwh
    ? regionData.filter((r) => r.carbonIntensity <= maxCarbonGPerKwh)
    : regionData

  if (filtered.length === 0) {
    // All regions exceed carbon budget - pick lowest carbon anyway
    const sorted = [...regionData].sort((a, b) => a.carbonIntensity - b.carbonIntensity)
    const best = sorted[0]

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
      alternatives: sorted.slice(1, 3).map((r) => ({
        region: r.region,
        carbonIntensity: r.carbonIntensity,
        score: 0,
        reason: `Exceeds carbon budget (${maxCarbonGPerKwh} gCO2/kWh)`,
      })),
    }
  }

  // Score each region
  const scored = filtered.map((r) => {
    // Carbon score (lower is better, normalize to 0-1)
    const maxCarbon = Math.max(...filtered.map((x) => x.carbonIntensity))
    const carbonScore = 1 - r.carbonIntensity / maxCarbon

    // Latency score (lower is better, normalize to 0-1)
    const maxLatency = Math.max(...filtered.map((x) => x.latency))
    const latencyScore = 1 - r.latency / maxLatency

    // Cost score (lower cost index is better; neutral when no differentiation exists)
    const maxCost = Math.max(...filtered.map((x) => x.costIndex))
    const minCost = Math.min(...filtered.map((x) => x.costIndex))
    const costScore =
      maxCost === minCost ? 1 : 1 - (r.costIndex - minCost) / (maxCost - minCost)

    // Overall score
    const score =
      normalizedWeights.carbon * carbonScore +
      normalizedWeights.latency * latencyScore +
      normalizedWeights.cost * costScore

    return {
      ...r,
      score,
      carbonScore,
      latencyScore,
      costScore,
    }
  })

  // Sort by score (highest first)
  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]
  const bestSignal = regionSignals.get(best.region)

  // Get grid snapshot for best region
  const gridSnapshot = await getLatestGridSnapshot(best.region)

  // Get predicted clean window for best region
  const cleanWindows = await getCleanWindowSafe(best.region)

  // Calculate worst intensity for delta
  const worstIntensity = Math.max(...scored.map(r => r.carbonIntensity))

  // Determine quality tier — use providerRouter.validateSignalQuality when available,
  // otherwise fall back to confidence-based derivation
  let qualityTier: 'high' | 'medium' | 'low' = 'low'
  if (bestSignal) {
    try {
      const validation = await providerRouter.validateSignalQuality(bestSignal)
      qualityTier = validation.qualityTier
    } catch {
      // Fallback: derive from confidence directly
      qualityTier = bestSignal.confidence >= 0.8 ? 'high' : bestSignal.confidence >= 0.5 ? 'medium' : 'low'
    }
  }

  // Derive forecast stability with provider disagreement context
  const forecastStability = bestSignal ? deriveStability(bestSignal.confidence, {
    flag: bestSignal.provenance.disagreementFlag,
    pct: bestSignal.provenance.disagreementPct
  }) : null

  const decisionFrameId = randomUUID()

  // ── Governance: Generate decision lease (shared policy from governance.ts) ──
  const lease = generateLease(qualityTier, decisionFrameId)
  const { lease_id: leaseId, lease_expires_at: leaseExpiresAt, must_revalidate_after: mustRevalidateAfter, leaseMinutes } = lease

  // ── Governance: Quality gate ───────────────────────────────────────────
  // If quality is critically low AND fallback was used, flag in explanation
  const governanceWarnings: string[] = []
  if (qualityTier === 'low' && bestSignal?.provenance.fallbackUsed) {
    governanceWarnings.push('LOW_QUALITY_FALLBACK: Decision based on static fallback data, not live provider signals.')
  }
  if (bestSignal?.provenance.disagreementFlag && (bestSignal.provenance.disagreementPct ?? 0) > 25) {
    governanceWarnings.push(`HIGH_DISAGREEMENT: Provider signals diverge by ${bestSignal.provenance.disagreementPct?.toFixed(1)}%. Decision confidence reduced.`)
  }
  if (forecastStability === 'unstable') {
    governanceWarnings.push('UNSTABLE_FORECAST: Grid conditions are volatile. Recommend shorter execution windows.')
  }

  // Record audit trail (with retry — governance-critical data)
  if (bestSignal) {
    retryAsync(() => providerRouter.recordSignalProvenance(bestSignal, decisionFrameId), 'signal-provenance')

    // Record grid signal audit (with retry)
    retryAsync(() => GridSignalAudit.recordRoutingDecision(
      decisionFrameId,
      best.region,
      {
        balancingAuthority: gridSnapshot?.balancingAuthority ?? null,
        demandRampPct: gridSnapshot?.demandChangePct ?? null,
        carbonSpikeProbability: gridSnapshot?.carbonSpikeProbability ?? null,
        curtailmentProbability: gridSnapshot?.curtailmentProbability ?? null,
        importCarbonLeakageScore: gridSnapshot?.importCarbonLeakageScore ?? null,
        signalQuality: qualityTier as 'high' | 'medium' | 'low',
        estimatedFlag: bestSignal.isForecast,
        syntheticFlag: bestSignal.source === 'fallback'
      },
      {
        sourceUsed: bestSignal.provenance.sourceUsed,
        validationSource: bestSignal.provenance.contributingSources.length > 1 ? 'ember' : undefined,
        referenceTime: bestSignal.provenance.referenceTime,
        fetchedAt: bestSignal.provenance.fetchedAt,
        fallbackUsed: bestSignal.provenance.fallbackUsed,
        disagreementFlag: bestSignal.provenance.disagreementFlag,
        disagreementPct: bestSignal.provenance.disagreementPct
      }
    ), 'grid-signal-audit')
  }

  // ── Carbon Ledger + Provider Snapshots (with retry) ─────────────────────
  const classification = classifyJob({
    executionMode: 'immediate',
    latencySlaMs: best.latency,
  })

  // Record carbon ledger entry for audit-grade accounting (with retry)
  retryAsync(() => recordLedgerEntry({
    orgId: 'system', // Overridden by carbon-command when called with orgId
    decisionFrameId,
    classification,
    energyEstimateKwh: 0.05, // Default estimate; carbon-command overrides
    baselineRegion: scored[scored.length - 1]?.region ?? best.region,
    scoringResult: {
      candidates: [],
      selected: {
        candidateId: 'best',
        region: best.region,
        startTs: new Date(),
        carbonEstimateGPerKwh: best.carbonIntensity,
        latencyEstimateMs: best.latency,
        queueDelayEstimateSec: null,
        costEstimateUsd: null,
        confidenceScore: bestSignal?.confidence ?? null,
        retryRiskScore: null,
        balancingAuthority: gridSnapshot?.balancingAuthority ?? null,
        demandRampPct: gridSnapshot?.demandChangePct ?? null,
        carbonSpikeProbability: gridSnapshot?.carbonSpikeProbability ?? null,
        curtailmentProbability: gridSnapshot?.curtailmentProbability ?? null,
        importCarbonLeakageScore: gridSnapshot?.importCarbonLeakageScore ?? null,
        estimatedFlag: bestSignal?.isForecast ?? false,
        syntheticFlag: bestSignal?.source === 'fallback',
        carbonScore: null, latencyScore: null, costScore: null,
        queueScore: null, uncertaintyScore: null, rankScore: best.score,
        isFeasible: true, rejectionReason: null,
      },
      fallback: scored[1] ? {
        candidateId: 'fallback',
        region: scored[1].region,
        startTs: new Date(),
        carbonEstimateGPerKwh: scored[1].carbonIntensity,
        latencyEstimateMs: scored[1].latency,
        queueDelayEstimateSec: null, costEstimateUsd: null,
        confidenceScore: null, retryRiskScore: null,
        balancingAuthority: null, demandRampPct: null,
        carbonSpikeProbability: null, curtailmentProbability: null,
        importCarbonLeakageScore: null,
        estimatedFlag: false, syntheticFlag: false,
        carbonScore: null, latencyScore: null, costScore: null,
        queueScore: null, uncertaintyScore: null, rankScore: scored[1].score,
        isFeasible: true, rejectionReason: null,
      } : null,
      baselineCandidate: scored[scored.length - 1] ? {
        candidateId: 'baseline',
        region: scored[scored.length - 1].region,
        startTs: new Date(),
        carbonEstimateGPerKwh: worstIntensity,
        latencyEstimateMs: null, queueDelayEstimateSec: null,
        costEstimateUsd: null, confidenceScore: null, retryRiskScore: null,
        balancingAuthority: null, demandRampPct: null,
        carbonSpikeProbability: null, curtailmentProbability: null,
        importCarbonLeakageScore: null,
        estimatedFlag: false, syntheticFlag: false,
        carbonScore: null, latencyScore: null, costScore: null,
        queueScore: null, uncertaintyScore: null, rankScore: null,
        isFeasible: true, rejectionReason: null,
      } : null,
      totalEvaluated: scored.length,
      totalFeasible: filtered.length,
    },
  }), 'carbon-ledger')

  // Store provider snapshot for audit trail (with retry)
  if (bestSignal) {
    retryAsync(() => storeProviderSnapshot({
      provider: bestSignal.provenance.sourceUsed ?? 'unknown',
      zone: best.region,
      signalType: 'intensity',
      signalValue: best.carbonIntensity,
      observedAt: new Date(bestSignal.provenance.fetchedAt),
      freshnessSec: Math.floor((Date.now() - new Date(bestSignal.provenance.fetchedAt).getTime()) / 1000),
      confidence: bestSignal.confidence,
    }), 'provider-snapshot')
  }

  const baselineCandidate = scored[scored.length - 1] ?? best
  const baselineIntensity = Math.round(baselineCandidate.carbonIntensity)
  const chosenIntensity = Math.round(best.carbonIntensity)
  const reason =
    governanceWarnings.length > 0
      ? `${governanceWarnings.join(' | ')} ${LOWEST_DEFENSIBLE_SIGNAL_DOCTRINE}`
      : `Routed to ${best.region} with ${qualityTier} confidence under the lowest defensible signal doctrine. Lease valid for ${leaseMinutes}m.`

  if ((prisma as any)?.dashboardRoutingDecision?.create) {
    await prisma.dashboardRoutingDecision.create({
      data: {
        workloadName: null,
        opName: 'route-green',
        baselineRegion: baselineCandidate.region,
        chosenRegion: best.region,
        zoneBaseline: baselineCandidate.region,
        zoneChosen: best.region,
        carbonIntensityBaselineGPerKwh: baselineIntensity,
        carbonIntensityChosenGPerKwh: chosenIntensity,
        estimatedKwh: 0.05,
        co2BaselineG: baselineIntensity * 0.05,
        co2ChosenG: chosenIntensity * 0.05,
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
          forecast_stability: forecastStability,
          score: best.score,
          source: bestSignal?.provenance.sourceUsed ?? null,
          weights: normalizedWeights,
          alternatives: scored.slice(1, 3).map((r) => ({
            region: r.region,
            carbonIntensity: r.carbonIntensity,
            score: r.score,
          })),
          confidenceBand: bestSignal
            ? deriveConfidenceBand(
                best.carbonIntensity,
                bestSignal.confidence,
                bestSignal.provenance.disagreementPct ?? 0
              )
            : deriveConfidenceBand(best.carbonIntensity, 0.25, 0),
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
    qualityTier: qualityTier as 'high' | 'medium' | 'low',
    carbon_delta_g_per_kwh: scored.length > 1 ? worstIntensity - best.carbonIntensity : null,
    forecast_stability: forecastStability,
    provider_disagreement: bestSignal ? {
      flag: bestSignal.provenance.disagreementFlag,
      pct: bestSignal.provenance.disagreementPct
    } : { flag: false, pct: null },
    balancingAuthority: gridSnapshot?.balancingAuthority ?? null,
    demandRampPct: gridSnapshot?.demandChangePct ?? null,
    carbonSpikeProbability: gridSnapshot?.carbonSpikeProbability ?? null,
    curtailmentProbability: gridSnapshot?.curtailmentProbability ?? null,
    importCarbonLeakageScore: gridSnapshot?.importCarbonLeakageScore ?? null,
    source_used: bestSignal?.provenance.sourceUsed ?? null,
    validation_source: (bestSignal?.provenance.contributingSources.length ?? 0) > 1 ? 'ember' : null,
    fallback_used: bestSignal?.provenance.fallbackUsed ?? null,
    estimatedFlag: bestSignal?.isForecast ?? null,
    syntheticFlag: bestSignal?.source === 'fallback' || null,
    predicted_clean_window: cleanWindows?.[0] ?? null,
    decisionFrameId: decisionFrameId,
    // Governance: Lease fields
    lease_id: leaseId,
    lease_expires_at: leaseExpiresAt,
    must_revalidate_after: mustRevalidateAfter,
    // Governance: Warnings and explanation
    explanation: reason,
    alternatives: scored.slice(1, 3).map((r) => ({
      region: r.region,
      carbonIntensity: r.carbonIntensity,
      score: r.score,
    })),
    confidenceBand: bestSignal
      ? deriveConfidenceBand(best.carbonIntensity, bestSignal.confidence, bestSignal.provenance.disagreementPct ?? 0)
      : deriveConfidenceBand(best.carbonIntensity, 0.25, 0),
    dataResolutionMinutes: bestSignal?.isForecast ? 60 : 5,
    weights: normalizedWeights,
    legalDisclaimer: ROUTING_LEGAL_DISCLAIMER,
    doctrine: LOWEST_DEFENSIBLE_SIGNAL_DOCTRINE,
  }
}

// Helper functions
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
    return await wattTime.getPredictedCleanWindows(region)
  } catch {
    return null
  }
}

// retryAsync imported from ./governance (single source of truth)

function deriveStability(confidence: number, providerDisagreement?: { flag: boolean; pct: number | null }): 'stable' | 'medium' | 'unstable' {
  let score = confidence * 100 // Start with confidence as base

  // Penalize for provider disagreement
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
