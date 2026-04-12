import { Router } from 'express'
import { z } from 'zod'

import {
  buildCanonicalDecisionCloudEvent,
  verifySignatureHeader,
} from '../lib/ci/canonical'
import { DecisionEvaluatedV1Schema } from '../lib/ci/decision-events'
import {
  buildIdempotencyCacheKey,
  readIdempotentResponse,
  writeIdempotentResponse,
} from '../lib/ci/idempotency'
import { prisma } from '../lib/db'
import { internalServiceGuard } from '../middleware/internal-auth'
import { createDecision, persistCiDecisionResult, requestSchema } from './ci'

const router = Router()

const cloudEventSchema = z.object({
  specversion: z.literal('1.0'),
  id: z.string().min(1),
  source: z.string().min(1),
  type: z.string().min(1),
  subject: z.string().optional(),
  time: z.string().optional(),
  datacontenttype: z.string().optional(),
  data: z.record(z.any()),
})

router.post('/verify', internalServiceGuard, async (req, res) => {
  try {
    if (!verifySignatureHeader((req as { rawBody?: string }).rawBody, req.header('x-ecobe-signature'))) {
      return res.status(401).json({
        error: 'Invalid event signature',
        code: 'INVALID_EVENT_SIGNATURE',
      })
    }

    const event = DecisionEvaluatedV1Schema.parse(req.body)
    await prisma.integrationEvent.create({
      data: {
        source: 'DECISION_EVENT_VERIFIER',
        eventType: 'DECISION_EVALUATED_VERIFIED',
        success: true,
        message: JSON.stringify({
          decisionFrameId: event.decisionFrameId,
          action: event.action,
          reasonCode: event.reasonCode,
          signatureHeader: req.header('x-ecobe-signature') ?? null,
          eventKey: req.header('x-ecobe-event-key') ?? null,
          idempotencyKey: req.header('x-ecobe-idempotency-key') ?? null,
          receivedAt: new Date().toISOString(),
        }),
      },
    })

    return res.status(201).json({
      verified: true,
      decisionFrameId: event.decisionFrameId,
      eventType: event.version,
      receivedAt: new Date().toISOString(),
    })
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid decision event payload',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.post('/ingest', async (req, res) => {
  try {
    if (!verifySignatureHeader((req as { rawBody?: string }).rawBody, req.header('x-ecobe-signature'))) {
      return res.status(401).json({
        error: 'Invalid request signature',
        code: 'INVALID_REQUEST_SIGNATURE',
      })
    }

    const event = cloudEventSchema.parse(req.body)
    const rawRequest = (event.data.request ?? event.data.decisionRequest ?? event.data) as Record<string, unknown>
    const request = requestSchema.parse({
      ...rawRequest,
      requestId: rawRequest.requestId ?? event.id,
      idempotencyKey: rawRequest.idempotencyKey ?? event.id,
      runtimeTarget: {
        ...(typeof rawRequest.runtimeTarget === 'object' && rawRequest.runtimeTarget ? rawRequest.runtimeTarget : {}),
        runtime: 'event',
      },
      transport: {
        ...(typeof rawRequest.transport === 'object' && rawRequest.transport ? rawRequest.transport : {}),
        runtime: 'event',
        transport: 'cloudevent',
        controlPoint: 'event_bus',
        adapterId:
          (typeof rawRequest.transport === 'object' && rawRequest.transport
            ? (rawRequest.transport as Record<string, unknown>).adapterId
            : undefined) ?? 'ecobe.cloudevents.adapter.v1',
      },
    })

    const idempotencyKey = buildIdempotencyCacheKey({
      namespace: 'cloudevents-v1',
      callerId: request.caller?.id ?? event.source,
      idempotencyKey: request.idempotencyKey ?? event.id,
    })
    const cached = await readIdempotentResponse<Record<string, unknown>>(idempotencyKey)
    if (cached) {
      return res.json({
        acceptedAt: new Date().toISOString(),
        duplicate: true,
        event: {
          id: event.id,
          source: event.source,
          type: event.type,
        },
        decision: cached,
      })
    }

    const result = await createDecision(request)
    const { response } = await persistCiDecisionResult(result)
    const outboundDecisionEvent = buildCanonicalDecisionCloudEvent({
      decision: response.decisionEnvelope,
      proof: response.proofEnvelope,
      telemetry: request.telemetryContext,
    })

    await writeIdempotentResponse(idempotencyKey, response)

    return res.json({
      acceptedAt: new Date().toISOString(),
      duplicate: false,
      event: {
        id: event.id,
        source: event.source,
        type: event.type,
        subject: event.subject ?? null,
      },
      decision: response,
      outboundDecisionEvent,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid CloudEvent payload',
        details: error.errors,
      })
    }

    return res.status(500).json({
      error: 'Failed to ingest CloudEvent',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
