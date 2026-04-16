import cron, { type ScheduledTask } from 'node-cron'
import type { WorkloadDecisionOutcome } from '@prisma/client'

import { env } from '../config/env'
import { prisma } from '../lib/db'
import { setWorkerStatus } from '../routes/system'

let dsLearningTask: ScheduledTask | null = null
let running = false

type TrendyBaselineRecord = {
  region: string
  timeBucket: Date
  sourceClass: string
  gppBaseline: number
  sinkConfidence: number
  nbpBaseline: number
  datasetVersion: string
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function round4(value: number) {
  return Number(value.toFixed(4))
}

function toMonthBucket(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1))
}

export async function refreshDecisionSystemScores(): Promise<void> {
  if (running) return
  running = true

  const runStart = new Date()
  const trendyShadowEnabled = env.TRENDY_SHADOW_ENABLED

  try {
    const lookbackHours = Math.max(24, env.DS_EVENT_LOOKBACK_HOURS)
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)

    const [events, decisions, outcomes, trendyBaselines] = await Promise.all([
      prisma.decisionSystemEvent.findMany({
        where: { occurredAt: { gte: since } },
        orderBy: { occurredAt: 'desc' },
      }),
      prisma.cIDecision.findMany({
        where: { createdAt: { gte: since } },
        select: {
          decisionFrameId: true,
          selectedRegion: true,
          fallbackUsed: true,
          signalConfidence: true,
          savings: true,
          workloadClass: true,
          recommendationAccepted: true,
          routerOverrideReason: true,
          decisionAction: true,
          metadata: true,
          policyTrace: true,
          createdAt: true,
        },
      }),
      prisma.workloadDecisionOutcome.findMany({
        where: { createdAt: { gte: since } },
        select: {
          workloadId: true,
          region: true,
          carbonSaved: true,
          latency: true,
          cost: true,
          success: true,
          createdAt: true,
        },
      }),
      trendyShadowEnabled
        ? prisma.trendyBaselineSnapshot.findMany({
            orderBy: { timeBucket: 'desc' },
          })
        : Promise.resolve([]),
    ])

    const providerBuckets = new Map<
      string,
      {
        tenantKey: string
        providerClass: string
        sampleCount: number
        freshnessScoreSum: number
        agreementScoreSum: number
        fallbackCount: number
        degradedCount: number
      }
    >()

    for (const event of events) {
      if (event.eventType !== 'provider.posture.observed' || !event.providerKey) continue
      const payload = (event.payload ?? {}) as Record<string, unknown>
      const freshnessSec =
        typeof payload.freshnessSec === 'number' ? payload.freshnessSec : Number.NaN
      const disagreementPct =
        typeof payload.disagreementPct === 'number' ? payload.disagreementPct : 0
      const fallbackUsed = Boolean(payload.fallbackUsed)
      const providerClass =
        typeof payload.providerClass === 'string' ? payload.providerClass : 'unknown'
      const bucketKey = `${event.tenantKey}:${event.providerKey}`
      const bucket = providerBuckets.get(bucketKey) ?? {
        tenantKey: event.tenantKey,
        providerClass,
        sampleCount: 0,
        freshnessScoreSum: 0,
        agreementScoreSum: 0,
        fallbackCount: 0,
        degradedCount: 0,
      }

      bucket.sampleCount += 1
      bucket.freshnessScoreSum += Number.isFinite(freshnessSec)
        ? clamp01(1 - freshnessSec / 3600)
        : 0.35
      bucket.agreementScoreSum += clamp01(1 - disagreementPct / 100)
      if (fallbackUsed) bucket.fallbackCount += 1
      if ((event.outcomeStatus ?? '').toLowerCase() !== 'healthy') bucket.degradedCount += 1
      providerBuckets.set(bucketKey, bucket)
    }

    if (providerBuckets.size > 0) {
      await prisma.providerTrustScoreSnapshot.createMany({
        data: Array.from(providerBuckets.entries()).map(([bucketKey, bucket]) => {
          const [, providerKey] = bucketKey.split(':', 2)
          const freshnessScore = clamp01(bucket.freshnessScoreSum / bucket.sampleCount)
          const agreementScore = clamp01(bucket.agreementScoreSum / bucket.sampleCount)
          const fallbackRate = bucket.fallbackCount / bucket.sampleCount
          const degradedRate = bucket.degradedCount / bucket.sampleCount
          const trustScore = clamp01(
            freshnessScore * 0.45 + agreementScore * 0.3 + (1 - fallbackRate) * 0.15 + (1 - degradedRate) * 0.1
          )

          return {
            tenantKey: bucket.tenantKey,
            providerKey,
            providerClass: bucket.providerClass,
            trustScore: round4(trustScore),
            freshnessScore: round4(freshnessScore),
            agreementScore: round4(agreementScore),
            fallbackRate: round4(fallbackRate),
            degradedRate: round4(degradedRate),
            sampleCount: bucket.sampleCount,
            windowHours: lookbackHours,
            observedAt: runStart,
            metadata: {
              generatedBy: 'ds_learning_loop_v1',
            },
          }
        }),
      })
    }

    const outcomeByDecision = new Map<string, WorkloadDecisionOutcome>(
      outcomes.map((outcome: WorkloadDecisionOutcome) => [outcome.workloadId, outcome])
    )
    const trendyByRegionMonth = new Map<string, TrendyBaselineRecord>(
      trendyBaselines.map((baseline: TrendyBaselineRecord) => [
        `${baseline.region}:${toMonthBucket(baseline.timeBucket).toISOString()}`,
        baseline,
      ])
    )
    const doctrineBuckets = new Map<
      string,
      {
        tenantKey: string
        doctrineVersion: string
        sampleCount: number
        successCount: number
        overrideCount: number
        fallbackCount: number
        confidenceSum: number
        savingsSum: number
      }
    >()

    const workloadBuckets = new Map<
      string,
      {
        tenantKey: string
        workloadClass: string
        sampleCount: number
        successCount: number
        overrideCount: number
        latencySum: number
        carbonSavedSum: number
        regions: Map<string, number>
        lastOutcomeAt: Date | null
      }
    >()

    for (const decision of decisions) {
      const metadata = (decision.metadata ?? {}) as Record<string, unknown>
      const tenantKey =
        typeof metadata.tenantId === 'string'
          ? metadata.tenantId
          : typeof metadata.orgId === 'string'
            ? metadata.orgId
            : 'public'
      const policyTrace = (decision.policyTrace ?? {}) as Record<string, unknown>
      const doctrineProfile =
        typeof policyTrace.profile === 'string' ? policyTrace.profile : 'default'
      const doctrineVersion =
        typeof policyTrace.policyVersion === 'string' ? policyTrace.policyVersion : 'unknown'
      const doctrineKey = `${tenantKey}:${doctrineProfile}:${doctrineVersion}`
      const outcome = outcomeByDecision.get(decision.decisionFrameId)
      const metadataResponse = typeof decision.metadata === 'object' && decision.metadata
        ? ((decision.metadata as Record<string, unknown>).response as Record<string, unknown> | undefined)
        : undefined
      const disagreementRecord =
        metadataResponse && typeof metadataResponse.mss === 'object'
          ? ((metadataResponse.mss as Record<string, unknown>).disagreement as Record<string, unknown> | undefined)
          : undefined
      const disagreementBefore =
        disagreementRecord && typeof disagreementRecord.pct === 'number'
          ? disagreementRecord.pct
          : null
      const baselineConfidence = clamp01(typeof decision.signalConfidence === 'number' ? decision.signalConfidence : 0.5)
      const trendyKey = `${decision.selectedRegion}:${toMonthBucket(decision.createdAt).toISOString()}`
      const trendyBaseline: TrendyBaselineRecord | undefined = trendyByRegionMonth.get(trendyKey)
      const trendyConfidenceModifier = trendyBaseline
        ? clamp01((trendyBaseline.sinkConfidence * 0.08) + clamp01(trendyBaseline.nbpBaseline / 0.2) * 0.04)
        : 0
      const enrichedConfidence = clamp01(baselineConfidence + trendyConfidenceModifier)
      const disagreementAfter =
        disagreementBefore == null ? null : round4(Math.max(0, disagreementBefore * (1 - trendyConfidenceModifier * 0.35)))
      const baselineRegret = outcome
        ? outcome.success
          ? 0
          : 1
        : decision.routerOverrideReason || decision.recommendationAccepted === false || decision.fallbackUsed
          ? 0.65
          : 0.2
      const regretAfter = round4(Math.max(0, baselineRegret - trendyConfidenceModifier * 0.3))

      const doctrineBucket = doctrineBuckets.get(doctrineKey) ?? {
        tenantKey,
        doctrineVersion,
        sampleCount: 0,
        successCount: 0,
        overrideCount: 0,
        fallbackCount: 0,
        confidenceSum: 0,
        savingsSum: 0,
      }
      doctrineBucket.sampleCount += 1
      if (decision.routerOverrideReason || decision.recommendationAccepted === false) doctrineBucket.overrideCount += 1
      if (decision.fallbackUsed) doctrineBucket.fallbackCount += 1
      if (typeof decision.signalConfidence === 'number') doctrineBucket.confidenceSum += decision.signalConfidence
      doctrineBucket.savingsSum += Number.isFinite(decision.savings) ? decision.savings : 0
      if (!outcome || outcome.success) doctrineBucket.successCount += 1
      doctrineBuckets.set(doctrineKey, doctrineBucket)

      if (trendyShadowEnabled && trendyBaseline) {
        await prisma.trendyShadowEvaluation.upsert({
          where: {
            decisionFrameId_datasetVersion: {
              decisionFrameId: decision.decisionFrameId,
              datasetVersion: trendyBaseline.datasetVersion,
            },
          },
          update: {
            tenantKey,
            region: decision.selectedRegion,
            workloadClass: decision.workloadClass ?? 'generic_compute',
            timeBucket: trendyBaseline.timeBucket,
            baselineConfidence: round4(baselineConfidence),
            baselinePlusTrendyConfidence: round4(enrichedConfidence),
            trendyConfidenceModifier: round4(trendyConfidenceModifier),
            providerDisagreementBefore: disagreementBefore == null ? null : round4(disagreementBefore),
            providerDisagreementAfter: disagreementAfter,
            decisionRegretBefore: round4(baselineRegret),
            decisionRegretAfter: regretAfter,
            metadata: {
              shadow: true,
              sourceClass: trendyBaseline.sourceClass,
              liveRoutingAuthority: false,
              enabledAtEvaluation: true,
              nbpBaseline: trendyBaseline.nbpBaseline,
              gppBaseline: trendyBaseline.gppBaseline,
              sinkConfidence: trendyBaseline.sinkConfidence,
            },
            observedAt: runStart,
          },
          create: {
            tenantKey,
            decisionFrameId: decision.decisionFrameId,
            region: decision.selectedRegion,
            workloadClass: decision.workloadClass ?? 'generic_compute',
            timeBucket: trendyBaseline.timeBucket,
            datasetVersion: trendyBaseline.datasetVersion,
            baselineConfidence: round4(baselineConfidence),
            baselinePlusTrendyConfidence: round4(enrichedConfidence),
            trendyConfidenceModifier: round4(trendyConfidenceModifier),
            providerDisagreementBefore: disagreementBefore == null ? null : round4(disagreementBefore),
            providerDisagreementAfter: disagreementAfter,
            decisionRegretBefore: round4(baselineRegret),
            decisionRegretAfter: regretAfter,
            metadata: {
              shadow: true,
              sourceClass: trendyBaseline.sourceClass,
              liveRoutingAuthority: false,
              enabledAtEvaluation: true,
              nbpBaseline: trendyBaseline.nbpBaseline,
              gppBaseline: trendyBaseline.gppBaseline,
              sinkConfidence: trendyBaseline.sinkConfidence,
            },
            observedAt: runStart,
          },
        })
      }

      const workloadClass = decision.workloadClass ?? 'generic_compute'
      const workloadKey = `${tenantKey}:${workloadClass}`
      const workloadBucket = workloadBuckets.get(workloadKey) ?? {
        tenantKey,
        workloadClass,
        sampleCount: 0,
        successCount: 0,
        overrideCount: 0,
        latencySum: 0,
        carbonSavedSum: 0,
        regions: new Map<string, number>(),
        lastOutcomeAt: null,
      }

      workloadBucket.sampleCount += 1
      if (decision.routerOverrideReason || decision.recommendationAccepted === false) workloadBucket.overrideCount += 1
      if (!outcome || outcome.success) workloadBucket.successCount += 1
      if (outcome) {
        workloadBucket.latencySum += outcome.latency
        workloadBucket.carbonSavedSum += outcome.carbonSaved
        workloadBucket.lastOutcomeAt =
          !workloadBucket.lastOutcomeAt || workloadBucket.lastOutcomeAt < outcome.createdAt
            ? outcome.createdAt
            : workloadBucket.lastOutcomeAt
      }
      if (decision.selectedRegion) {
        workloadBucket.regions.set(
          decision.selectedRegion,
          (workloadBucket.regions.get(decision.selectedRegion) ?? 0) + 1
        )
      }
      workloadBuckets.set(workloadKey, workloadBucket)
    }

    if (doctrineBuckets.size > 0) {
      await prisma.doctrineScoreSnapshot.createMany({
        data: Array.from(doctrineBuckets.entries()).map(([doctrineKey, bucket]) => {
          const successRate = bucket.successCount / bucket.sampleCount
          const overrideRate = bucket.overrideCount / bucket.sampleCount
          const fallbackRate = bucket.fallbackCount / bucket.sampleCount
          const avgConfidence = bucket.confidenceSum / bucket.sampleCount
          const avgSavingsPct = bucket.savingsSum / bucket.sampleCount
          const trustScore = clamp01(
            successRate * 0.45 + avgConfidence * 0.25 + (1 - overrideRate) * 0.15 + (1 - fallbackRate) * 0.15
          )

          return {
            tenantKey: bucket.tenantKey,
            doctrineKey,
            doctrineVersion: bucket.doctrineVersion,
            trustScore: round4(trustScore),
            overrideRate: round4(overrideRate),
            fallbackRate: round4(fallbackRate),
            successRate: round4(successRate),
            avgConfidence: round4(avgConfidence),
            avgSavingsPct: round4(avgSavingsPct),
            sampleCount: bucket.sampleCount,
            windowHours: lookbackHours,
            observedAt: runStart,
            metadata: {
              generatedBy: 'ds_learning_loop_v1',
            },
          }
        }),
      })
    }

    for (const bucket of workloadBuckets.values()) {
      const orderedRegions = Array.from(bucket.regions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([region, count]) => ({ region, count }))
      const successRate = bucket.successCount / bucket.sampleCount
      const overrideRate = bucket.overrideCount / bucket.sampleCount
      const avgLatencyMs = bucket.sampleCount > 0 ? bucket.latencySum / bucket.sampleCount : 0
      const avgCarbonSaved = bucket.sampleCount > 0 ? bucket.carbonSavedSum / bucket.sampleCount : 0
      const safeDelayWindowMinutes = Math.max(5, Math.min(240, Math.round(successRate * 120)))
      const confidence = clamp01(successRate * 0.6 + (1 - overrideRate) * 0.4)

      await prisma.tenantWorkloadLearningProfile.upsert({
        where: {
          tenantKey_workloadClass: {
            tenantKey: bucket.tenantKey,
            workloadClass: bucket.workloadClass,
          },
        },
        update: {
          sampleCount: bucket.sampleCount,
          successRate: round4(successRate),
          overrideRate: round4(overrideRate),
          avgLatencyMs: round4(avgLatencyMs),
          avgCarbonSaved: round4(avgCarbonSaved),
          safeDelayWindowMinutes,
          preferredRegions: orderedRegions,
          confidence: round4(confidence),
          lastOutcomeAt: bucket.lastOutcomeAt,
        },
        create: {
          tenantKey: bucket.tenantKey,
          workloadClass: bucket.workloadClass,
          sampleCount: bucket.sampleCount,
          successRate: round4(successRate),
          overrideRate: round4(overrideRate),
          avgLatencyMs: round4(avgLatencyMs),
          avgCarbonSaved: round4(avgCarbonSaved),
          safeDelayWindowMinutes,
          preferredRegions: orderedRegions,
          confidence: round4(confidence),
          lastOutcomeAt: bucket.lastOutcomeAt,
        },
      })
    }

    setWorkerStatus('decisionSystemLearning', {
      running: true,
      lastRun: runStart.toISOString(),
      nextRun: null,
    })
  } catch (error) {
    console.error('Decision system learning refresh failed:', error)
    setWorkerStatus('decisionSystemLearning', {
      running: false,
      lastRun: runStart.toISOString(),
      nextRun: null,
    })
  } finally {
    running = false
  }
}

export function startDecisionSystemLearningWorker() {
  if (!env.DS_LEARNING_LOOP_ENABLED) {
    console.log('Decision system learning worker disabled')
    setWorkerStatus('decisionSystemLearning', {
      running: false,
      lastRun: null,
      nextRun: null,
    })
    return
  }

  if (dsLearningTask) return

  setWorkerStatus('decisionSystemLearning', {
    running: true,
    lastRun: null,
    nextRun: null,
  })

  dsLearningTask = cron.schedule(env.DS_LEARNING_LOOP_CRON, () => {
    refreshDecisionSystemScores().catch((error) => {
      console.error('Decision system learning cron run failed:', error)
    })
  })

  refreshDecisionSystemScores().catch((error) => {
    console.error('Decision system learning initial run failed:', error)
  })

  console.log(`Decision system learning worker scheduled (${env.DS_LEARNING_LOOP_CRON})`)
}

export function stopDecisionSystemLearningWorker() {
  if (dsLearningTask) {
    dsLearningTask.stop()
    dsLearningTask = null
  }
  setWorkerStatus('decisionSystemLearning', {
    running: false,
  })
}
