/**
 * ProviderMonitor — non-blocking performance tracking for carbon data providers.
 *
 * Architecture:
 *   - recordProviderCall() is called non-blocking (void) after every
 *     getBestCarbonSignal() / getForecastSignals() call in provider-router.ts
 *   - Uses IntegrationMetric table (keyed by provider name) — upsert with
 *     atomic increments for success/failure counts and rolling latency
 *   - Never throws — monitoring must not affect routing correctness
 *
 * Rolling avg latency:
 *   Stored as totalLatencyMs and totalCalls so the dashboard can compute
 *   avgLatencyMs = totalLatencyMs / totalCalls without loss of precision.
 */

import { prisma } from './db'

export interface ProviderCallRecord {
  provider: string
  region: string
  mode: 'realtime' | 'forecast' | 'historical'
  latencyMs: number
  success: boolean
  error?: string
}

export interface ProviderMetricsSummary {
  provider: string
  successCount: number
  failureCount: number
  totalCalls: number
  successRate: number
  avgLatencyMs: number
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  lastError: string | null
}

/**
 * Record a single provider call outcome.
 * Called non-blocking (void) — any failure is logged and swallowed.
 */
export async function recordProviderCall(call: ProviderCallRecord): Promise<void> {
  try {
    const now = new Date()
    const existing = await (prisma as any).integrationMetric.findUnique({
      where: { source: call.provider },
    })

    if (existing) {
      const newTotalLatency = (existing.totalLatencyMs ?? 0) + call.latencyMs
      const newTotalCalls   = (existing.totalCalls   ?? 0) + 1

      await (prisma as any).integrationMetric.update({
        where: { source: call.provider },
        data: {
          successCount:   call.success ? { increment: 1 } : existing.successCount,
          failureCount:   call.success ? existing.failureCount : { increment: 1 },
          lastSuccessAt:  call.success ? now : existing.lastSuccessAt,
          lastFailureAt:  call.success ? existing.lastFailureAt : now,
          lastError:      call.success ? existing.lastError : (call.error ?? 'unknown error'),
          totalLatencyMs: newTotalLatency,
          totalCalls:     newTotalCalls,
        },
      })
    } else {
      await (prisma as any).integrationMetric.create({
        data: {
          source:         call.provider,
          successCount:   call.success ? 1 : 0,
          failureCount:   call.success ? 0 : 1,
          lastSuccessAt:  call.success ? now : null,
          lastFailureAt:  call.success ? null : now,
          lastError:      call.success ? null : (call.error ?? 'unknown error'),
          totalLatencyMs: call.latencyMs,
          totalCalls:     1,
        },
      })
    }
  } catch (err: any) {
    console.error('[provider-monitor] recordProviderCall failed:', err?.message ?? err)
  }
}

/**
 * Return aggregated metrics for all tracked providers.
 * Returns an empty array if the table is empty or on error.
 */
export async function getAllProviderMetrics(): Promise<ProviderMetricsSummary[]> {
  try {
    const rows = await (prisma as any).integrationMetric.findMany({
      orderBy: { source: 'asc' },
    })
    return rows.map((r: any) => {
      const totalCalls = r.totalCalls ?? r.successCount + r.failureCount
      const avgLatencyMs = totalCalls > 0
        ? Math.round((r.totalLatencyMs ?? 0) / totalCalls)
        : 0
      const successRate = totalCalls > 0
        ? Math.round((r.successCount / totalCalls) * 100) / 100
        : 0
      return {
        provider:       r.source,
        successCount:   r.successCount,
        failureCount:   r.failureCount,
        totalCalls,
        successRate,
        avgLatencyMs,
        lastSuccessAt:  r.lastSuccessAt,
        lastFailureAt:  r.lastFailureAt,
        lastError:      r.lastError,
      }
    })
  } catch (err: any) {
    console.error('[provider-monitor] getAllProviderMetrics failed:', err?.message ?? err)
    return []
  }
}
