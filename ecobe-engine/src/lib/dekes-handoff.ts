/**
 * dekes-handoff.ts — ECOBE → DEKES event handoff sender.
 *
 * Emits org-scoped events from the carbon decision engine to DEKES
 * (the downstream business-intelligence and activation layer).
 *
 * Architectural contract:
 *   - DEKES NEVER influences routing decisions.
 *   - All calls are fire-and-forget — never block routing.
 *   - Events are always persisted to DekesHandoff first.
 *   - HTTP forwarding to DEKES requires DEKES_ENDPOINT env var.
 *
 * First-release event types: BUDGET_WARNING, BUDGET_EXCEEDED, POLICY_DELAY.
 */

import { randomBytes } from 'crypto'
import { prisma } from './db'
import { writeAuditLog } from './governance/audit'

// ─── Public types ─────────────────────────────────────────────────────────────

export type DekesEventType = 'BUDGET_WARNING' | 'BUDGET_EXCEEDED' | 'POLICY_DELAY'
export type DeeksSeverity  = 'low' | 'medium' | 'high' | 'critical'

export interface EmitHandoffInput {
  organizationId: string
  decisionId?:      string   // DashboardRoutingDecision.id
  decisionFrameId?: string   // For /api/v1/route/:id/replay link
  eventType:  DekesEventType
  severity:   DeeksSeverity
  routing?: {
    selectedRegion:          string
    baselineRegion?:         string
    carbonIntensity:         number  // gCO2/kWh of chosen region
    baselineCarbonIntensity?: number  // gCO2/kWh of baseline region
    qualityTier?:            string
  }
  budget?: {
    budgetCO2Grams:      number
    consumedCO2Grams:    number
    remainingCO2Grams:   number
    utilizationPct:      number
    status:              string
    periodEnd:           Date
  }
  policy?: {
    maxCarbonGPerKwh?:    number
    requireGreenRouting?: boolean
    actionTaken:          string   // 'delay' | 'block'
    retryAfterMinutes?:   number
  }
  explanation?: string
}

/**
 * Generate a unique handoff identifier used for Dekes handoffs.
 *
 * @returns A string starting with `hof_` followed by the current millisecond timestamp, an underscore, and six hexadecimal characters (e.g., `hof_1610000000000_a1b2c3`).
 */
// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildHandoffId(): string {
  return 'hof_' + Date.now() + '_' + randomBytes(3).toString('hex')
}

/**
 * Constructs the JSON-serializable payload for a Dekes handoff including identifiers, event metadata, and any optional routing, budget, policy, explanation, and deep links.
 *
 * @param handoffId - Unique identifier for this handoff
 * @param input - Input data describing the event and optional routing, budget, policy, and explanation
 * @returns An object suitable for sending to DEKES containing the handoff fields and any supplied optional sections
 */
function buildPayload(handoffId: string, input: EmitHandoffInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    handoffId,
    source: 'ecobe',
    sourceVersion: 'v1',
    organizationId: input.organizationId,
    eventType: input.eventType,
    severity: input.severity,
    timestamp: new Date().toISOString(),
  }

  if (input.decisionId)      payload.decisionId      = input.decisionId
  if (input.decisionFrameId) payload.decisionFrameId = input.decisionFrameId

  if (input.routing) {
    const r = input.routing
    payload.routing = {
      selectedRegion:       r.selectedRegion,
      baselineRegion:       r.baselineRegion ?? null,
      carbonIntensity:      r.carbonIntensity,
      baselineCarbonIntensity: r.baselineCarbonIntensity ?? null,
      carbonDeltaGPerKwh:   r.baselineCarbonIntensity != null
        ? r.baselineCarbonIntensity - r.carbonIntensity
        : null,
      carbonSavingsPct:     r.baselineCarbonIntensity && r.baselineCarbonIntensity > 0
        ? Math.round(((r.baselineCarbonIntensity - r.carbonIntensity) / r.baselineCarbonIntensity) * 1000) / 10
        : null,
      qualityTier:          r.qualityTier ?? null,
    }
  }

  if (input.budget) {
    const b = input.budget
    payload.budget = {
      budgetCO2Grams:    b.budgetCO2Grams,
      consumedCO2Grams:  b.consumedCO2Grams,
      remainingCO2Grams: b.remainingCO2Grams,
      utilizationPct:    b.utilizationPct,
      status:            b.status,
      periodEnd:         b.periodEnd.toISOString(),
    }
  }

  if (input.policy) {
    payload.policy = {
      maxCarbonGPerKwh:    input.policy.maxCarbonGPerKwh ?? null,
      requireGreenRouting: input.policy.requireGreenRouting ?? null,
      actionTaken:         input.policy.actionTaken,
      retryAfterMinutes:   input.policy.retryAfterMinutes ?? null,
    }
  }

  if (input.explanation)     payload.explanation = input.explanation

  // Deep links back into ECOBE
  if (input.decisionFrameId) payload.replayUrl    = `/api/v1/route/${input.decisionFrameId}/replay`
  if (input.decisionId)      payload.dashboardUrl = `/dashboard/decisions/${input.decisionId}`

  return payload
}

// ─── Public function ──────────────────────────────────────────────────────────

/**
 * Emit a handoff event to DEKES representing a carbon-related decision.
 *
 * Persists a DekesHandoff record with status "queued", then — only if DEKES_ENDPOINT is configured —
 * attempts to forward a spec-compliant payload to DEKES, updates the local record to "processing" or
 * "failed" based on the HTTP result, and writes a governance audit log entry summarizing the attempt.
 * This function is fire-and-forget: it catches and logs all errors, does not throw, and will attempt
 * to mark the local DekesHandoff as failed when an error occurs.
 *
 * @param input - Handoff details (organizationId, eventType, severity, and optional routing, budget, policy, decision ids, and explanation)
 * Emit a carbon event handoff to DEKES. Always fire-and-forget — never throws.
 *
 * Steps:
 * 1. Generate idempotency key and build spec-compliant payload.
 * 2. Persist to DekesHandoff (status: 'queued').
 * 3. If DEKES_ENDPOINT configured, HTTP POST to DEKES.
 * 4. Update DekesHandoff status + sentAt / failedAt.
 * 5. Write governance audit log entry.
 */
export async function emitDekesHandoff(input: EmitHandoffInput): Promise<void> {
  const handoffId = buildHandoffId()
  const payload   = buildPayload(handoffId, input)

  let rowId: string | undefined

  try {
    // ── 1. Persist locally ───────────────────────────────────────────────────
    const row = await (prisma as any).dekesHandoff.create({
      data: {
        handoffId,
        organizationId:  input.organizationId,
        decisionId:      input.decisionId      ?? null,
        decisionFrameId: input.decisionFrameId ?? null,
        eventType:       input.eventType,
        severity:        input.severity,
        payloadJson:     payload as any,
        status:          'queued',
      },
      select: { id: true },
    })
    rowId = row.id as string

    // ── 2. Forward to DEKES if endpoint configured ───────────────────────────
    const dekesEndpoint = process.env.DEKES_ENDPOINT
    const dekesApiKey   = process.env.DEKES_API_KEY

    if (!dekesEndpoint) {
      // No endpoint — stored locally, not forwarded. This is normal in development.
      console.debug(`[dekes-handoff] DEKES_ENDPOINT not set; handoff ${handoffId} stored locally only`)
      return
    }

    // HTTP POST to DEKES
    let httpStatus = 0
    let httpErr: Error | null = null

    try {
      const resp = await fetch(`${dekesEndpoint}/api/ecobe/handoff`, {
        method:  'POST',
        headers: {
          'Content-Type':    'application/json',
          'Authorization':   `Bearer ${dekesApiKey ?? ''}`,
          'X-Source-System': 'ecobe',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),  // 10 s max
      })
      httpStatus = resp.status
    } catch (err: any) {
      httpErr = err
    }

    const success = httpStatus >= 200 && httpStatus < 300

    await (prisma as any).dekesHandoff.update({
      where: { handoffId },
      data: success
        ? { status: 'processing', sentAt: new Date() }
        : {
            status:       'failed',
            failedAt:     new Date(),
            errorMessage: httpErr
              ? httpErr.message
              : `HTTP ${httpStatus}`,
          },
    })

    // ── 3. Governance audit ──────────────────────────────────────────────────
    void writeAuditLog({
      organizationId: input.organizationId,
      actorType:      'SYSTEM',
      action:         'DECISION_CREATED',
      entityType:     'DekesHandoff',
      entityId:       rowId,
      payload: {
        handoffId,
        eventType:    input.eventType,
        severity:     input.severity,
        httpStatus:   httpStatus || null,
        forwarded:    success,
        failReason:   httpErr?.message ?? null,
      },
      result: success ? 'SUCCESS' : 'FAILURE',
      riskTier: input.severity === 'high' || input.severity === 'critical' ? 'HIGH' : 'MEDIUM',
    })
  } catch (err: any) {
    // Never propagate — this function is always fire-and-forget
    console.error('[dekes-handoff] Unexpected error emitting handoff:', err?.message)
    // Attempt to mark as failed if we have a rowId
    if (rowId) {
      void (prisma as any).dekesHandoff.update({
        where: { id: rowId },
        data:  { status: 'failed', failedAt: new Date(), errorMessage: String(err?.message) },
      }).catch(() => {})
    }
  }
}
