/**
 * Provider validator.
 *
 * Two responsibilities:
 * 1. Freshness check — is the signal's observed_time within the staleness window?
 * 2. Shape check — does the signal carry all required provenance fields?
 *
 * Validation failures are returned as structured objects, never thrown.
 */

import { carbonProviderConfig } from '../../config/carbon-providers'
import { CarbonSignal } from './types'

export interface ValidationResult {
  valid: boolean
  reason?: string
}

/**
 * Check that a signal is fresh enough to use for routing decisions.
 * Uses the observed_time field; if absent (synthetic / fallback), passes.
 */
export function validateFreshness(signal: CarbonSignal): ValidationResult {
  const referenceTime = signal.observed_time ?? signal.fetched_at
  const ageMs = Date.now() - new Date(referenceTime).getTime()
  const maxMs = carbonProviderConfig.maxStalenessMinutes * 60 * 1000

  if (ageMs > maxMs) {
    return {
      valid: false,
      reason: `Signal is ${Math.round(ageMs / 60000)} min old (max ${carbonProviderConfig.maxStalenessMinutes} min)`,
    }
  }
  return { valid: true }
}

/**
 * Ensure the signal has all mandatory provenance fields populated.
 */
export function validateShape(signal: CarbonSignal): ValidationResult {
  const required: (keyof CarbonSignal)[] = [
    'region',
    'intensity_gco2_per_kwh',
    'fetched_at',
    'source',
    'is_forecast',
    'data_quality',
  ]

  for (const field of required) {
    if (signal[field] === undefined || signal[field] === null) {
      return { valid: false, reason: `Missing required field: ${field}` }
    }
  }

  if (signal.intensity_gco2_per_kwh <= 0) {
    return { valid: false, reason: 'intensity_gco2_per_kwh must be positive' }
  }

  return { valid: true }
}

/**
 * Calculate the % difference between two intensity readings.
 * Used to detect provider disagreement.
 */
export function calcDisagreementPct(a: number, b: number): number {
  if (a === 0 && b === 0) return 0
  const avg = (a + b) / 2
  return Math.abs(a - b) / avg * 100
}
