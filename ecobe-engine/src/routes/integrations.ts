import { Router } from 'express'
import crypto from 'crypto'
import { z } from 'zod'
import { processDecisionEventOutboxBatch, createTestEventForSink } from '../lib/ci/decision-events'
import { env } from '../config/env'
import { prisma } from '../lib/db'
import {
  buildDekesArtifactLinks,
  parseDekesHandoffNotes,
  toDekesForecastStability,
  toDekesHandoffClassification,
  toDekesHandoffEventType,
  toDekesHandoffSeverity,
  toDekesHandoffStatus,
  toDekesQualityTier,
} from '../lib/dekes/canonical'
import { recordTelemetryMetric, telemetryMetricNames } from '../lib/observability/telemetry'
import { internalServiceGuard } from '../middleware/internal-auth'

const router = Router()

function parseJsonRecord(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : {}
    } catch {
      return {}
    }
  }
  return typeof value === 'object' ? (value as Record<string, any>) : {}
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null
  if (typeof value === 'string') return value
  return value.toISOString()
}

/**
 * GET /api/v1/integrations/dekes/summary
 * Returns DEKES integration summary
 */
router.get('/dekes/summary', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [workloads, prospects, handoffs, recentEvents] = await Promise.all([
      prisma.dekesWorkload.findMany({
        where: { scheduledTime: { gte: since } },
        select: {
          actualCO2: true,
          estimatedQueries: true,
          status: true,
          scheduledTime: true,
        },
      }),
      prisma.dekesProspect.findMany({
        where: { createdAt: { gte: since } },
        select: {
          id: true,
          status: true,
          intentScore: true,
          updatedAt: true,
        },
      }),
      prisma.dekesHandoffEvent.findMany({
        where: { createdAt: { gte: since } },
        select: {
          status: true,
          qualificationScore: true,
          updatedAt: true,
        },
      }),
      prisma.integrationEvent.findMany({
        where: {
          source: 'DEKES_INTEGRATION',
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ])

    const successfulCount = workloads.filter((w: any) => ['REPORTED', 'COMPLETED', 'ROUTED'].includes(w.status)).length
    const totalCO2 = workloads.reduce((sum: number, w: any) => sum + (w.actualCO2 ?? 0), 0)
    const avgCO2 = workloads.length > 0 ? totalCO2 / workloads.length : 0
    const qualifiedProspects = prospects.filter((p: any) => (p.intentScore ?? 0) >= 70).length
    const acceptedHandoffs = handoffs.filter((handoff: any) => handoff.status === 'ACCEPTED').length
    const routedHandoffs = handoffs.filter((handoff: any) => handoff.status === 'ROUTED').length
    const proofedHandoffs = handoffs.filter((handoff: any) => handoff.status === 'PROOFED').length
    const failedHandoffs = handoffs.filter((handoff: any) => handoff.status === 'FAILED').length

    return res.json({
      status: failedHandoffs > 0 ? 'degraded' : 'connected',
      integration: 'DEKES',
      lastSync: new Date().toISOString(),
      metrics: {
        totalProspects: prospects.length,
        qualifiedProspects,
        totalHandoffs: handoffs.length,
        acceptedHandoffs,
        routedHandoffs,
        proofedHandoffs,
        failedHandoffs,
        totalWorkloads: workloads.length,
        successfulWorkloads: successfulCount,
        successRate: workloads.length > 0 ? Math.round((successfulCount / workloads.length) * 100) : 0,
        totalCO2Kg: Math.round(totalCO2 * 1000) / 1000,
        avgCO2PerWorkload: Math.round(avgCO2 * 1000) / 1000,
        timeRange: `${days}d`,
      },
      recentSignals: recentEvents.map((event: any) => ({
        id: event.id,
        type: event.eventType || 'INTEGRATION_EVENT',
        success: event.success,
        timestamp: event.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('DEKES integration summary error:', error)
    res.status(500).json({ error: 'Failed to fetch DEKES summary' })
  }
})

/**
 * GET /api/v1/integrations/dekes/events
 * Returns recent DEKES integration events
 */
router.get('/dekes/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const hours = parseInt(req.query.hours as string) || 24
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)

    const events = await prisma.integrationEvent.findMany({
      where: {
        source: 'DEKES_INTEGRATION',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const formattedEvents = events.map((event: any) => {
      let message = event.message
      try {
        const parsed = typeof event.message === 'string' ? JSON.parse(event.message) : event.message
        message = parsed
      } catch {
        // Keep as string
      }

      return {
        id: event.id,
        timestamp: event.createdAt.toISOString(),
        type: event.eventType || 'INTEGRATION_EVENT',
        message,
        status: event.success ? 'success' : 'error',
      }
    })

    return res.json({
      source: 'DEKES_INTEGRATION',
      timeRange: `${hours}h`,
      events: formattedEvents,
      total: formattedEvents.length,
    })
  } catch (error) {
    console.error('DEKES integration events error:', error)
    res.status(500).json({ error: 'Failed to fetch DEKES events' })
  }
})

/**
 * GET /api/v1/integrations/dekes/metrics
 * Returns DEKES integration health metrics
 */
router.get('/dekes/metrics', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 168 // 1 week default

    // Get recent events
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)

    const [successEvents, failureEvents, totalWorkloads] = await Promise.all([
      prisma.integrationEvent.count({
        where: {
          source: 'DEKES_INTEGRATION',
          createdAt: { gte: since },
          success: true,
        },
      }),
      prisma.integrationEvent.count({
        where: {
          source: 'DEKES_INTEGRATION',
          createdAt: { gte: since },
          success: false,
        },
      }),
      prisma.dekesWorkload.count({
        where: { scheduledTime: { gte: since } },
      }),
    ])

    const totalEvents = successEvents + failureEvents
    const successRate = totalEvents > 0 ? Math.round((successEvents / totalEvents) * 100) : 100
    const failureRate = totalEvents > 0 ? Math.round((failureEvents / totalEvents) * 100) : 0

    // Get hourly trend
    const workloads = await prisma.dekesWorkload.findMany({
      where: { scheduledTime: { gte: since } },
      select: { scheduledTime: true, actualCO2: true },
      orderBy: { scheduledTime: 'desc' },
    })

    const hourlyMap = new Map<string, { count: number; co2: number }>()
    for (const w of workloads) {
      const hour = w.scheduledTime.toISOString().split(':')[0] + ':00'
      const existing = hourlyMap.get(hour) || { count: 0, co2: 0 }
      existing.count++
      existing.co2 += w.actualCO2 ?? 0
      hourlyMap.set(hour, existing)
    }

    const hourlyTrend = Array.from(hourlyMap.entries())
      .map(([hour, data]: [string, any]) => ({
        hour,
        requestCount: data.count,
        avgCO2: Math.round((data.co2 / data.count) * 1000) / 1000,
      }))
      .sort((a, b) => a.hour.localeCompare(b.hour))

    // Calculate actual average response time from workload durations
    const completedWorkloads = await prisma.dekesWorkload.findMany({
      where: {
        scheduledTime: { gte: since },
        completedAt: { not: null },
      },
      select: { scheduledTime: true, completedAt: true },
    })

    let avgResponseTimeMs = 0
    if (completedWorkloads.length > 0) {
      const totalMs = completedWorkloads.reduce((sum: number, w: any) => {
        const duration = w.completedAt.getTime() - w.scheduledTime.getTime()
        return sum + Math.max(0, duration)
      }, 0)
      avgResponseTimeMs = Math.round(totalMs / completedWorkloads.length)
    }

    return res.json({
      integration: 'DEKES',
      status: failureRate > 20 ? 'degraded' : 'healthy',
      timeRange: `${hours}h`,
      metrics: {
        successRate,
        failureRate,
        totalEvents,
        totalWorkloads,
        avgResponseTimeMs,
        uptime: failureRate === 0 ? 100 : Math.round((100 - failureRate) * 10) / 10,
      },
      hourlyTrend: hourlyTrend.slice(-24), // Last 24 data points
      lastChecked: new Date().toISOString(),
    })
  } catch (error) {
    console.error('DEKES integration metrics error:', error)
    res.status(500).json({ error: 'Failed to fetch DEKES metrics' })
  }
})

router.get('/dekes/handoffs', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20))
    const days = parseInt(req.query.days as string) || 30
    const handoffId =
      typeof req.query.handoffId === 'string' && req.query.handoffId.length > 0
        ? req.query.handoffId
        : null
    const externalLeadId =
      typeof req.query.externalLeadId === 'string' && req.query.externalLeadId.length > 0
        ? req.query.externalLeadId
        : null
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const handoffWhere: Record<string, unknown> = {}

    if (handoffId) {
      handoffWhere.id = handoffId
    } else if (externalLeadId) {
      handoffWhere.externalLeadId = externalLeadId
    } else {
      handoffWhere.createdAt = { gte: since }
    }

    const handoffs = await prisma.dekesHandoffEvent.findMany({
      where: handoffWhere,
      orderBy: { createdAt: 'desc' },
      take: handoffId ? 1 : limit,
    })

    const parsedHandoffs: Array<{
      handoff: any
      parsedNotes: ReturnType<typeof parseDekesHandoffNotes>
    }> = handoffs.map((handoff: any) => ({
      handoff,
      parsedNotes: parseDekesHandoffNotes(handoff.notes),
    }))
    const prospectIds = Array.from(
      new Set(
        parsedHandoffs
          .map(({ handoff }: { handoff: any }) => handoff.prospectId)
          .filter((value: string | null | undefined): value is string => Boolean(value))
      )
    )
    const externalLeadIds = Array.from(
      new Set(
        parsedHandoffs
          .map(({ handoff }: { handoff: any }) => handoff.externalLeadId)
          .filter((value: string | null | undefined): value is string => Boolean(value))
      )
    )
    const decisionFrameIds = Array.from(
      new Set(
        parsedHandoffs
          .map(
            ({ parsedNotes }: { parsedNotes: ReturnType<typeof parseDekesHandoffNotes> }) =>
              parsedNotes.decisionFrameId
          )
          .filter((value: string | null | undefined): value is string => Boolean(value))
      )
    )
    const outboxWhere = handoffId || externalLeadId ? {} : { createdAt: { gte: since } }

    const [prospects, decisions, outcomes, workloads, outboxItems] = await Promise.all([
      prospectIds.length > 0 || externalLeadIds.length > 0
        ? prisma.dekesProspect.findMany({
            where: {
              OR: [
                ...(prospectIds.length > 0 ? [{ id: { in: prospectIds } }] : []),
                ...(externalLeadIds.length > 0
                  ? [{ externalLeadId: { in: externalLeadIds } }]
                  : []),
              ],
            },
            select: {
              id: true,
              externalLeadId: true,
              orgName: true,
              orgDomain: true,
              orgRegion: true,
              intentScore: true,
              status: true,
            },
          })
        : Promise.resolve([]),
      decisionFrameIds.length > 0
        ? prisma.cIDecision.findMany({
            where: {
              decisionFrameId: { in: decisionFrameIds },
            },
            select: {
              id: true,
              decisionFrameId: true,
              selectedRunner: true,
              baselineRegion: true,
              selectedRegion: true,
              carbonIntensity: true,
              baseline: true,
              recommendation: true,
              decisionAction: true,
              decisionMode: true,
              reasonCode: true,
              signalConfidence: true,
              policyTrace: true,
              proofHash: true,
              fallbackUsed: true,
              lowConfidence: true,
              chosenCo2G: true,
              co2DeltaG: true,
              metadata: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      decisionFrameIds.length > 0
        ? prisma.workloadDecisionOutcome.findMany({
            where: {
              workloadId: { in: decisionFrameIds },
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
      decisionFrameIds.length > 0 || externalLeadIds.length > 0
        ? prisma.dekesWorkload.findMany({
            where: {
              OR: [
                ...(decisionFrameIds.length > 0 ? [{ id: { in: decisionFrameIds } }] : []),
                ...(decisionFrameIds.length > 0
                  ? [{ dekesQueryId: { in: decisionFrameIds } }]
                  : []),
                ...(externalLeadIds.length > 0
                  ? [{ dekesQueryId: { in: externalLeadIds } }]
                  : []),
              ],
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
      decisionFrameIds.length > 0
        ? prisma.decisionEventOutbox.findMany({
            where: outboxWhere,
            orderBy: { createdAt: 'desc' },
            take: 500,
            select: {
              status: true,
              payload: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
    ])

    const prospectById = new Map<string, (typeof prospects)[number]>(
      prospects.map((prospect: (typeof prospects)[number]) => [prospect.id, prospect])
    )
    const prospectByLeadId = new Map<string, (typeof prospects)[number]>(
      prospects
        .filter((prospect: any) => prospect.externalLeadId)
        .map((prospect: any) => [prospect.externalLeadId as string, prospect])
    )
    const decisionByFrameId = new Map<string, (typeof decisions)[number]>(
      decisions.map((decision: (typeof decisions)[number]) => [decision.decisionFrameId, decision])
    )
    const outcomeByWorkloadId = new Map<string, (typeof outcomes)[number]>(
      outcomes.map((outcome: (typeof outcomes)[number]) => [outcome.workloadId, outcome])
    )
    const workloadByLookup = new Map<string, (typeof workloads)[number]>()
    for (const workload of workloads as any[]) {
      workloadByLookup.set(workload.id, workload)
      if (workload.dekesQueryId) {
        workloadByLookup.set(workload.dekesQueryId, workload)
      }
    }
    const outboxByFrameId = new Map<string, any[]>()
    for (const item of outboxItems as any[]) {
      const payload = parseJsonRecord(item.payload)
      const payloadFrameId =
        typeof payload.decisionFrameId === 'string' ? payload.decisionFrameId : null
      if (!payloadFrameId || !decisionFrameIds.includes(payloadFrameId)) continue
      const group = outboxByFrameId.get(payloadFrameId) ?? []
      group.push(item)
      outboxByFrameId.set(payloadFrameId, group)
    }

    const hydratedHandoffs = parsedHandoffs.map(
      ({
        handoff,
        parsedNotes,
      }: {
        handoff: any
        parsedNotes: ReturnType<typeof parseDekesHandoffNotes>
      }) => {
      const prospect =
        (handoff.prospectId ? prospectById.get(handoff.prospectId) : null) ??
        (handoff.externalLeadId ? prospectByLeadId.get(handoff.externalLeadId) : null) ??
        null
      const decision = parsedNotes.decisionFrameId
        ? decisionByFrameId.get(parsedNotes.decisionFrameId) ?? null
        : null
      const decisionResponse = parseJsonRecord(parseJsonRecord(decision?.metadata).response)
      const artifactLinks = buildDekesArtifactLinks(parsedNotes.decisionFrameId)
      const workload =
        (parsedNotes.decisionFrameId
          ? workloadByLookup.get(parsedNotes.decisionFrameId) ?? null
          : null) ??
        (handoff.externalLeadId ? workloadByLookup.get(handoff.externalLeadId) ?? null : null)
      const executionOutcome = parsedNotes.decisionFrameId
        ? outcomeByWorkloadId.get(parsedNotes.decisionFrameId) ?? null
        : null
      const action =
        parsedNotes.action ??
        ((decision?.decisionAction as string | null | undefined) ?? null) ??
        (typeof decisionResponse.decision === 'string' ? decisionResponse.decision : null)
      const signalConfidence =
        decision?.signalConfidence ??
        (typeof decisionResponse.signalConfidence === 'number'
          ? decisionResponse.signalConfidence
          : null)
      const baselineCarbonIntensity =
        decision?.baseline ??
        (typeof decisionResponse.baseline?.carbonIntensity === 'number'
          ? decisionResponse.baseline.carbonIntensity
          : null)
      const selectedCarbonIntensity =
        decision?.carbonIntensity ??
        (typeof decisionResponse.selected?.carbonIntensity === 'number'
          ? decisionResponse.selected.carbonIntensity
          : null)
      const eventType = toDekesHandoffEventType({
        action,
        fallbackUsed: decision?.fallbackUsed ?? false,
        lowConfidence: decision?.lowConfidence ?? false,
        signalConfidence,
        baselineCarbonIntensity,
        selectedCarbonIntensity,
      })
      const severity = toDekesHandoffSeverity(eventType, action)
      const dekesClassification = toDekesHandoffClassification(eventType)
      const selectedRegion =
        parsedNotes.selectedRegion ??
        decision?.selectedRegion ??
        (typeof decisionResponse.selectedRegion === 'string'
          ? decisionResponse.selectedRegion
          : null) ??
        workload?.selectedRegion ??
        prospect?.orgRegion ??
        'unassigned'
      const baselineRegion =
        decision?.baselineRegion ??
        (typeof decisionResponse.baseline?.region === 'string'
          ? decisionResponse.baseline.region
          : null) ??
        selectedRegion
      const carbonDeltaGPerKwh =
        baselineCarbonIntensity != null && selectedCarbonIntensity != null
          ? Number((baselineCarbonIntensity - selectedCarbonIntensity).toFixed(6))
          : typeof decisionResponse.carbonDelta === 'number'
            ? decisionResponse.carbonDelta
            : 0
      const score =
        baselineCarbonIntensity != null &&
        selectedCarbonIntensity != null &&
        baselineCarbonIntensity > 0
          ? Math.max(
              0,
              Math.min(
                1,
                Number(
                  ((baselineCarbonIntensity - selectedCarbonIntensity) / baselineCarbonIntensity).toFixed(6)
                )
              )
            )
          : 0
      const outbox = parsedNotes.decisionFrameId
        ? outboxByFrameId.get(parsedNotes.decisionFrameId) ?? []
        : []
      const eventDelivery = {
        sinkCount: outbox.length,
        sentCount: outbox.filter((item) => item.status === 'SENT').length,
        pendingCount: outbox.filter((item) => item.status === 'PENDING').length,
        failedCount: outbox.filter((item) => item.status === 'FAILED').length,
        deadLetterCount: outbox.filter((item) => item.status === 'DEAD_LETTER').length,
      }
      const chosenCo2G =
        typeof decision?.chosenCo2G === 'number'
          ? decision.chosenCo2G
          : typeof workload?.actualCO2 === 'number'
            ? workload.actualCO2 * 1000
            : null
      const budget =
        workload?.carbonBudget != null || chosenCo2G != null
          ? {
              status:
                workload?.carbonBudget != null && chosenCo2G != null
                  ? chosenCo2G > workload.carbonBudget
                    ? 'exceeded'
                    : chosenCo2G > workload.carbonBudget * 0.8
                      ? 'warning'
                      : 'ok'
                  : 'ok',
              usedCO2Grams: chosenCo2G ?? 0,
              remainingCO2Grams:
                workload?.carbonBudget != null
                  ? Math.max(0, workload.carbonBudget - (chosenCo2G ?? 0))
                  : 0,
            }
          : null

        return {
        handoffId: handoff.id,
        organizationId:
          prospect?.orgDomain ??
          prospect?.orgName ??
          handoff.externalLeadId ??
          parsedNotes.decisionFrameId ??
          'dekes',
        decisionId: decision?.id ?? null,
        decisionFrameId: parsedNotes.decisionFrameId,
        eventType,
        severity,
        timestamp: handoff.createdAt.toISOString(),
        status: toDekesHandoffStatus(handoff.status),
        qualificationScore: handoff.qualificationScore ?? prospect?.intentScore ?? null,
        dekesClassification,
        dekesActionType: parsedNotes.legacyAction ?? action,
        dekesActionId: parsedNotes.proofId ?? parsedNotes.decisionFrameId,
        processedAt:
          toIsoString(executionOutcome?.createdAt) ??
          toIsoString(workload?.completedAt) ??
          handoff.updatedAt.toISOString(),
        routing: {
          selectedRegion,
          baselineRegion,
          carbonIntensity: selectedCarbonIntensity ?? 0,
          carbonDeltaGPerKwh,
          qualityTier: toDekesQualityTier(signalConfidence),
          forecastStability: toDekesForecastStability({
            fallbackUsed: decision?.fallbackUsed ?? false,
            lowConfidence: decision?.lowConfidence ?? false,
            signalConfidence,
          }),
          score,
        },
        budget,
        policy: {
          policyName:
            (typeof parseJsonRecord(decision?.policyTrace).policyVersion === 'string'
              ? parseJsonRecord(decision?.policyTrace).policyVersion
              : null) ??
            (typeof decisionResponse.decisionEnvelope?.policyVersion === 'string'
              ? decisionResponse.decisionEnvelope.policyVersion
              : null),
          actionTaken: action,
        },
        explanation:
          (typeof decisionResponse.decisionExplanation?.headline === 'string'
            ? decisionResponse.decisionExplanation.headline
            : null) ??
          (typeof decision?.recommendation === 'string' ? decision.recommendation : null),
        replayUrl: parsedNotes.decisionFrameId
          ? `/control-surface?tab=routing&decisionFrameId=${encodeURIComponent(parsedNotes.decisionFrameId)}`
          : null,
        prospect: prospect
          ? {
              id: prospect.id,
              orgName: prospect.orgName,
              orgDomain: prospect.orgDomain,
              orgRegion: prospect.orgRegion,
              intentScore: prospect.intentScore,
              status: prospect.status,
            }
          : null,
        evidence: {
          proofHash:
            parsedNotes.proofHash ??
            decision?.proofHash ??
            (typeof decisionResponse.proofHash === 'string' ? decisionResponse.proofHash : null) ??
            null,
          traceUrl: artifactLinks?.trace ?? null,
          rawTraceUrl: artifactLinks?.rawTrace ?? null,
          replayUrl: artifactLinks?.replay ?? null,
          replayPacketUrl: artifactLinks?.replayPacketJson ?? null,
          proofPacketJsonUrl: artifactLinks?.proofPacketJson ?? null,
          proofPacketPdfUrl: artifactLinks?.proofPacketPdf ?? null,
        },
        execution: {
          success: executionOutcome?.success ?? null,
          region: executionOutcome?.region ?? selectedRegion ?? null,
          latencyMs:
            typeof executionOutcome?.latency === 'number' ? executionOutcome.latency : null,
          recordedAt:
            toIsoString(executionOutcome?.createdAt) ?? toIsoString(workload?.completedAt) ?? null,
        },
        eventDelivery,
        }
      }
    )

    return res.json({
      handoffs: hydratedHandoffs,
      total: hydratedHandoffs.length,
      timeRange: handoffId || externalLeadId ? 'single lookup' : `${days}d`,
    })
  } catch (error) {
    console.error('DEKES integration handoffs error:', error)
    res.status(500).json({ error: 'Failed to fetch DEKES handoffs' })
  }
})

router.get('/dekes/signals', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20
    const hours = parseInt(req.query.hours as string) || 168
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)

    const events = await prisma.integrationEvent.findMany({
      where: {
        source: 'DEKES_INTEGRATION',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return res.json({
      signals: events.map((event: any) => ({
        id: event.id,
        type: event.eventType || 'INTEGRATION_EVENT',
        success: event.success,
        timestamp: event.createdAt.toISOString(),
        message: event.message,
      })),
      total: events.length,
      timeRange: `${hours}h`,
    })
  } catch (error) {
    console.error('DEKES integration signals error:', error)
    res.status(500).json({ error: 'Failed to fetch DEKES signals' })
  }
})

const webhookCreateSchema = z.object({
  name: z.string().min(2).max(120),
  targetUrl: z.string().url(),
  authToken: z.string().optional(),
  signingSecret: z.string().min(16).optional(),
  metadata: z.record(z.any()).optional(),
})

const webhookUpdateSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'DISABLED']).optional(),
  authToken: z.string().optional(),
  rotateSigningSecret: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
})

router.get('/webhooks', internalServiceGuard, async (_req, res) => {
  const sinks = await prisma.integrationWebhookSink.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return res.json({
    sinks: sinks.map((sink: any) => ({
      id: sink.id,
      name: sink.name,
      targetUrl: sink.targetUrl,
      status: sink.status,
      metadata: sink.metadata,
      createdAt: sink.createdAt,
      updatedAt: sink.updatedAt,
      lastSuccessAt: sink.lastSuccessAt,
      lastFailureAt: sink.lastFailureAt,
      lastResponseCode: sink.lastResponseCode,
      lastError: sink.lastError,
      hasAuthToken: Boolean(sink.authToken),
      hasSigningSecret: Boolean(sink.signingSecret),
    })),
    total: sinks.length,
  })
})

router.post('/webhooks', internalServiceGuard, async (req, res) => {
  try {
    const data = webhookCreateSchema.parse(req.body)
    const signingSecret = data.signingSecret || crypto.randomBytes(24).toString('hex')

    const sink = await prisma.integrationWebhookSink.create({
      data: {
        name: data.name,
        targetUrl: data.targetUrl,
        authToken: data.authToken ?? null,
        signingSecret,
        status: 'ACTIVE',
        metadata: data.metadata ?? {},
      },
    })

    return res.status(201).json({
      id: sink.id,
      name: sink.name,
      targetUrl: sink.targetUrl,
      status: sink.status,
      signingSecret,
      createdAt: sink.createdAt,
    })
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid webhook sink payload',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.patch('/webhooks/:id', internalServiceGuard, async (req, res) => {
  try {
    const data = webhookUpdateSchema.parse(req.body)
    const updates: Record<string, unknown> = {}

    if (data.status) updates.status = data.status
    if (data.authToken !== undefined) updates.authToken = data.authToken || null
    if (data.metadata) updates.metadata = data.metadata
    if (data.rotateSigningSecret) {
      updates.signingSecret = crypto.randomBytes(24).toString('hex')
    }

    const sink = await prisma.integrationWebhookSink.update({
      where: { id: req.params.id },
      data: updates,
    })

    return res.json({
      id: sink.id,
      name: sink.name,
      targetUrl: sink.targetUrl,
      status: sink.status,
      rotatedSigningSecret: data.rotateSigningSecret ? sink.signingSecret : undefined,
      updatedAt: sink.updatedAt,
    })
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to update webhook sink',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.post('/webhooks/:id/test', internalServiceGuard, async (req, res) => {
  try {
    const test = await createTestEventForSink(req.params.id)
    return res.json({
      status: 'queued',
      ...test,
    })
  } catch (error) {
    return res.status(404).json({
      error: 'Webhook sink test enqueue failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.get('/events/outbox', internalServiceGuard, async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)))
  const items = await prisma.decisionEventOutbox.findMany({
    include: { sink: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return res.json({
    items: items.map((item: any) => ({
      id: item.id,
      eventType: item.eventType,
      eventKey: item.eventKey,
      status: item.status,
      attemptCount: item.attemptCount,
      nextAttemptAt: item.nextAttemptAt,
      lastResponseCode: item.lastResponseCode,
      lastError: item.lastError,
      sink: item.sink
        ? {
            id: item.sink.id,
            name: item.sink.name,
            status: item.sink.status,
            targetUrl: item.sink.targetUrl,
          }
        : null,
      createdAt: item.createdAt,
      processedAt: item.processedAt,
    })),
    total: items.length,
  })
})

router.get('/events/outbox/metrics', internalServiceGuard, async (_req, res) => {
  const [pendingCount, processingCount, failedCount, deadLetterCount, sentCount, oldestUnprocessed] =
    await Promise.all([
      prisma.decisionEventOutbox.count({
        where: { status: 'PENDING' },
      }),
      prisma.decisionEventOutbox.count({
        where: { status: 'PROCESSING' },
      }),
      prisma.decisionEventOutbox.count({
        where: { status: 'FAILED' },
      }),
      prisma.decisionEventOutbox.count({
        where: { status: 'DEAD_LETTER' },
      }),
      prisma.decisionEventOutbox.count({
        where: { status: 'SENT' },
      }),
      prisma.decisionEventOutbox.findFirst({
        where: { status: { in: ['PENDING', 'FAILED'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ])

  const lagMinutes = oldestUnprocessed
    ? (Date.now() - oldestUnprocessed.createdAt.getTime()) / 60000
    : 0
  const processedTotal = sentCount + failedCount + deadLetterCount
  const failureRatePct = processedTotal > 0 ? ((failedCount + deadLetterCount) / processedTotal) * 100 : 0

  const alerts = {
    lagBreached: lagMinutes > env.DECISION_EVENT_ALERT_LAG_MINUTES,
    failureRateBreached: failureRatePct > env.DECISION_EVENT_ALERT_FAILURE_RATE_PCT,
    deadLetterBreached: deadLetterCount > env.DECISION_EVENT_ALERT_DEADLETTER_COUNT,
  }
  recordTelemetryMetric(telemetryMetricNames.outboxLagSeconds, 'gauge', lagMinutes * 60, {
    pending: pendingCount,
    failed: failedCount,
    dead_letter: deadLetterCount,
  })

  res.json({
    generatedAt: new Date().toISOString(),
    counts: {
      pending: pendingCount,
      processing: processingCount,
      failed: failedCount,
      deadLetter: deadLetterCount,
      sent: sentCount,
    },
    lagMinutes: Number(lagMinutes.toFixed(3)),
    failureRatePct: Number(failureRatePct.toFixed(3)),
    thresholds: {
      lagMinutes: env.DECISION_EVENT_ALERT_LAG_MINUTES,
      failureRatePct: env.DECISION_EVENT_ALERT_FAILURE_RATE_PCT,
      deadLetterCount: env.DECISION_EVENT_ALERT_DEADLETTER_COUNT,
    },
    alerts,
    alertActive: alerts.lagBreached || alerts.failureRateBreached || alerts.deadLetterBreached,
  })
})

router.post('/events/outbox/:id/requeue', internalServiceGuard, async (req, res) => {
  try {
    const updated = await prisma.decisionEventOutbox.update({
      where: { id: req.params.id },
      data: {
        status: 'PENDING',
        attemptCount: 0,
        nextAttemptAt: new Date(),
        lastError: null,
        lastResponseCode: null,
        processedAt: null,
      },
    })
    return res.json({
      status: 'requeued',
      id: updated.id,
      eventKey: updated.eventKey,
      nextAttemptAt: updated.nextAttemptAt,
    })
  } catch (error) {
    return res.status(404).json({
      error: 'Outbox record not found',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.post('/events/dispatch', internalServiceGuard, async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.body?.limit ?? 50)))
  const result = await processDecisionEventOutboxBatch(limit)
  return res.json({
    status: 'ok',
    ...result,
  })
})

export default router
