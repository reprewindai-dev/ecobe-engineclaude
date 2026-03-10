/**
 * EIA-930 Balancing Authority ↔ ECOBE Region Mapping
 *
 * Maps between:
 *   EIA-930 respondent codes (e.g. "MIDA" for PJM)
 *   ECOBE region codes (e.g. "US-MIDA-PJM")
 *   WattTime BA names (e.g. "PJM_ROANOKE") — used for MOER lookups
 *
 * Reference:
 *   https://www.eia.gov/electricity/gridmonitor/about
 *   https://docs.watttime.org/
 */

import type { BARegionMapping } from './types'

// Canonical BA → region + WattTime mapping table
const MAPPINGS: BARegionMapping[] = [
  // ── US Balancing Authorities ─────────────────────────────────────────────────
  {
    baCode: 'MIDA',
    baName: 'PJM Interconnection, LLC',
    region: 'US-MIDA-PJM',
    watttimeBA: 'PJM_ROANOKE',
    timezone: 'America/New_York',
    country: 'US',
  },
  {
    baCode: 'CAL',
    baName: 'California Independent System Operator',
    region: 'US-CAL-CISO',
    watttimeBA: 'CAISO_NORTH',
    timezone: 'America/Los_Angeles',
    country: 'US',
  },
  {
    baCode: 'TEX',
    baName: 'Electric Reliability Council of Texas, Inc.',
    region: 'US-TEX-ERCO',
    watttimeBA: 'ERCOT_EASTTX',
    timezone: 'America/Chicago',
    country: 'US',
  },
  {
    baCode: 'MIDW',
    baName: 'Midcontinent Independent System Operator, Inc.',
    region: 'US-MIDW-MISO',
    watttimeBA: 'MISO_WUMS',
    timezone: 'America/Chicago',
    country: 'US',
  },
  {
    baCode: 'NE',
    baName: 'ISO New England Inc.',
    region: 'US-NE-ISNE',
    watttimeBA: 'ISONE_MAINE',
    timezone: 'America/New_York',
    country: 'US',
  },
  {
    baCode: 'NY',
    baName: 'New York Independent System Operator',
    region: 'US-NY-NYIS',
    watttimeBA: 'NYISO_NYC',
    timezone: 'America/New_York',
    country: 'US',
  },
  {
    baCode: 'SE',
    baName: 'SERC Reliability Corporation',
    region: 'US-SE-SERC',
    watttimeBA: 'SOCO',
    timezone: 'America/New_York',
    country: 'US',
  },
  {
    baCode: 'NW',
    baName: 'Bonneville Power Administration',
    region: 'US-NW-BPAT',
    watttimeBA: 'BPAT',
    timezone: 'America/Los_Angeles',
    country: 'US',
  },
  {
    baCode: 'CENT',
    baName: 'Southwest Power Pool, Inc.',
    region: 'US-SW-SRP',
    watttimeBA: 'SPP',
    timezone: 'America/Chicago',
    country: 'US',
  },
  {
    baCode: 'SW',
    baName: 'Western Area Power Administration – Colorado Hydroelectric',
    region: 'US-SW-AZPS',
    watttimeBA: 'AZPS',
    timezone: 'America/Phoenix',
    country: 'US',
  },
  {
    baCode: 'FLA',
    baName: 'Florida Reliability Coordinating Council',
    region: 'US-FLA-FPL',
    watttimeBA: 'FPL',
    timezone: 'America/New_York',
    country: 'US',
  },
]

// Lookup indexes (built once at module load)
const BY_BA_CODE = new Map<string, BARegionMapping>()
const BY_REGION = new Map<string, BARegionMapping>()
const BY_WATTTIME_BA = new Map<string, BARegionMapping>()

for (const m of MAPPINGS) {
  BY_BA_CODE.set(m.baCode, m)
  BY_REGION.set(m.region, m)
  if (m.watttimeBA) BY_WATTTIME_BA.set(m.watttimeBA, m)
}

/** Resolve EIA-930 BA code → ECOBE mapping */
export function getMappingByBACode(baCode: string): BARegionMapping | null {
  return BY_BA_CODE.get(baCode) ?? null
}

/** Resolve ECOBE region code → mapping */
export function getMappingByRegion(region: string): BARegionMapping | null {
  return BY_REGION.get(region) ?? null
}

/** Resolve WattTime BA name → mapping */
export function getMappingByWatttimeBA(wtBA: string): BARegionMapping | null {
  return BY_WATTTIME_BA.get(wtBA) ?? null
}

/** Return all supported BA codes */
export function getAllBACodes(): string[] {
  return MAPPINGS.map((m) => m.baCode)
}

/** Return all supported ECOBE regions */
export function getAllSupportedRegions(): string[] {
  return MAPPINGS.map((m) => m.region)
}

/** Translate EIA-930 BA code to ECOBE region key. Returns null if unmapped. */
export function baCodeToRegion(baCode: string): string | null {
  return BY_BA_CODE.get(baCode)?.region ?? null
}

/** Translate ECOBE region key to EIA-930 BA code. Returns null if unmapped. */
export function regionToBACode(region: string): string | null {
  return BY_REGION.get(region)?.baCode ?? null
}

/** Translate ECOBE region key to WattTime BA name. Returns null if unmapped. */
export function regionToWatttimeBA(region: string): string | null {
  return BY_REGION.get(region)?.watttimeBA ?? null
}

/** EIA-930 fuel code → normalized fuel name */
export function normalizeFuelCode(code: string): keyof import('./types').FuelMixSummary['byFuel'] | null {
  const map: Record<string, keyof import('./types').FuelMixSummary['byFuel']> = {
    SUN: 'solar',
    WND: 'wind',
    WAT: 'hydro',
    NUC: 'nuclear',
    NG:  'naturalGas',
    COL: 'coal',
    OIL: 'oil',
    OTH: 'other',
    GEO: 'other',
    BIO: 'other',
  }
  return map[code.toUpperCase()] ?? null
}
