/**
 * Multi-provider carbon data config.
 *
 * Roles, priority, and thresholds are defined here — never inside providers.
 * Providers must never self-decide priority.
 */

import { ProviderName, ProviderRole } from '../lib/carbon/types'

export interface ProviderConfig {
  name: ProviderName
  role: ProviderRole
  /** Regions this provider covers ('*' = all) */
  regions: string[] | '*'
  enabled: boolean
}

export interface CarbonProviderConfig {
  primary: ProviderName
  validation: ProviderName | null
  allowFallback: boolean
  /** Minutes before a cached signal is considered stale */
  maxStalenessMinutes: number
  /** % difference at which two providers are flagged as disagreeing */
  disagreementThresholdPct: number
  /** Emit extra diagnostics in logs (dev only) */
  devDiagnostics: boolean
  providers: ProviderConfig[]
}

function resolveRole(name: ProviderName, raw: string): ProviderRole {
  const valid: ProviderRole[] = [
    'primary_realtime',
    'secondary_validation',
    'secondary_history',
    'fallback',
    'disabled',
  ]
  return valid.includes(raw as ProviderRole) ? (raw as ProviderRole) : 'disabled'
}

export function loadCarbonProviderConfig(): CarbonProviderConfig {
  const primary = (process.env.CARBON_PROVIDER_PRIMARY ?? 'electricity_maps') as ProviderName
  const validationEnv = process.env.CARBON_PROVIDER_VALIDATION
  const validation: ProviderName | null =
    validationEnv && validationEnv !== 'none' ? (validationEnv as ProviderName) : null

  return {
    primary,
    validation,
    allowFallback: process.env.CARBON_PROVIDER_ALLOW_FALLBACK !== 'false',
    maxStalenessMinutes: parseInt(process.env.CARBON_PROVIDER_MAX_STALENESS_MINUTES ?? '10'),
    disagreementThresholdPct: parseFloat(
      process.env.CARBON_PROVIDER_DISAGREEMENT_THRESHOLD_PCT ?? '15'
    ),
    devDiagnostics: process.env.CARBON_PROVIDER_DEV_DIAGNOSTICS === 'true',
    providers: [
      {
        name: 'electricity_maps',
        role: resolveRole(
          'electricity_maps',
          process.env.CARBON_PROVIDER_EM_ROLE ?? 'primary_realtime'
        ),
        regions: '*', // global
        enabled: Boolean(process.env.ELECTRICITY_MAPS_API_KEY),
      },
      {
        name: 'ember',
        role: resolveRole(
          'ember',
          process.env.CARBON_PROVIDER_EMBER_ROLE ?? 'secondary_validation'
        ),
        regions: '*', // country-level global
        enabled: Boolean(process.env.EMBER_ENERGY_API_KEY),
      },
      {
        name: 'watttime',
        role: resolveRole(
          'watttime',
          process.env.CARBON_PROVIDER_WATTTIME_ROLE ?? 'fallback'
        ),
        regions: ['US-CAL-CISO', 'US-TEX-ERCO', 'US-NW-PACW', 'US-MIDA-PJM'],
        enabled: Boolean(process.env.WATTTIME_API_KEY),
      },
    ],
  }
}

/** Singleton — loaded once at startup */
export const carbonProviderConfig = loadCarbonProviderConfig()
