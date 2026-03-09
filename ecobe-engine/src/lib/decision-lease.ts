/**
 * Decision Lease — Execution Drift Prevention
 *
 * Every routed decision gets a time-bounded lease tied to its quality tier.
 * Before a queued workload executes, it must call POST /api/v1/route/:id/revalidate
 * to check whether the original routing decision is still valid.
 *
 * Lease durations:
 *   high    → expires in 30 min, re-evaluate at 20 min
 *   medium  → expires in 15 min, re-evaluate at 10 min
 *   low     → expires in  5 min, re-evaluate at  3 min
 */

import { prisma } from './db'
import { routeGreen } from './green-routing'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LeaseFields {
  lease_id: string
  lease_expires_at: string
  must_revalidate_after: string
}

export interface RevalidateResult {
  action: 'execute' | 'reroute' | 'delay' | 'deny'
  reason: string
  region?: string
  carbonIntensity?: number
  originalRegion?: string
  driftDetected?: boolean
  lease_expires_at?: string
}

type QualityTier = 'high' | 'medium' | 'low'

// ─── Lease duration config ────────────────────────────────────────────────────

const LEASE_DURATIONS: Record<QualityTier, { expiresMinutes: number; revalidateMinutes: number }> = {
  high:   { expiresMinutes: 30, revalidateMinutes: 20 },
  medium: { expiresMinutes: 15, revalidateMinutes: 10 },
  low:    { expiresMinutes: 5,  revalidateMinutes: 3  },
}

// ─── createLease ─────────────────────────────────────────────────────────────

/**
 * Creates a DecisionLease record for a routing result and returns the three
 * lease fields to include in the API response.
 *
 * Called fire-and-forget from POST /api/v1/route/green immediately after the
 * decision snapshot is saved.
 */
export async function createLease(
  decisionFrameId: string,
  organizationId: string | undefined,
  result: {
    selectedRegion: string
    carbonIntensity: number
    qualityTier: string
  },
  request: {
    preferredRegions: string[]
    maxCarbonGPerKwh?: number
    carbonWeight?: number
    latencyWeight?: number
    costWeight?: number
  },
  context?: {
    source?: string
    workloadType?: string
  },
): Promise<LeaseFields> {
  const tier: QualityTier = (result.qualityTier in LEASE_DURATIONS)
    ? (result.qualityTier as QualityTier)
    : 'medium'

  const { expiresMinutes, revalidateMinutes } = LEASE_DURATIONS[tier]
  const now = Date.now()
  const leaseExpiresAt = new Date(now + expiresMinutes * 60 * 1000)
  const revalidationRequiredAt = new Date(now + revalidateMinutes * 60 * 1000)

  // Upsert — safe to call more than once for the same decisionFrameId
  await (prisma as any).decisionLease.upsert({
    where: { id: decisionFrameId },
    update: {},
    create: {
      id: decisionFrameId,
      organizationId: organizationId ?? null,
      regions: request.preferredRegions,
      maxCarbonGPerKwh: request.maxCarbonGPerKwh ?? null,
      weights: {
        carbon:  request.carbonWeight  ?? 0.5,
        latency: request.latencyWeight ?? 0.2,
        cost:    request.costWeight    ?? 0.3,
      },
      qualityTier: tier,
      leaseExpiresAt,
      revalidationRequiredAt,
      selectedRegion:  result.selectedRegion,
      carbonIntensity: result.carbonIntensity,
      source:          context?.source ?? null,
      workloadType:    context?.workloadType ?? null,
      status: 'VALID',
    },
  })

  return {
    lease_id:              decisionFrameId,
    lease_expires_at:      leaseExpiresAt.toISOString(),
    must_revalidate_after: revalidationRequiredAt.toISOString(),
  }
}

// ─── revalidateLease ─────────────────────────────────────────────────────────

/**
 * Called by POST /api/v1/route/:id/revalidate.
 *
 * 1. If within lease window → return execute (no re-routing needed).
 * 2. If expired → re-run routing with original request params.
 *    - Same region still wins → execute, update lease.
 *    - Different region wins → reroute, record drift event.
 */
export async function revalidateLease(
  leaseId: string,
  callerOrgId?: string,
): Promise<RevalidateResult> {
  const lease = await (prisma as any).decisionLease.findUnique({
    where: { id: leaseId },
  })

  if (!lease) {
    return { action: 'deny', reason: 'lease_not_found' }
  }

  // Org isolation
  if (callerOrgId && lease.organizationId && lease.organizationId !== callerOrgId) {
    return { action: 'deny', reason: 'access_denied' }
  }

  const now = new Date()

  // Within valid lease window — execute without re-routing
  if (lease.status === 'VALID' && now < new Date(lease.leaseExpiresAt)) {
    return {
      action:         'execute',
      reason:         'lease_valid',
      region:         lease.selectedRegion,
      carbonIntensity: lease.carbonIntensity,
      driftDetected:  false,
      lease_expires_at: new Date(lease.leaseExpiresAt).toISOString(),
    }
  }

  // Lease expired or approaching revalidation window — re-route
  const weights = lease.weights as { carbon?: number; latency?: number; cost?: number }

  let freshResult: Awaited<ReturnType<typeof routeGreen>>
  try {
    freshResult = await routeGreen({
      preferredRegions: lease.regions as string[],
      maxCarbonGPerKwh: lease.maxCarbonGPerKwh ?? undefined,
      carbonWeight:     weights.carbon,
      latencyWeight:    weights.latency,
      costWeight:       weights.cost,
    })
  } catch {
    return { action: 'delay', reason: 'routing_unavailable' }
  }

  const driftDetected = freshResult.selectedRegion !== lease.selectedRegion
  const action: RevalidateResult['action'] = driftDetected ? 'reroute' : 'execute'
  const reason = driftDetected ? 'cleaner_region_found' : 'decision_confirmed'

  // Extend lease for re-confirmed decisions
  const tier: QualityTier = (freshResult.qualityTier in LEASE_DURATIONS)
    ? (freshResult.qualityTier as QualityTier)
    : 'medium'
  const { expiresMinutes } = LEASE_DURATIONS[tier]
  const newLeaseExpiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000)

  await (prisma as any).decisionLease.update({
    where: { id: leaseId },
    data: {
      status:            'REVALIDATED',
      revalidatedAt:     now,
      revalidationAction: action,
      revalidationReason: reason,
      driftDetected,
      newRegion:         driftDetected ? freshResult.selectedRegion : null,
      // Extend window on re-confirmed decisions so systems don't thrash
      leaseExpiresAt:    driftDetected ? lease.leaseExpiresAt : newLeaseExpiresAt,
    },
  })

  // Persist drift event for dashboard metrics
  if (driftDetected) {
    await (prisma as any).executionDriftEvent.create({
      data: {
        organizationId:  lease.organizationId,
        decisionLeaseId: leaseId,
        originalRegion:  lease.selectedRegion,
        newRegion:       freshResult.selectedRegion,
        originalIntensity: lease.carbonIntensity,
        newIntensity:    freshResult.carbonIntensity,
        reason,
      },
    })
  }

  return {
    action,
    reason,
    region:          freshResult.selectedRegion,
    carbonIntensity: freshResult.carbonIntensity,
    originalRegion:  lease.selectedRegion,
    driftDetected,
    lease_expires_at: newLeaseExpiresAt.toISOString(),
  }
}
