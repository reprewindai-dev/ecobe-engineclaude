import crypto from 'crypto'

import type { Prisma } from '@prisma/client'
import { z } from 'zod'

import { env } from '../../config/env'
import { prisma } from '../db'
import { sha256Canonical } from '../proof/export-chain'
import {
  resolveDecisionEventSigningSecret,
  SELF_VERIFIER_SINK_NAME,
} from './event-verifier-sink'
import {
  CanonicalDecisionEnvelopeSchema,
  CanonicalProofEnvelopeSchema,
  CanonicalTransportMetadataSchema,
} from './canonical'

export const DecisionEvaluatedV1Schema = z.object({
  version: z.literal('DecisionEvaluatedV1'),
  decisionId: z.string(),
  decisionFrameId: z.string(),
  action: z.enum(['run_now', 'reroute', 'delay', 'throttle', 'deny']),
  reasonCode: z.string(),
  baseline: z.object({
    region: z.string(),
    carbonIntensity: z.number(),
    waterImpactLiters: z.number(),
    waterScarcityImpact: z.number(),
  }),
  selected: z.object({
    region: z.string(),
    carbonIntensity: z.number(),
    waterImpactLiters: z.number(),
    waterScarcityImpact: z.number(),
  }),
  policyTrace: z.record(z.any()),
  provenance: z.object({
    signalsUsed: z.array(z.string()),
    datasetVersions: z.record(z.string()),
    sourceProvenance: z.array(z.record(z.any())),
  }),
  canonicalDecision: CanonicalDecisionEnvelopeSchema.optional(),
  proof: CanonicalProofEnvelopeSchema.optional(),
  adapter: CanonicalTransportMetadataSchema.optional(),
  confidence: z.number().min(0).max(1),
  timestamp: z.string(),
  signature: z.string(),
})

export type DecisionEvaluatedV1 = z.infer<typeof DecisionEvaluatedV1Schema>

const ACTIVE_SINK_CACHE_TTL_MS = 30_000
const ACTIVE_DEAD_LETTER_WINDOW_HOURS = 24
const RECOVERABLE_SYSTEM_DEAD_LETTER_LIMIT = 100

let activeSinkIdsCache:
  | {
      expiresAt: number
      sinkIds: string[]
    }
  | null = null
let activeSinkIdsPromise: Promise<string[]> | null = null

function signingKey() {
  return resolveDecisionEventSigningSecret() || 'ecobe-dev-signing-key'
}

function toCanonicalJson(payload: unknown) {
  if (typeof payload === 'string') {
    return payload
  }
  return JSON.stringify(payload)
}

function signCanonical(payload: unknown, secret: string) {
  const canonical = toCanonicalJson(payload)
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex')
}

function computeNextAttempt(attemptCount: number) {
  const base = Math.max(250, env.DECISION_EVENT_RETRY_BASE_MS)
  const delayMs = Math.min(15 * 60 * 1000, base * Math.pow(2, Math.max(0, attemptCount)))
  return new Date(Date.now() + delayMs)
}

function getActiveDeadLetterCutoff() {
  return new Date(Date.now() - ACTIVE_DEAD_LETTER_WINDOW_HOURS * 60 * 60 * 1000)
}

async function getActiveDecisionEventSinkIds(db: any) {
  const now = Date.now()
  if (activeSinkIdsCache && activeSinkIdsCache.expiresAt > now) {
    return activeSinkIdsCache.sinkIds
  }

  if (!activeSinkIdsPromise) {
    activeSinkIdsPromise = db.integrationWebhookSink
      .findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      })
      .then((rows: Array<{ id: string }>) => {
        const sinkIds = rows.map((row) => row.id)
        activeSinkIdsCache = {
          expiresAt: Date.now() + ACTIVE_SINK_CACHE_TTL_MS,
          sinkIds,
        }
        return sinkIds
      })
      .finally(() => {
        activeSinkIdsPromise = null
      })
  }

  return activeSinkIdsPromise ?? Promise.resolve(activeSinkIdsCache?.sinkIds ?? [])
}

export function resetDecisionEventSinkCache() {
  activeSinkIdsCache = null
  activeSinkIdsPromise = null
}

export function buildDecisionEvaluatedEvent(input: {
  decisionId: string
  decisionFrameId: string
  action: 'run_now' | 'reroute' | 'delay' | 'throttle' | 'deny'
  reasonCode: string
  baseline: {
    region: string
    carbonIntensity: number
    waterImpactLiters: number
    waterScarcityImpact: number
  }
  selected: {
    region: string
    carbonIntensity: number
    waterImpactLiters: number
    waterScarcityImpact: number
  }
  policyTrace: Record<string, unknown>
  confidence: number
  signalsUsed: string[]
  datasetVersions: Record<string, string>
  sourceProvenance: Record<string, unknown>[]
  canonicalDecision?: z.infer<typeof CanonicalDecisionEnvelopeSchema>
  proof?: z.infer<typeof CanonicalProofEnvelopeSchema>
  adapter?: z.infer<typeof CanonicalTransportMetadataSchema>
  timestamp: string
}) {
  const unsignedPayload = {
    version: 'DecisionEvaluatedV1' as const,
    decisionId: input.decisionId,
    decisionFrameId: input.decisionFrameId,
    action: input.action,
    reasonCode: input.reasonCode,
    baseline: input.baseline,
    selected: input.selected,
    policyTrace: input.policyTrace,
    provenance: {
      signalsUsed: input.signalsUsed,
      datasetVersions: input.datasetVersions,
      sourceProvenance: input.sourceProvenance,
    },
    canonicalDecision: input.canonicalDecision,
    proof: input.proof,
    adapter: input.adapter,
    confidence: input.confidence,
    timestamp: input.timestamp,
  }
  const signature = signCanonical(unsignedPayload, signingKey())
  return DecisionEvaluatedV1Schema.parse({
    ...unsignedPayload,
    signature,
  })
}

export async function enqueueDecisionEvaluatedEvents(
  db: any,
  eventPayload: DecisionEvaluatedV1
) {
  const sinkIds = await getActiveDecisionEventSinkIds(db)
  if (sinkIds.length === 0) {
    return { enqueued: 0 }
  }

  const records = sinkIds.map((sinkId: string) => ({
    eventType: 'DecisionEvaluatedV1',
    eventKey: `decision-evaluated:${eventPayload.decisionFrameId}:${sinkId}`,
    sinkId,
    payload: eventPayload as unknown as Prisma.InputJsonValue,
    status: 'PENDING' as const,
    attemptCount: 0,
    nextAttemptAt: new Date(),
  }))

  const result = await db.decisionEventOutbox.createMany({
    data: records,
    skipDuplicates: true,
  })

  return { enqueued: result.count }
}

export async function processDecisionEventOutboxBatch(limit = env.DECISION_EVENT_DISPATCH_BATCH_SIZE) {
  const now = new Date()
  const candidates = await prisma.decisionEventOutbox.findMany({
    where: {
      status: {
        in: ['PENDING', 'FAILED'],
      },
      nextAttemptAt: {
        lte: now,
      },
    },
    include: {
      sink: true,
    },
    take: Math.max(1, limit),
    orderBy: {
      createdAt: 'asc',
    },
  })

  let sent = 0
  let failed = 0
  let deadLetter = 0

  for (const item of candidates) {
    if (!item.sink || item.sink.status !== 'ACTIVE') {
      await prisma.decisionEventOutbox.update({
        where: { id: item.id },
        data: {
          status: 'DEAD_LETTER',
          lastError: 'SINK_INACTIVE_OR_MISSING',
          processedAt: new Date(),
        },
      })
      deadLetter += 1
      continue
    }

    const payload = item.payload as Record<string, unknown>
    const body = JSON.stringify(payload)
    const signature = signCanonical(body, item.sink.signingSecret || signingKey())
    const idempotencyKey = item.eventKey

    await prisma.decisionEventOutbox.update({
      where: { id: item.id },
      data: { status: 'PROCESSING' },
    })

    try {
      const response = await fetch(item.sink.targetUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ecobe-event-type': item.eventType,
          'x-ecobe-event-key': item.eventKey,
          'x-ecobe-idempotency-key': idempotencyKey,
          'x-ecobe-signature': `v1=${signature}`,
          ...(item.sink.authToken ? { authorization: `Bearer ${item.sink.authToken}` } : {}),
        },
        body,
        signal: AbortSignal.timeout(Math.max(200, env.DECISION_EVENT_DISPATCH_TIMEOUT_MS)),
      })

      if (response.ok) {
        await prisma.$transaction([
          prisma.decisionEventOutbox.update({
            where: { id: item.id },
            data: {
              status: 'SENT',
              processedAt: new Date(),
              lastResponseCode: response.status,
              lastError: null,
            },
          }),
          prisma.integrationWebhookSink.update({
            where: { id: item.sinkId ?? '' },
            data: {
              lastSuccessAt: new Date(),
              lastResponseCode: response.status,
              lastError: null,
            },
          }),
        ])
        sent += 1
      } else {
        const nextAttemptCount = item.attemptCount + 1
        const shouldDeadLetter = nextAttemptCount >= env.DECISION_EVENT_MAX_ATTEMPTS
        await prisma.$transaction([
          prisma.decisionEventOutbox.update({
            where: { id: item.id },
            data: {
              status: shouldDeadLetter ? 'DEAD_LETTER' : 'FAILED',
              attemptCount: nextAttemptCount,
              nextAttemptAt: shouldDeadLetter ? item.nextAttemptAt : computeNextAttempt(nextAttemptCount),
              lastResponseCode: response.status,
              lastError: `HTTP_${response.status}`,
              processedAt: shouldDeadLetter ? new Date() : null,
            },
          }),
          prisma.integrationWebhookSink.update({
            where: { id: item.sinkId ?? '' },
            data: {
              lastFailureAt: new Date(),
              lastResponseCode: response.status,
              lastError: `HTTP_${response.status}`,
            },
          }),
        ])
        if (shouldDeadLetter) deadLetter += 1
        else failed += 1
      }
    } catch (error) {
      const nextAttemptCount = item.attemptCount + 1
      const shouldDeadLetter = nextAttemptCount >= env.DECISION_EVENT_MAX_ATTEMPTS
      const message = error instanceof Error ? error.message : 'NETWORK_ERROR'
      await prisma.$transaction([
        prisma.decisionEventOutbox.update({
          where: { id: item.id },
          data: {
            status: shouldDeadLetter ? 'DEAD_LETTER' : 'FAILED',
            attemptCount: nextAttemptCount,
            nextAttemptAt: shouldDeadLetter ? item.nextAttemptAt : computeNextAttempt(nextAttemptCount),
            lastError: message,
            processedAt: shouldDeadLetter ? new Date() : null,
          },
        }),
        prisma.integrationWebhookSink.update({
          where: { id: item.sinkId ?? '' },
          data: {
            lastFailureAt: new Date(),
            lastError: message,
          },
        }),
      ])
      if (shouldDeadLetter) deadLetter += 1
      else failed += 1
    }
  }

  return { processed: candidates.length, sent, failed, deadLetter }
}

export async function requeueRecoverableSystemDeadLetters(
  limit = RECOVERABLE_SYSTEM_DEAD_LETTER_LIMIT
) {
  const recoverable = await prisma.decisionEventOutbox.findMany({
    where: {
      status: 'DEAD_LETTER',
      sink: {
        name: SELF_VERIFIER_SINK_NAME,
        status: 'ACTIVE',
      },
      processedAt: {
        gte: getActiveDeadLetterCutoff(),
      },
    },
    orderBy: {
      processedAt: 'asc',
    },
    take: Math.max(1, limit),
    select: {
      id: true,
    },
  })

  if (recoverable.length === 0) {
    return { requeued: 0 }
  }

  const ids = recoverable.map((item: { id: string }) => item.id)
  const result = await prisma.decisionEventOutbox.updateMany({
    where: {
      id: { in: ids },
    },
    data: {
      status: 'PENDING',
      attemptCount: 0,
      nextAttemptAt: new Date(),
      lastResponseCode: null,
      lastError: null,
      processedAt: null,
    },
  })

  return { requeued: result.count }
}

export async function getDecisionEventOutboxOperationalStatus() {
  const activeDeadLetterCutoff = getActiveDeadLetterCutoff()
  const [pending, processing, failed, deadLetterTotal, deadLetterActive, sent, oldestUnprocessed] =
    await Promise.all([
      prisma.decisionEventOutbox.count({ where: { status: 'PENDING' } }),
      prisma.decisionEventOutbox.count({ where: { status: 'PROCESSING' } }),
      prisma.decisionEventOutbox.count({ where: { status: 'FAILED' } }),
      prisma.decisionEventOutbox.count({ where: { status: 'DEAD_LETTER' } }),
      prisma.decisionEventOutbox.count({
        where: {
          status: 'DEAD_LETTER',
          processedAt: {
            gte: activeDeadLetterCutoff,
          },
        },
      }),
      prisma.decisionEventOutbox.count({ where: { status: 'SENT' } }),
      prisma.decisionEventOutbox.findFirst({
        where: { status: { in: ['PENDING', 'FAILED'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ])

  return {
    pending,
    processing,
    failed,
    deadLetter: deadLetterActive,
    deadLetterActive,
    deadLetterTotal,
    sent,
    oldestPendingCreatedAt: oldestUnprocessed?.createdAt ?? null,
    activeDeadLetterWindowHours: ACTIVE_DEAD_LETTER_WINDOW_HOURS,
  }
}

export async function createTestEventForSink(sinkId: string) {
  const sink = await prisma.integrationWebhookSink.findUnique({
    where: { id: sinkId },
  })
  if (!sink) {
    throw new Error('SINK_NOT_FOUND')
  }

  const now = new Date().toISOString()
  const payload = buildDecisionEvaluatedEvent({
    decisionId: `test-${Date.now()}`,
    decisionFrameId: `test-frame-${Date.now()}`,
    action: 'run_now',
    reasonCode: 'TEST_EVENT',
    baseline: {
      region: 'baseline-region',
      carbonIntensity: 400,
      waterImpactLiters: 10,
      waterScarcityImpact: 8,
    },
    selected: {
      region: 'selected-region',
      carbonIntensity: 120,
      waterImpactLiters: 3,
      waterScarcityImpact: 1.2,
    },
    policyTrace: {
      policyVersion: 'test',
      profile: 'default',
    },
    confidence: 0.9,
    signalsUsed: ['test'],
    datasetVersions: { test: 'v1' },
    sourceProvenance: [],
    timestamp: now,
  })

  const created = await prisma.decisionEventOutbox.create({
    data: {
      eventType: 'DecisionEvaluatedV1',
      eventKey: `decision-evaluated:test:${sink.id}:${Date.now()}`,
      sinkId: sink.id,
      payload: payload as unknown as Prisma.InputJsonValue,
      status: 'PENDING',
      nextAttemptAt: new Date(),
    },
  })

  return {
    outboxId: created.id,
    eventHash: sha256Canonical(payload),
  }
}
