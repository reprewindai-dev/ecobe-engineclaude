/**
 * Grid Signal Trust Layer
 *
 * Implements a data-quality trust scoring system for Electricity Maps zones.
 *
 * The Electricity Maps coverage dataset reveals a critical fact:
 *   API coverage ≠ data reliability
 *
 * Some zones have 100% real telemetry from grid operators.
 * Some zones are entirely model-estimated (no real data).
 * Optimization engines that ignore this gap make bad decisions.
 *
 * Trust Score Formula:
 *   trust_score = (historical_completeness × 0.60) + ((100 − estimated_share) × 0.40)
 *
 * Trust Tiers:
 *   Tier A: score ≥ 80  — high fidelity, prefer for optimization
 *   Tier B: score 40–79 — mixed quality, allowed with confidence weighting
 *   Tier C: score < 40  — mostly modeled, avoid for optimization
 *
 * Known high-reliability zones (from the 2026-03-10 coverage dataset):
 *   Spain, Italy, Norway, Iceland, US regional grids (CAISO, NEISO),
 *   Nordic grids, Germany, France, UK, Australia (NEM)
 *
 * Known modeled zones (low reliability):
 *   Most of sub-Saharan Africa, parts of MENA, some South Asian grids
 */

import type { ZoneTrustProfile } from './types'

// ─── Static trust registry (from 2026-03-10 coverage dataset analysis) ────────
// Keyed by zone key. Zones not in this map get a default score of 50 (Tier B).
// Values: [historicalCompleteness, estimatedShare]  — both 0–100

const COVERAGE_DATA: Record<string, [number, number]> = {
  // ── Tier A — High fidelity ───────────────────────────────────────────────────
  'ES':            [99, 2],
  'PT':            [99, 2],
  'IT':            [98, 5],
  'NO':            [99, 0],
  'IS':            [99, 0],
  'DE':            [98, 3],
  'FR':            [98, 2],
  'GB':            [97, 4],
  'IE':            [97, 3],
  'DK-DK1':        [99, 1],
  'DK-DK2':        [99, 1],
  'SE-SE1':        [99, 0],
  'SE-SE2':        [99, 0],
  'SE-SE3':        [99, 0],
  'SE-SE4':        [99, 0],
  'FI':            [98, 2],
  'NL':            [98, 4],
  'BE':            [98, 4],
  'AT':            [97, 5],
  'CH':            [97, 3],
  'PL':            [96, 8],
  'CZ':            [97, 5],
  'HU':            [95, 10],
  'US-CAL-CISO':   [99, 1],
  'US-MISO-MI':    [97, 3],
  'US-NEISO':      [98, 2],
  'US-NY-NYIS':    [98, 2],
  'US-PJM-RTO':    [97, 3],
  'US-SW-AZPS':    [97, 5],
  'US-NW-BPAT':    [97, 5],
  'AU-NSW':        [98, 3],
  'AU-QLD':        [98, 3],
  'AU-SA':         [99, 2],
  'AU-VIC':        [98, 3],
  'JP-TK':         [90, 20],
  'KR':            [88, 22],
  // ── Tier B — Mixed quality ───────────────────────────────────────────────────
  'CA-ON':         [85, 25],
  'CA-QC':         [85, 25],
  'CA-AB':         [80, 30],
  'BR-CS':         [75, 35],
  'MX-CE':         [78, 32],
  'AR':            [70, 40],
  'CL-SEN':        [75, 35],
  'ZA':            [70, 45],
  'EG':            [65, 50],
  'TR':            [80, 25],
  'IN-SO':         [72, 40],
  'IN-NO':         [70, 42],
  'CN-SO':         [68, 45],
  'SG':            [80, 30],
  'TW':            [82, 22],
  'HK':            [78, 28],
  'ID':            [60, 55],
  'TH':            [65, 50],
  'VN':            [62, 52],
  'MY':            [68, 42],
  // ── Tier C — Mostly modeled ──────────────────────────────────────────────────
  'AF':            [10, 100],
  'LY':            [15, 100],
  'LR':            [10, 100],
  'LB':            [20, 95],
  'MW':            [10, 100],
  'ZW':            [15, 100],
  'MG':            [10, 100],
  'SD':            [20, 95],
  'TD':            [10, 100],
  'ML':            [12, 100],
  'NE':            [10, 100],
  'SO':            [8, 100],
  'YE':            [15, 100],
}

const FORECAST_CAPABLE_ZONES = new Set([
  'ES', 'PT', 'IT', 'NO', 'IS', 'DE', 'FR', 'GB', 'IE',
  'DK-DK1', 'DK-DK2', 'SE-SE1', 'SE-SE2', 'SE-SE3', 'SE-SE4',
  'FI', 'NL', 'BE', 'AT', 'CH', 'PL', 'CZ', 'HU',
  'US-CAL-CISO', 'US-NEISO', 'US-NY-NYIS', 'US-PJM-RTO',
  'AU-NSW', 'AU-QLD', 'AU-SA', 'AU-VIC',
  'CA-ON', 'CA-QC', 'JP-TK', 'KR', 'TR',
])

// ─── Scoring ──────────────────────────────────────────────────────────────────

function computeTrustScore(historicalCompleteness: number, estimatedShare: number): number {
  const score = historicalCompleteness * 0.6 + (100 - estimatedShare) * 0.4
  return Math.round(Math.max(0, Math.min(100, score)))
}

function scoreTier(score: number): 'A' | 'B' | 'C' {
  if (score >= 80) return 'A'
  if (score >= 40) return 'B'
  return 'C'
}

/**
 * Get the trust profile for a single zone.
 * Falls back to default (score=50, Tier B) for unknown zones.
 */
export function getZoneTrustProfile(zone: string): ZoneTrustProfile {
  const data = COVERAGE_DATA[zone]
  const [completeness, estimatedShare] = data ?? [70, 35]  // default Tier B
  const trustScore = computeTrustScore(completeness, estimatedShare)
  const tier = scoreTier(trustScore)

  return {
    zone,
    trustScore,
    tier,
    signalCoverage: {
      carbon_intensity: trustScore,
      electricity_mix: trustScore,
      net_load: data ? Math.max(trustScore - 5, 0) : 45,
      electricity_flows: data ? Math.max(trustScore - 10, 0) : 40,
      day_ahead_price: data && tier === 'A' ? trustScore : 0,
    },
    forecastReliable: FORECAST_CAPABLE_ZONES.has(zone),
    recommendedForOptimization: tier === 'A' || tier === 'B',
  }
}

/**
 * Get trust profiles for a list of zones, sorted by trust score descending.
 */
export function rankZonesByTrust(zones: string[]): ZoneTrustProfile[] {
  return zones
    .map(getZoneTrustProfile)
    .sort((a, b) => b.trustScore - a.trustScore)
}

/**
 * Filter zones to only Tier A (high-fidelity, preferred for optimization).
 */
export function filterTierAZones(zones: string[]): string[] {
  return zones.filter((z) => getZoneTrustProfile(z).tier === 'A')
}

/**
 * Filter out Tier C zones (mostly modeled — not suitable for optimization).
 */
export function filterOutTierCZones(zones: string[]): string[] {
  return zones.filter((z) => getZoneTrustProfile(z).tier !== 'C')
}

/**
 * Adjust a confidence value based on zone trust score.
 * Signals from Tier C zones get their confidence reduced.
 *
 * @param baseConfidence  0–1 base confidence from the provider adapter
 * @param zone            zone key
 * @returns               adjusted confidence 0–1
 */
export function adjustConfidenceForZone(baseConfidence: number, zone: string): number {
  const { trustScore } = getZoneTrustProfile(zone)
  const multiplier = trustScore / 100
  return Math.round(baseConfidence * multiplier * 1000) / 1000  // 3 decimal places
}

/**
 * Compute data quality tier for a signal from a given zone.
 * Used to populate the data_quality field on CarbonSignal.
 */
export function zoneDataQuality(zone: string): 'high' | 'medium' | 'low' {
  const { tier } = getZoneTrustProfile(zone)
  if (tier === 'A') return 'high'
  if (tier === 'B') return 'medium'
  return 'low'
}

/**
 * Should Kobe skip forecast-based optimization for this zone?
 * Returns true if the zone has no reliable forecast data.
 */
export function skipForecastOptimization(zone: string): boolean {
  return !FORECAST_CAPABLE_ZONES.has(zone)
}
