/**
 * Interchange Carbon Leakage Analyzer
 *
 * Computes how much a zone's reported carbon intensity UNDERSTATES its true footprint
 * due to heavy imports from higher-carbon neighboring BAs.
 *
 * "Carbon leakage" in this context:
 *   A zone can show low local carbon intensity while importing fossil-heavy power
 *   from neighbors. The import dependency ratio captures this hidden exposure.
 *
 * Score interpretation:
 *   0.0–0.1  Low leakage: zone is self-sufficient or imports from clean neighbors
 *   0.1–0.4  Moderate: some import dependency, verify import sources
 *   0.4–0.7  High: significantly import-dependent, true footprint likely higher
 *   0.7–1.0  Critical: net importer covering most demand through imports
 */

import type { InterchangeSummary, BalanceSummary, InterchangeLeakageSignal } from './types'
import { importDependencyRatio, topImportSources } from './interchange-parser'

/**
 * Compute the carbon leakage score for a BA.
 *
 * The score is primarily driven by import dependency ratio.
 * Volume scaling amplifies risk for heavily import-dependent zones.
 */
export function analyzeInterchangeLeakage(
  interchange: InterchangeSummary,
  balance: BalanceSummary | null,
): InterchangeLeakageSignal {
  const demandMwh = balance?.demandMwh ?? null
  const dependency = importDependencyRatio(interchange, demandMwh)

  // Compute leakage score: primarily dependency ratio, boosted by net import volume
  let score = 0
  if (dependency !== null) {
    score = dependency
    // Volume boost: large absolute import volumes increase risk even at moderate dependency
    const volumeBoost = Math.min(interchange.totalImportMw / 10_000, 0.15)
    score = Math.min(score + volumeBoost, 1)
  } else if (interchange.netImportMw > 0) {
    // No demand data — estimate from net import volume
    score = Math.min(interchange.netImportMw / 5_000, 0.5)
  }

  const topSources = topImportSources(interchange, 1)
  const topImportSource = topSources.length > 0 ? topSources[0].baCode : null

  return {
    region: interchange.region,
    balancingAuthority: interchange.balancingAuthority,
    timestamp: interchange.timestamp,
    importCarbonLeakageScore: Math.round(score * 1000) / 1000,
    netImportMw: interchange.netImportMw,
    isNetImporter: interchange.netImportMw > 0,
    importDependencyRatio: dependency ?? 0,
    topImportSource,
  }
}

/**
 * Compute leakage scores for multiple BAs and rank by leakage risk (highest first).
 */
export function rankByLeakageRisk(
  interchangeMap: Map<string, InterchangeSummary>,
  balanceMap: Map<string, BalanceSummary>,
): InterchangeLeakageSignal[] {
  const signals: InterchangeLeakageSignal[] = []

  for (const [baCode, interchange] of interchangeMap) {
    const balance = balanceMap.get(baCode) ?? null
    signals.push(analyzeInterchangeLeakage(interchange, balance))
  }

  return signals.sort((a, b) => b.importCarbonLeakageScore - a.importCarbonLeakageScore)
}
