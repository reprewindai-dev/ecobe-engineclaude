import type { DashboardDecision } from '@/types'

/**
 * Derives the originating source of a routing decision.
 * Priority: explicit meta.source → DEKES-named op → CI/CD-named workload → org-based API → Manual
 * All DEKES data is read exclusively from ECOBE decision fields — never from DEKES directly.
 */
export function getDecisionSource(d: DashboardDecision): string {
  const metaSource = d.meta?.source
  if (typeof metaSource === 'string' && metaSource.length > 0) return metaSource

  const opName = d.opName?.toLowerCase() ?? ''
  const workloadName = d.workloadName?.toLowerCase() ?? ''

  if (opName.includes('dekes') || workloadName.includes('dekes')) return 'DEKES'
  if (opName.includes('ci') || workloadName.includes('ci')) return 'CI/CD'
  if (d.organizationId) return 'API'
  return 'Manual'
}

/**
 * Returns true if a decision shows signs of a delayed/fallback routing event
 * (policy block, stale data, or fallback signal).
 */
export function isDecisionDelayed(d: DashboardDecision): boolean {
  return d.fallbackUsed || (d.dataFreshnessSeconds != null && d.dataFreshnessSeconds > 900)
}

/**
 * Derives quality tier from decision metadata.
 * high  → live data, fresh signal
 * medium → data stale > 10 min
 * low   → fallback used
 */
export function deriveQualityTier(d: DashboardDecision): 'high' | 'medium' | 'low' {
  if (d.fallbackUsed) return 'low'
  if (d.dataFreshnessSeconds != null && d.dataFreshnessSeconds > 600) return 'medium'
  return 'high'
}
