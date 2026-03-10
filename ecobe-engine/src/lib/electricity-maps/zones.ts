/**
 * Identity + Access Service — Zones and Data Centers
 *
 * Provides zone discovery, zone metadata, and data center mapping.
 * This is the first call in any integration — determine what zones your token
 * has access to before fetching signals.
 *
 * Key use cases:
 *   - Token capability detection (which zones and endpoints are accessible)
 *   - Coordinate-to-zone resolution (find zone for lat/lon)
 *   - Data center provider → zone mapping (GCP us-east1 → US-CAL-CISO)
 *   - Zone metadata for display (country name, tier, sub-zones)
 */

import { emClient } from './client'
import type { EM_ZoneInfo, EM_DataCenter, ZoneTier } from './types'

export interface ZoneMetadata {
  zoneKey: string
  zoneName: string
  countryCode: string
  countryName: string
  parentZone: string | null
  childZones: string[]
  isAvailable: boolean
  tier: ZoneTier
  /** Endpoints accessible with the current token. ['*'] means full access. */
  accessibleEndpoints: string[]
}

export interface DataCenterInfo {
  provider: string
  region: string
  displayName: string
  zoneKey: string
  coordinates: { lon: number; lat: number }
  status: string
}

function normalizeZone(key: string, z: EM_ZoneInfo): ZoneMetadata {
  return {
    zoneKey: z.zoneKey ?? key,
    zoneName: z.zoneName,
    countryCode: z.countryCode,
    countryName: z.countryName,
    parentZone: z.zoneParentKey,
    childZones: z.subZoneKeys ?? [],
    isAvailable: z.isCommerciallyAvailable,
    tier: z.tier,
    accessibleEndpoints: z.access ?? [],
  }
}

function normalizeDataCenter(dc: EM_DataCenter): DataCenterInfo {
  return {
    provider: dc.provider,
    region: dc.region,
    displayName: dc.displayName,
    zoneKey: dc.zoneKey,
    coordinates: { lon: dc.lonlat[0], lat: dc.lonlat[1] },
    status: dc.status,
  }
}

/**
 * Get all zones accessible to the current API token.
 * Returns a flat list sorted by zone key.
 */
export async function getAccessibleZones(): Promise<ZoneMetadata[]> {
  const res = await emClient.getZones()
  if (!res) return []

  return Object.entries(res)
    .map(([key, info]) => normalizeZone(key, info))
    .sort((a, b) => a.zoneKey.localeCompare(b.zoneKey))
}

/**
 * Get zones that have full API access ('*' or all key endpoints).
 * These are safe to use for all signal types.
 */
export async function getFullAccessZones(): Promise<ZoneMetadata[]> {
  const zones = await getAccessibleZones()
  return zones.filter(
    (z) => z.accessibleEndpoints.includes('*') || z.accessibleEndpoints.length > 5,
  )
}

/**
 * Get metadata for a specific zone by key.
 */
export async function getZoneInfo(zone: string): Promise<ZoneMetadata | null> {
  const res = await emClient.getZone(zone)
  if (!res) return null
  return normalizeZone(zone, res)
}

/**
 * Resolve a geographic coordinate to an Electricity Maps zone.
 *
 * @example resolveZoneByCoords(48.85, 2.35) → 'FR'
 */
export async function resolveZoneByCoords(lat: number, lon: number): Promise<ZoneMetadata | null> {
  const res = await emClient.getZoneByCoords(lat, lon)
  if (!res) return null
  return normalizeZone(res.zoneKey, res)
}

/**
 * Get all data centers mapped by Electricity Maps.
 */
export async function getDataCenters(filters?: {
  zone?: string
  provider?: string
}): Promise<DataCenterInfo[]> {
  const res = await emClient.getDataCenters(
    filters
      ? { zone: filters.zone, dataCenterProvider: filters.provider }
      : undefined,
  )
  if (!res) return []
  return res.map(normalizeDataCenter)
}

/**
 * Find the Electricity Maps zone for a specific cloud provider + region.
 *
 * @example getZoneForDataCenter('gcp', 'europe-west1') → 'BE'
 */
export async function getZoneForDataCenter(
  provider: string,
  region: string,
): Promise<string | null> {
  const all = await getDataCenters({ provider })
  const match = all.find((dc) => dc.region === region)
  return match?.zoneKey ?? null
}

/**
 * Build a provider:region → zoneKey lookup map.
 * Useful for pre-warming the mapping at startup.
 *
 * @example
 *   const map = await buildDataCenterZoneMap('aws')
 *   const zone = map['aws:eu-west-1']  // → 'IE'
 */
export async function buildDataCenterZoneMap(
  provider?: string,
): Promise<Record<string, string>> {
  const all = await getDataCenters(provider ? { provider } : undefined)
  const map: Record<string, string> = {}
  for (const dc of all) {
    map[`${dc.provider}:${dc.region}`] = dc.zoneKey
  }
  return map
}

/**
 * Get historical updates since a given timestamp.
 * Useful for incremental backfill — only re-fetch hours that changed.
 */
export async function getUpdatedSince(params: {
  zone: string
  since: Date
  start?: Date
  end?: Date
  limit?: number
}): Promise<Array<{ updatedAt: string; datetime: string }>> {
  const res = await emClient.getUpdatedSince({
    zone: params.zone,
    since: params.since.toISOString(),
    start: params.start?.toISOString(),
    end: params.end?.toISOString(),
    limit: params.limit,
  })
  if (!res) return []
  return res.updates.map((u) => ({ updatedAt: u.updated_at, datetime: u.datetime }))
}
