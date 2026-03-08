import { prisma } from '../db'
import { writeAuditLog } from './audit'

/**
 * Non-blocking anomaly detection — compares a routing decision's carbon intensity
 * against the org's rolling 30-day mean + σ. If the z-score exceeds the org's
 * configured threshold, an ANOMALY_DETECTED audit record is written.
 *
 * Intentionally fire-and-forget (called with void). Never delays the response.
 */
export async function detectAnomaly(params: {
  organizationId?: string
  carbonIntensityChosenGPerKwh: number
  entityId: string
  entityType: string
}): Promise<void> {
  if (!params.organizationId) return

  const policy = await (prisma as any).organizationPolicy.findUnique({
    where: { organizationId: params.organizationId },
  })
  if (!policy?.anomalyDetectionEnabled) return

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const historicalResult = await (prisma as any).dashboardRoutingDecision.aggregate({
    where: { createdAt: { gte: thirtyDaysAgo } },
    _avg: { carbonIntensityChosenGPerKwh: true },
    _count: { id: true },
  })

  const mean: number = historicalResult._avg.carbonIntensityChosenGPerKwh ?? 0
  if (historicalResult._count.id < 10) return // not enough history for reliable σ

  const stddevResult = await (prisma as any).$queryRaw<Array<{ stddev: number }>>`
    SELECT STDDEV("carbonIntensityChosenGPerKwh") as stddev
    FROM "DashboardRoutingDecision"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    AND "carbonIntensityChosenGPerKwh" IS NOT NULL
  `
  const stddev: number = stddevResult[0]?.stddev ?? 0
  if (stddev === 0) return

  const zScore = Math.abs(params.carbonIntensityChosenGPerKwh - mean) / stddev

  if (zScore > policy.anomalyThresholdSigma) {
    void writeAuditLog({
      organizationId: params.organizationId,
      actorType: 'SYSTEM',
      action: 'ANOMALY_DETECTED',
      entityType: params.entityType,
      entityId: params.entityId,
      payload: {
        zScore: Math.round(zScore * 100) / 100,
        carbonIntensityChosenGPerKwh: params.carbonIntensityChosenGPerKwh,
        mean: Math.round(mean * 10) / 10,
        stddev: Math.round(stddev * 10) / 10,
        threshold: policy.anomalyThresholdSigma,
      },
      result: 'SUCCESS',
    })
  }
}
