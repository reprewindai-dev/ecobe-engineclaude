/**
 * Provider Snapshot Storage — Routing Spec v1
 *
 * Persists provider signal values at decision time for full audit trail.
 * Stores WattTime, Electricity Maps, Ember, and EIA-930 snapshots.
 */

import { env } from '../../config/env'
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
    await prisma.providerSnapshot.upsert({
      where: {
        provider_zone_signalType_observedAt: {
          provider: snapshot.provider,
          zone: snapshot.zone,
          signalType: snapshot.signalType,
          observedAt: snapshot.observedAt,
        },
      },
      create: {
        provider: snapshot.provider,
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
}

const CANONICAL_PROVIDER_ORDER = [
  'WATTTIME_MOER',
  'GRIDSTATUS',
  'EIA_930',
  'GB_CARBON',
  'DK_CARBON',
  'FI_CARBON',
  'EMBER_STRUCTURAL_BASELINE',
  'ELECTRICITY_MAPS',
] as const

const PROVIDER_CONFIGURATION: Record<string, () => boolean> = {
  WATTTIME_MOER: () => Boolean(env.WATTTIME_USERNAME && env.WATTTIME_PASSWORD),
  GRIDSTATUS: () => Boolean(env.GRIDSTATUS_API_KEY),
  EIA_930: () => Boolean(env.EIA_API_KEY),
  GB_CARBON: () => true,
  DK_CARBON: () => true,
  FI_CARBON: () => Boolean(env.FINGRID_API_KEY),
  EMBER_STRUCTURAL_BASELINE: () => Boolean(env.EMBER_API_KEY),
  ELECTRICITY_MAPS: () => Boolean(env.ELECTRICITY_MAPS_API_KEY),
}

const INTEGRATION_SOURCE_TO_PROVIDER: Record<string, string> = {
  ELECTRICITY_MAPS: 'ELECTRICITY_MAPS',
  WATTTIME: 'WATTTIME_MOER',
  GRIDSTATUS: 'GRIDSTATUS',
  EIA_930: 'EIA_930',
  EMBER: 'EMBER_STRUCTURAL_BASELINE',
  GB_CARBON: 'GB_CARBON',
  DK_CARBON: 'DK_CARBON',
  FI_CARBON: 'FI_CARBON',
}

function normalizeProviderToken(provider: string): string {
  return provider.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function canonicalizeProviderIdentity(provider: string): string {
  const normalized = normalizeProviderToken(provider)

  switch (normalized) {
    case 'watttime':
    case 'watttime_moer':
      return 'WATTTIME_MOER'
    case 'electricity_maps':
      return 'ELECTRICITY_MAPS'
    case 'ember':
    case 'ember_structural':
    case 'ember_structural_baseline':
      return 'EMBER_STRUCTURAL_BASELINE'
    case 'eia930':
    case 'eia_930':
      return 'EIA_930'
    case 'gridstatus':
      return 'GRIDSTATUS'
    case 'gb_carbon':
      return 'GB_CARBON'
    case 'dk_carbon':
      return 'DK_CARBON'
    case 'fi_carbon':
      return 'FI_CARBON'
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
  latestObservedAt: string | null
  freshnessSec: number | null
  isStale: boolean
  configured: boolean
  status: 'healthy' | 'degraded' | 'offline'
  statusReasonCode: 'HEALTHY_LIVE' | 'DEGRADED_STALE' | 'DEGRADED_RATE_LIMIT' | 'OFFLINE'
  ttlSec: number
  lastError: string | null
  lastLatencyMs: number | null
}>> {
  type IntegrationMetricSummary = {
    source: string
    lastSuccessAt: Date | null
    lastError: string | null
    lastLatencyMs: number | null
  }

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
        lastError: true,
        lastLatencyMs: true,
      },
    }),
  ])
  const typedIntegrationMetrics = integrationMetrics as IntegrationMetricSummary[]

  const latestByProvider = new Map<string, Date>()
  for (const snapshot of latestSnapshots) {
    const provider = canonicalizeProviderIdentity(snapshot.provider)
    if (!latestByProvider.has(provider)) {
      latestByProvider.set(provider, snapshot.observedAt)
    }
  }

  for (const metric of typedIntegrationMetrics) {
    if (!metric.lastSuccessAt) continue
    const provider = INTEGRATION_SOURCE_TO_PROVIDER[metric.source]
    if (!provider) continue

    const currentObservedAt = latestByProvider.get(provider)
    if (!currentObservedAt || metric.lastSuccessAt.getTime() > currentObservedAt.getTime()) {
      latestByProvider.set(provider, metric.lastSuccessAt)
    }
  }

  const metricByProvider = new Map(
    typedIntegrationMetrics
      .map((metric) => {
        const provider = INTEGRATION_SOURCE_TO_PROVIDER[metric.source]
        if (!provider) return null
        return [provider, metric] as const
      })
      .filter((entry): entry is readonly [string, IntegrationMetricSummary] => entry !== null)
  )

  const discoveredProviders = new Set<string>([
    ...CANONICAL_PROVIDER_ORDER,
    ...Array.from(latestByProvider.keys()),
    ...Array.from(metricByProvider.keys()),
  ])

  return Array.from(discoveredProviders)
    .map((provider) => {
      const configured = PROVIDER_CONFIGURATION[provider]?.() ?? true
      const observedAt = configured ? latestByProvider.get(provider) ?? null : null
      const freshnessSec =
        observedAt != null ? Math.floor((Date.now() - observedAt.getTime()) / 1000) : null
      const ttlSec = PROVIDER_FRESHNESS_THRESHOLDS_SEC[provider] ?? 3600
      const isStale = configured && (freshnessSec == null || freshnessSec > ttlSec)
      const metric = metricByProvider.get(provider)
      const lastError = metric?.lastError ?? null
      const lowerLastError = lastError?.toLowerCase() ?? ''
      const rateLimited =
        lowerLastError.includes('429') ||
        lowerLastError.includes('rate limit') ||
        lowerLastError.includes('quota')
      const status: 'healthy' | 'degraded' | 'offline' = !configured
        ? 'offline'
        : isStale
          ? 'degraded'
          : 'healthy'
      const statusReasonCode: 'HEALTHY_LIVE' | 'DEGRADED_STALE' | 'DEGRADED_RATE_LIMIT' | 'OFFLINE' = !configured
        ? 'OFFLINE'
        : isStale && rateLimited
          ? 'DEGRADED_RATE_LIMIT'
          : isStale
            ? 'DEGRADED_STALE'
            : 'HEALTHY_LIVE'

      return {
        provider,
        latestObservedAt: observedAt?.toISOString() ?? null,
        freshnessSec,
        isStale,
        configured,
        status,
        statusReasonCode,
        ttlSec,
        lastError,
        lastLatencyMs: metric?.lastLatencyMs ?? null,
      }
    })
    .sort((a, b) => {
      const aIndex = CANONICAL_PROVIDER_ORDER.indexOf(a.provider as (typeof CANONICAL_PROVIDER_ORDER)[number])
      const bIndex = CANONICAL_PROVIDER_ORDER.indexOf(b.provider as (typeof CANONICAL_PROVIDER_ORDER)[number])

      if (aIndex === -1 && bIndex === -1) {
        return a.provider.localeCompare(b.provider)
      }
      if (aIndex === -1) {
        return 1
      }
      if (bIndex === -1) {
        return -1
      }

      return aIndex - bIndex
    })
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
