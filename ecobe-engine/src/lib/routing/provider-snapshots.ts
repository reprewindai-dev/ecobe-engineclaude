/**
 * Provider Snapshot Storage — Routing Spec v1
 *
 * Persists provider signal values at decision time for full audit trail.
 * Stores WattTime, Electricity Maps, Ember, and EIA-930 snapshots.
 */

import { prisma } from '../db'

export interface ProviderSignalSnapshot {
  provider: string
  zone: string
  signalType: string
  signalValue: number
  forecastForTs?: Date
  observedAt: Date
  freshnessSec?: number
  confidence?: number
  metadata?: Record<string, unknown>
}

/**
 * Store a provider signal snapshot.
 * Upserts to avoid duplicates.
 */
export async function storeProviderSnapshot(snapshot: ProviderSignalSnapshot): Promise<void> {
  try {
    const provider = canonicalizeProviderIdentity(snapshot.provider)

    await prisma.providerSnapshot.upsert({
      where: {
        provider_zone_signalType_observedAt: {
          provider,
          zone: snapshot.zone,
          signalType: snapshot.signalType,
          observedAt: snapshot.observedAt,
        },
      },
      create: {
        provider,
        zone: snapshot.zone,
        signalType: snapshot.signalType,
        signalValue: snapshot.signalValue,
        forecastForTs: snapshot.forecastForTs ?? null,
        observedAt: snapshot.observedAt,
        freshnessSec: snapshot.freshnessSec ?? null,
        confidence: snapshot.confidence ?? null,
        metadata: snapshot.metadata ?? {},
      },
      update: {
        signalValue: snapshot.signalValue,
        forecastForTs: snapshot.forecastForTs ?? null,
        freshnessSec: snapshot.freshnessSec ?? null,
        confidence: snapshot.confidence ?? null,
        metadata: snapshot.metadata ?? {},
      },
    })
  } catch (error) {
    // Silently ignore duplicates
    console.warn('Provider snapshot store error:', error)
  }
}

/**
 * Store multiple snapshots in batch.
 */
export async function storeProviderSnapshotBatch(snapshots: ProviderSignalSnapshot[]): Promise<void> {
  await Promise.all(snapshots.map(s => storeProviderSnapshot(s)))
}

/**
 * Get latest provider snapshots for a zone.
 */
export async function getLatestSnapshots(zone: string, providers?: string[]) {
  const where: any = { zone }
  if (providers && providers.length > 0) {
    where.provider = { in: providers }
  }

  return prisma.providerSnapshot.findMany({
    where,
    orderBy: { observedAt: 'desc' },
    take: 20,
  })
}

const PROVIDER_FRESHNESS_THRESHOLDS_SEC: Record<string, number> = {
  WATTTIME_MOER: 600,
  ELECTRICITY_MAPS: 600,
  EMBER_STRUCTURAL_BASELINE: 86400,
  EIA_930: 1800,
  GRIDSTATUS: 1800,
  GB_CARBON: 1800,
  DK_CARBON: 1800,
  FI_CARBON: 1800,
  ON_CARBON: 21600,
  QC_CARBON: 21600,
  BC_CARBON: 21600,
}

const INTEGRATION_SOURCE_TO_PROVIDER: Record<string, string> = {
  WATTTIME: 'WATTTIME_MOER',
  GRIDSTATUS: 'GRIDSTATUS',
  EIA_930: 'EIA_930',
  EMBER: 'EMBER_STRUCTURAL_BASELINE',
  GB_CARBON: 'GB_CARBON',
  DK_CARBON: 'DK_CARBON',
  FI_CARBON: 'FI_CARBON',
  ON_CARBON: 'ON_CARBON',
  QC_CARBON: 'QC_CARBON',
  BC_CARBON: 'BC_CARBON',
}

function normalizeProviderToken(provider: string): string {
  return provider.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function canonicalizeProviderIdentity(provider: string): string {
  const normalized = normalizeProviderToken(provider)
  const stripped = normalized.replace(/^(lkg|cached)_+/, '')

  switch (stripped) {
    case 'watttime':
    case 'watttime_moer':
    case 'watttime_moer_forecast':
      return 'WATTTIME_MOER'
    case 'electricity_maps':
      return 'ELECTRICITY_MAPS'
    case 'ember':
    case 'ember_structural':
    case 'ember_structural_baseline':
      return 'EMBER_STRUCTURAL_BASELINE'
    case 'eia930':
    case 'eia_930':
    case 'eia930_direct_subregion_heuristic':
    case 'eia930_gridmonitor_fuel_mix':
      return 'EIA_930'
    case 'gridstatus':
    case 'gridstatus_fuel_mix_ipcc':
      return 'GRIDSTATUS'
    case 'gb_carbon_intensity_api':
    case 'gb_carbon':
      return 'GB_CARBON'
    case 'dk_energi_data_service':
    case 'dk_carbon':
      return 'DK_CARBON'
    case 'fi_fingrid':
    case 'fi_carbon':
      return 'FI_CARBON'
    case 'on_carbon':
      return 'ON_CARBON'
    case 'qc_carbon':
      return 'QC_CARBON'
    case 'bc_carbon':
      return 'BC_CARBON'
    default:
      return provider.trim().toUpperCase().replace(/[\s-]+/g, '_')
  }
}

/**
 * Get provider freshness across all zones.
 * Used for dashboard health panel.
 */
export async function getProviderFreshness(): Promise<Array<{
  provider: string
  latestObservedAt: string
  freshnessSec: number
  isStale: boolean
}>> {
  const [latestSnapshots, integrationMetrics] = await Promise.all([
    prisma.providerSnapshot.findMany({
      orderBy: { observedAt: 'desc' },
      take: 250,
      select: {
        provider: true,
        observedAt: true,
      },
    }),
    prisma.integrationMetric.findMany({
      where: {
        source: {
          in: Object.keys(INTEGRATION_SOURCE_TO_PROVIDER),
        },
      },
      select: {
        source: true,
        lastSuccessAt: true,
      },
    }),
  ])

  const latestByProvider = new Map<string, Date>()
  for (const snapshot of latestSnapshots) {
    const provider = canonicalizeProviderIdentity(snapshot.provider)
    if (!latestByProvider.has(provider)) {
      latestByProvider.set(provider, snapshot.observedAt)
    }
  }

  for (const metric of integrationMetrics) {
    if (!metric.lastSuccessAt) continue
    const provider = INTEGRATION_SOURCE_TO_PROVIDER[metric.source]
    if (!provider) continue

    const currentObservedAt = latestByProvider.get(provider)
    if (!currentObservedAt || metric.lastSuccessAt.getTime() > currentObservedAt.getTime()) {
      latestByProvider.set(provider, metric.lastSuccessAt)
    }
  }

  return Array.from(latestByProvider.entries())
    .map(([provider, observedAt]) => {
      const freshnessSec = Math.floor((Date.now() - observedAt.getTime()) / 1000)
      return {
        provider,
        latestObservedAt: observedAt.toISOString(),
        freshnessSec,
        isStale: freshnessSec > (PROVIDER_FRESHNESS_THRESHOLDS_SEC[provider] ?? 3600),
      }
    })
    .sort((a, b) => a.provider.localeCompare(b.provider))
}

/**
 * Cleanup old snapshots (> 90 days).
 */
export async function cleanupOldSnapshots(retentionDays: number = 90): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const result = await prisma.providerSnapshot.deleteMany({
    where: { observedAt: { lt: cutoff } },
  })
  return result.count
}
