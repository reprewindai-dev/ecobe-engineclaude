import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

import { env } from "../../config/env";
import { prisma } from "../db";
import {
  buildUuidV7,
  canonicalizeJson,
  hashCanonicalJson,
  normalizeIsoTimestamp,
  sha256Hex,
} from "./canonical";
import { getPglAttestationSigner } from "./signing";
import type {
  PglAttestationRecord,
  PglDecision,
  PglDecisionSummary,
  PglEventDraft,
  PglEventType,
  PglGovernanceContext,
  PglGovernanceValidationResult,
  PglOutcome,
  PglPreparedLifecycle,
  PglRiskClass,
  PglStoredEvent,
} from "./types";
import { PGL_VERSION } from "./types";

type DbClient = Prisma.TransactionClient | typeof prisma;

type PglDecisionLifecycleInput = {
  correlationId: string;
  decisionFrameId: string;
  riskClass: PglRiskClass;
  governance: PglGovernanceContext;
  validation: PglGovernanceValidationResult;
  routerDecision: string;
  decisionReasonCode: string;
  decisionReasonDetail: string;
  requestHashInput: unknown;
  responseHashInput: unknown;
  requestTimestamp?: string;
  validationTimestamp?: string;
  decisionTimestamp?: string;
  routerNodeId?: string;
  pglNodeId?: string;
  requestMetadata?: Record<string, unknown>;
  validationMetadata?: Record<string, unknown>;
  decisionMetadata?: Record<string, unknown>;
};

type PglErrorEventInput = {
  correlationId: string;
  governance: PglGovernanceContext;
  riskClass: PglRiskClass;
  subjectType: string;
  subjectId: string;
  parentSubjectId?: string | null;
  errorCode: string;
  errorDetail: string;
  inputHash: string;
  outputHash: string;
  timestamp?: string;
  routerNodeId?: string;
  pglNodeId?: string;
  metadata?: Record<string, unknown>;
};

type PglOperationalEventInput = {
  correlationId: string;
  governance: PglGovernanceContext;
  riskClass: PglRiskClass;
  eventType: Extract<
    PglEventType,
    "agent_step" | "tool_call" | "audit_persist_retry"
  >;
  decision: PglDecision;
  subjectType: string;
  subjectId: string;
  parentSubjectId?: string | null;
  decisionReasonCode: string;
  decisionReasonDetail: string;
  inputHash: string;
  outputHash: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  routerNodeId?: string;
  pglNodeId?: string;
};

type CorrelationHeadRow = {
  correlationId: string;
  nextSequence: number;
  lastEventHash: string | null;
};

type DecisionCorrelationRow = {
  decisionFrameId: string;
  correlationId: string;
};

type RetryQueueRow = {
  id: string;
  payload: PglPreparedLifecycle;
  attemptCount: number;
};

export class PglAuditError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PglAuditError";
  }
}

export function mapRouterDecisionToPglDecision(
  routerDecision: string,
): PglDecision {
  switch (routerDecision) {
    case "noop":
      return "noop";
    case "deny":
      return "deny";
    case "throttle":
      return "throttle";
    default:
      return "allow";
  }
}

export function mapDecisionToPglOutcome(
  decision: PglDecision,
  eventType: PglEventType,
): PglOutcome {
  if (eventType === "error") return "failed";

  switch (decision) {
    case "deny":
      return "denied";
    case "throttle":
      return "throttled";
    case "allow":
    case "noop":
    default:
      return "permitted";
  }
}

export function derivePglRiskClass(decisionMode: string): PglRiskClass {
  return decisionMode === "runtime_authorization" ? "high" : "low";
}

export function resolvePglGovernanceContext(input: {
  correlationId: string;
  decisionMode: string;
  policyVersion: string;
  waterPolicyProfile: string;
  criticality: string;
  preferredRegions: string[];
  selectedRegion?: string | null;
  workloadType?: string | null;
  facilityId?: string | null;
  signalSnapshotRef?: string | null;
}): PglGovernanceContext {
  const purpose = sanitizePurpose(input.workloadType) ?? input.decisionMode;
  const signalSnapshotRef =
    input.signalSnapshotRef ??
    `signal:${input.selectedRegion ?? input.preferredRegions[0] ?? "unknown"}`;

  return {
    governanceProfileId: `gprof_${sha256Hex(
      canonicalizeJson({
        decisionMode: input.decisionMode,
        waterPolicyProfile: input.waterPolicyProfile,
        criticality: input.criticality,
        facilityId: input.facilityId ?? null,
      }),
    ).slice(0, 12)}`,
    policySnapshotRef: `water:${input.policyVersion}:${input.waterPolicyProfile}`,
    signalSnapshotRef,
    purpose,
    operation: "ci_authorize",
    jurisdictionTags: deriveJurisdictionTags(
      input.preferredRegions,
      input.selectedRegion,
    ),
  };
}

export function validatePglGovernanceContext(input: {
  policyVersion: string;
  expectedPolicyVersion: string;
  governance: PglGovernanceContext;
}): PglGovernanceValidationResult {
  if (input.policyVersion !== input.expectedPolicyVersion) {
    return {
      ok: false,
      reasonCode: "PGL_POLICY_VERSION_MISMATCH",
      reasonDetail: `Expected ${input.expectedPolicyVersion}, received ${input.policyVersion}`,
    };
  }

  if (!input.governance.purpose.trim()) {
    return {
      ok: false,
      reasonCode: "PGL_PURPOSE_REQUIRED",
      reasonDetail: "Purpose is required for governance validation",
    };
  }

  if (input.governance.operation !== "ci_authorize") {
    return {
      ok: false,
      reasonCode: "PGL_OPERATION_UNSUPPORTED",
      reasonDetail: `Unsupported operation: ${input.governance.operation}`,
    };
  }

  return {
    ok: true,
    reasonCode: "POLICY_RULE_MATCH",
    reasonDetail: "Governance policy snapshot accepted for CI authorization",
  };
}

export function buildDecisionContextHash(input: {
  governance: PglGovernanceContext;
  correlationId: string;
}): string {
  return hashCanonicalJson({
    governance_profile_id: input.governance.governanceProfileId,
    policy_snapshot_ref: input.governance.policySnapshotRef,
    signal_snapshot_ref: input.governance.signalSnapshotRef,
    purpose: input.governance.purpose,
    operation: input.governance.operation,
    correlation_id: input.correlationId,
  });
}

export function preparePglDecisionLifecycle(
  input: PglDecisionLifecycleInput,
): PglPreparedLifecycle {
  return {
    correlationId: input.correlationId,
    decisionFrameId: input.decisionFrameId,
    riskClass: input.riskClass,
    governance: input.governance,
    validation: input.validation,
    routerDecision: input.routerDecision,
    decisionReasonCode: input.decisionReasonCode,
    decisionReasonDetail: input.decisionReasonDetail,
    requestTimestamp: normalizeIsoTimestamp(
      input.requestTimestamp ?? new Date(),
    ),
    validationTimestamp: normalizeIsoTimestamp(
      input.validationTimestamp ?? new Date(),
    ),
    decisionTimestamp: normalizeIsoTimestamp(
      input.decisionTimestamp ?? new Date(),
    ),
    inputHash: hashCanonicalJson(input.requestHashInput),
    sessionOutputHash: hashCanonicalJson({
      phase: "session_start",
      correlation_id: input.correlationId,
    }),
    validationOutputHash: hashCanonicalJson(input.validation),
    outputHash: hashCanonicalJson(input.responseHashInput),
    routerNodeId: input.routerNodeId ?? env.PGL_ROUTER_NODE_ID,
    pglNodeId: input.pglNodeId ?? env.PGL_NODE_ID,
    requestMetadata: input.requestMetadata ?? {},
    validationMetadata: input.validationMetadata ?? {},
    decisionMetadata: input.decisionMetadata ?? {},
  };
}

export async function persistPglDecisionLifecycle(
  client: DbClient,
  prepared: PglPreparedLifecycle,
): Promise<{
  events: PglStoredEvent[];
  attestation: PglAttestationRecord;
}> {
  const decisionContextHash = buildDecisionContextHash({
    governance: prepared.governance,
    correlationId: prepared.correlationId,
  });

  const events = await appendPglEvents(client, [
    {
      correlationId: prepared.correlationId,
      eventType: "session_start",
      timestamp: prepared.requestTimestamp,
      decisionContextHash,
      outcome: mapDecisionToPglOutcome("noop", "session_start"),
      decision: "noop",
      riskClass: prepared.riskClass,
      routerNodeId: prepared.routerNodeId,
      pglNodeId: prepared.pglNodeId,
      governance: prepared.governance,
      subjectType: "session",
      subjectId: `session:${prepared.correlationId}`,
      parentSubjectId: null,
      decisionReasonCode: "SESSION_STARTED",
      decisionReasonDetail:
        "CI authorization request accepted into the governance lifecycle",
      inputHash: prepared.inputHash,
      outputHash: prepared.sessionOutputHash,
      metadata: prepared.requestMetadata,
    },
    {
      correlationId: prepared.correlationId,
      eventType: "governance_validation",
      timestamp: prepared.validationTimestamp,
      decisionContextHash,
      outcome: mapDecisionToPglOutcome(
        prepared.validation.ok ? "allow" : "deny",
        "governance_validation",
      ),
      decision: prepared.validation.ok ? "allow" : "deny",
      riskClass: prepared.riskClass,
      routerNodeId: prepared.routerNodeId,
      pglNodeId: prepared.pglNodeId,
      governance: prepared.governance,
      subjectType: "request",
      subjectId: prepared.correlationId,
      parentSubjectId: `session:${prepared.correlationId}`,
      decisionReasonCode: prepared.validation.reasonCode,
      decisionReasonDetail: prepared.validation.reasonDetail,
      inputHash: prepared.inputHash,
      outputHash: prepared.validationOutputHash,
      metadata: prepared.validationMetadata,
    },
    {
      correlationId: prepared.correlationId,
      eventType: "router_decision",
      timestamp: prepared.decisionTimestamp,
      decisionContextHash,
      outcome: mapDecisionToPglOutcome(
        mapRouterDecisionToPglDecision(prepared.routerDecision),
        "router_decision",
      ),
      decision: mapRouterDecisionToPglDecision(prepared.routerDecision),
      riskClass: prepared.riskClass,
      routerNodeId: prepared.routerNodeId,
      pglNodeId: prepared.pglNodeId,
      governance: prepared.governance,
      subjectType: "decision_frame",
      subjectId: prepared.decisionFrameId,
      parentSubjectId: prepared.correlationId,
      decisionReasonCode: prepared.decisionReasonCode,
      decisionReasonDetail: prepared.decisionReasonDetail,
      inputHash: prepared.inputHash,
      outputHash: prepared.outputHash,
      metadata: prepared.decisionMetadata,
    },
  ]);

  const attestation = buildPglAttestation(events[events.length - 1]);
  await insertPglAttestation(client, attestation);

  return {
    events,
    attestation,
  };
}

export async function enqueuePglDecisionAuditRetry(
  client: DbClient,
  prepared: PglPreparedLifecycle,
  error: unknown,
) {
  const payloadJson = JSON.stringify(prepared);
  await client.$executeRaw(Prisma.sql`
    INSERT INTO pgl.audit_retries (
      id,
      decision_frame_id,
      correlation_id,
      payload,
      status,
      attempt_count,
      next_attempt_at,
      last_error,
      created_at,
      updated_at
    )
    VALUES (
      ${randomUUID()},
      ${prepared.decisionFrameId},
      ${prepared.correlationId},
      CAST(${payloadJson} AS jsonb),
      'PENDING',
      0,
      NOW(),
      ${formatError(error)},
      NOW(),
      NOW()
    )
    ON CONFLICT (decision_frame_id)
    DO UPDATE SET
      payload = EXCLUDED.payload,
      status = 'PENDING',
      next_attempt_at = NOW(),
      last_error = EXCLUDED.last_error,
      updated_at = NOW()
  `);
}

export async function processPglAuditRetryBatch(
  limit = env.PGL_AUDIT_RETRY_BATCH_SIZE,
) {
  const claimed = (await prisma.$queryRaw(Prisma.sql`
    WITH claimed AS (
      SELECT id
      FROM pgl.audit_retries
      WHERE status IN ('PENDING', 'FAILED')
        AND next_attempt_at <= NOW()
      ORDER BY next_attempt_at ASC, created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE pgl.audit_retries AS retry
    SET
      status = 'PROCESSING',
      attempt_count = retry.attempt_count + 1,
      updated_at = NOW()
    FROM claimed
    WHERE retry.id = claimed.id
    RETURNING
      retry.id AS "id",
      retry.payload AS "payload",
      retry.attempt_count AS "attemptCount"
  `)) as RetryQueueRow[];

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const retry of claimed) {
    processed += 1;

    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await persistPglDecisionLifecycle(tx, retry.payload);
      });

      await prisma.$executeRaw(Prisma.sql`
        UPDATE pgl.audit_retries
        SET
          status = 'COMPLETED',
          last_error = NULL,
          updated_at = NOW()
        WHERE id = ${retry.id}
      `);
      succeeded += 1;
    } catch (error) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE pgl.audit_retries
        SET
          status = 'FAILED',
          last_error = ${formatError(error)},
          next_attempt_at = ${computeRetryBackoffTimestamp(retry.attemptCount)},
          updated_at = NOW()
        WHERE id = ${retry.id}
      `);
      failed += 1;
    }
  }

  return {
    processed,
    succeeded,
    failed,
  };
}

export async function appendPglOperationalEvent(
  client: DbClient,
  input: PglOperationalEventInput,
) {
  const [event] = await appendPglEvents(client, [
    {
      correlationId: input.correlationId,
      eventType: input.eventType,
      timestamp: normalizeIsoTimestamp(input.timestamp ?? new Date()),
      decisionContextHash: buildDecisionContextHash({
        governance: input.governance,
        correlationId: input.correlationId,
      }),
      outcome: mapDecisionToPglOutcome(input.decision, input.eventType),
      decision: input.decision,
      riskClass: input.riskClass,
      routerNodeId: input.routerNodeId ?? env.PGL_ROUTER_NODE_ID,
      pglNodeId: input.pglNodeId ?? env.PGL_NODE_ID,
      governance: input.governance,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      parentSubjectId: input.parentSubjectId ?? input.correlationId,
      decisionReasonCode: input.decisionReasonCode,
      decisionReasonDetail: input.decisionReasonDetail,
      inputHash: input.inputHash,
      outputHash: input.outputHash,
      metadata: input.metadata ?? {},
    },
  ]);

  return event;
}

export async function recordPglErrorEventBestEffort(input: PglErrorEventInput) {
  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await appendPglEvents(tx, [
        {
          correlationId: input.correlationId,
          eventType: "error",
          timestamp: normalizeIsoTimestamp(input.timestamp ?? new Date()),
          decisionContextHash: buildDecisionContextHash({
            governance: input.governance,
            correlationId: input.correlationId,
          }),
          outcome: "failed",
          decision: "deny",
          riskClass: input.riskClass,
          routerNodeId: input.routerNodeId ?? env.PGL_ROUTER_NODE_ID,
          pglNodeId: input.pglNodeId ?? env.PGL_NODE_ID,
          governance: input.governance,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          parentSubjectId: input.parentSubjectId ?? input.correlationId,
          decisionReasonCode: input.errorCode,
          decisionReasonDetail: input.errorDetail,
          errorCode: input.errorCode,
          errorDetail: input.errorDetail,
          inputHash: input.inputHash,
          outputHash: input.outputHash,
          metadata: input.metadata ?? {},
        },
      ]);
    });
  } catch (error) {
    console.warn("Best-effort PGL error recording failed", error);
  }
}

export async function getPglSummaryMapByDecisionFrameIds(
  client: DbClient,
  decisionFrameIds: string[],
): Promise<Map<string, PglDecisionSummary>> {
  if (decisionFrameIds.length === 0) return new Map();

  const frameIds = Prisma.join(decisionFrameIds.map((id) => Prisma.sql`${id}`));
  const rows = (await client.$queryRaw(Prisma.sql`
    WITH decision_events AS (
      SELECT DISTINCT ON (subject_id)
        subject_id AS "decisionFrameId",
        correlation_id AS "correlationId",
        risk_class AS "riskClass",
        event_hash AS "eventHash"
      FROM pgl.events
      WHERE event_type = 'router_decision'
        AND subject_type = 'decision_frame'
        AND subject_id IN (${frameIds})
      ORDER BY subject_id, sequence DESC
    ),
    event_counts AS (
      SELECT
        correlation_id AS "correlationId",
        COUNT(*)::int AS "eventCount"
      FROM pgl.events
      WHERE correlation_id IN (SELECT "correlationId" FROM decision_events)
      GROUP BY correlation_id
    ),
    retry_state AS (
      SELECT
        decision_frame_id AS "decisionFrameId",
        status
      FROM pgl.audit_retries
      WHERE decision_frame_id IN (${frameIds})
        AND status <> 'COMPLETED'
    )
    SELECT
      decision_events."decisionFrameId",
      decision_events."correlationId",
      decision_events."riskClass",
      CASE
        WHEN retry_state."decisionFrameId" IS NOT NULL THEN 'retry_pending'
        WHEN attestations.event_hash IS NOT NULL THEN 'attested'
        ELSE 'recorded'
      END AS "pglStatus",
      attestations.event_hash AS "attestationRef",
      COALESCE(event_counts."eventCount", 0) AS "eventCount"
    FROM decision_events
    LEFT JOIN pgl.attestations AS attestations
      ON attestations.event_hash = decision_events."eventHash"
    LEFT JOIN event_counts
      ON event_counts."correlationId" = decision_events."correlationId"
    LEFT JOIN retry_state
      ON retry_state."decisionFrameId" = decision_events."decisionFrameId"
  `)) as PglDecisionSummary[];

  return new Map(
    rows.map((row: PglDecisionSummary) => [row.decisionFrameId, row]),
  );
}

export async function getPglSummaryByDecisionFrameId(
  client: DbClient,
  decisionFrameId: string,
): Promise<PglDecisionSummary | null> {
  return (
    (await getPglSummaryMapByDecisionFrameIds(client, [decisionFrameId])).get(
      decisionFrameId,
    ) ?? null
  );
}

export async function getPglChainByCorrelationId(
  client: DbClient,
  correlationId: string,
) {
  return (await client.$queryRaw(Prisma.sql`
    SELECT
      events.version AS "version",
      events.event_id AS "eventId",
      events.correlation_id AS "correlationId",
      events.sequence AS "sequence",
      events.event_type AS "eventType",
      events."timestamp" AS "timestamp",
      events.prev_event_hash AS "prevEventHash",
      events.event_hash AS "eventHash",
      events.decision_context_hash AS "decisionContextHash",
      events.outcome AS "outcome",
      events.decision AS "decision",
      events.risk_class AS "riskClass",
      events.router_node_id AS "routerNodeId",
      events.pgl_node_id AS "pglNodeId",
      events.governance_profile_id AS "governanceProfileId",
      events.policy_snapshot_ref AS "policySnapshotRef",
      events.signal_snapshot_ref AS "signalSnapshotRef",
      events.purpose AS "purpose",
      events.jurisdiction_tags AS "jurisdictionTags",
      events.operation AS "operation",
      events.subject_type AS "subjectType",
      events.subject_id AS "subjectId",
      events.parent_subject_id AS "parentSubjectId",
      events.decision_reason_code AS "decisionReasonCode",
      events.decision_reason_detail AS "decisionReasonDetail",
      events.error_code AS "errorCode",
      events.error_detail AS "errorDetail",
      events.input_hash AS "inputHash",
      events.output_hash AS "outputHash",
      events.metadata AS "metadata",
      attestations.alg AS "attestationAlg",
      attestations.key_id AS "attestationKeyId",
      attestations.signature AS "attestationSignature",
      attestations."timestamp" AS "attestationTimestamp"
    FROM pgl.events AS events
    LEFT JOIN pgl.attestations AS attestations
      ON attestations.event_hash = events.event_hash
    WHERE events.correlation_id = ${correlationId}
    ORDER BY events.sequence ASC
  `)) as Array<Record<string, unknown>>;
}

export async function getPglChainByDecisionFrameId(
  client: DbClient,
  decisionFrameId: string,
) {
  const correlation = await findCorrelationIdByDecisionFrameId(
    client,
    decisionFrameId,
  );
  if (!correlation) return null;

  return {
    decisionFrameId,
    correlationId: correlation.correlationId,
    events: await getPglChainByCorrelationId(client, correlation.correlationId),
  };
}

export async function getPglAttestationByEventHash(
  client: DbClient,
  eventHash: string,
) {
  const rows = (await client.$queryRaw(Prisma.sql`
    SELECT
      id AS "id",
      alg AS "alg",
      key_id AS "keyId",
      signature AS "signature",
      event_hash AS "eventHash",
      decision_context_hash AS "decisionContextHash",
      "timestamp" AS "timestamp",
      correlation_id AS "correlationId",
      created_at AS "createdAt"
    FROM pgl.attestations
    WHERE event_hash = ${eventHash}
    LIMIT 1
  `)) as Array<Record<string, unknown>>;

  return rows[0] ?? null;
}

function sanitizePurpose(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deriveJurisdictionTags(
  preferredRegions: string[],
  selectedRegion?: string | null,
) {
  const tags = new Set<string>();

  for (const region of [selectedRegion, ...preferredRegions].filter(
    Boolean,
  ) as string[]) {
    const normalized = region.toLowerCase();
    if (normalized.startsWith("eu-")) tags.add("EU");
    else if (normalized.startsWith("us-")) tags.add("US");
    else if (normalized.startsWith("ap-")) tags.add("APAC");
    else tags.add(region.toUpperCase());
  }

  return Array.from(tags);
}

async function appendPglEvents(
  client: DbClient,
  drafts: PglEventDraft[],
): Promise<PglStoredEvent[]> {
  if (drafts.length === 0) return [];

  const correlationId = drafts[0].correlationId;
  await ensureCorrelationHead(client, correlationId);
  const head = await lockCorrelationHead(client, correlationId);

  let nextSequence = head.nextSequence;
  let previousHash = head.lastEventHash;
  const storedEvents: PglStoredEvent[] = [];

  for (const draft of drafts) {
    const stored = buildStoredEvent({
      ...draft,
      timestamp: normalizeIsoTimestamp(draft.timestamp),
      sequence: nextSequence,
      prevEventHash: previousHash,
    });
    await insertPglEvent(client, stored);
    storedEvents.push(stored);
    previousHash = stored.event_hash;
    nextSequence += 1;
  }

  await client.$executeRaw(Prisma.sql`
    UPDATE pgl.correlation_heads
    SET
      next_sequence = ${nextSequence},
      last_event_hash = ${previousHash},
      updated_at = NOW()
    WHERE correlation_id = ${correlationId}
  `);

  return storedEvents;
}

function buildStoredEvent(
  input: PglEventDraft & { sequence: number; prevEventHash: string | null },
): PglStoredEvent {
  const payload = {
    version: PGL_VERSION,
    event_id: buildUuidV7(input.timestamp),
    correlation_id: input.correlationId,
    sequence: input.sequence,
    event_type: input.eventType,
    timestamp: input.timestamp,
    prev_event_hash: input.prevEventHash,
    decision_context_hash: input.decisionContextHash,
    outcome: input.outcome,
    decision: input.decision,
    risk_class: input.riskClass,
    router_node_id: input.routerNodeId,
    pgl_node_id: input.pglNodeId,
    governance_profile_id: input.governance.governanceProfileId,
    policy_snapshot_ref: input.governance.policySnapshotRef,
    signal_snapshot_ref: input.governance.signalSnapshotRef,
    purpose: input.governance.purpose,
    jurisdiction_tags: input.governance.jurisdictionTags,
    operation: input.governance.operation,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    parent_subject_id: input.parentSubjectId ?? null,
    decision_reason_code: input.decisionReasonCode,
    decision_reason_detail: input.decisionReasonDetail,
    error_code: input.errorCode ?? null,
    error_detail: input.errorDetail ?? null,
    input_hash: input.inputHash,
    output_hash: input.outputHash,
  };

  return {
    ...payload,
    event_hash: sha256Hex(canonicalizeJson(payload)),
    metadata: input.metadata ?? {},
  };
}

function buildPglAttestation(event: PglStoredEvent): PglAttestationRecord {
  const signer = getPglAttestationSigner();
  const timestamp = normalizeIsoTimestamp(new Date());
  return {
    attestationId: randomUUID(),
    alg: signer.alg,
    keyId: signer.keyId,
    signature: signer.sign({
      event_hash: event.event_hash,
      decision_context_hash: event.decision_context_hash,
      correlation_id: event.correlation_id,
      timestamp,
    }),
    eventHash: event.event_hash,
    decisionContextHash: event.decision_context_hash,
    timestamp,
    correlationId: event.correlation_id,
  };
}

async function insertPglEvent(client: DbClient, event: PglStoredEvent) {
  const metadataJson = JSON.stringify(event.metadata ?? {});
  await client.$executeRaw(Prisma.sql`
    INSERT INTO pgl.events (
      version,
      event_id,
      correlation_id,
      sequence,
      event_type,
      "timestamp",
      prev_event_hash,
      event_hash,
      decision_context_hash,
      outcome,
      decision,
      risk_class,
      router_node_id,
      pgl_node_id,
      governance_profile_id,
      policy_snapshot_ref,
      signal_snapshot_ref,
      purpose,
      jurisdiction_tags,
      operation,
      subject_type,
      subject_id,
      parent_subject_id,
      decision_reason_code,
      decision_reason_detail,
      error_code,
      error_detail,
      input_hash,
      output_hash,
      metadata,
      created_at
    )
    VALUES (
      ${event.version},
      ${event.event_id},
      ${event.correlation_id},
      ${event.sequence},
      ${event.event_type},
      ${event.timestamp},
      ${event.prev_event_hash},
      ${event.event_hash},
      ${event.decision_context_hash},
      ${event.outcome},
      ${event.decision},
      ${event.risk_class},
      ${event.router_node_id},
      ${event.pgl_node_id},
      ${event.governance_profile_id},
      ${event.policy_snapshot_ref},
      ${event.signal_snapshot_ref},
      ${event.purpose},
      ${textArraySql(event.jurisdiction_tags)},
      ${event.operation},
      ${event.subject_type},
      ${event.subject_id},
      ${event.parent_subject_id},
      ${event.decision_reason_code},
      ${event.decision_reason_detail},
      ${event.error_code},
      ${event.error_detail},
      ${event.input_hash},
      ${event.output_hash},
      CAST(${metadataJson} AS jsonb),
      NOW()
    )
  `);
}

async function insertPglAttestation(
  client: DbClient,
  attestation: PglAttestationRecord,
) {
  await client.$executeRaw(Prisma.sql`
    INSERT INTO pgl.attestations (
      id,
      alg,
      key_id,
      signature,
      event_hash,
      decision_context_hash,
      "timestamp",
      correlation_id,
      created_at
    )
    VALUES (
      ${attestation.attestationId},
      ${attestation.alg},
      ${attestation.keyId},
      ${attestation.signature},
      ${attestation.eventHash},
      ${attestation.decisionContextHash},
      ${attestation.timestamp},
      ${attestation.correlationId},
      NOW()
    )
  `);
}

async function ensureCorrelationHead(client: DbClient, correlationId: string) {
  await client.$executeRaw(Prisma.sql`
    INSERT INTO pgl.correlation_heads (
      correlation_id,
      next_sequence,
      last_event_hash,
      updated_at
    )
    VALUES (
      ${correlationId},
      0,
      NULL,
      NOW()
    )
    ON CONFLICT (correlation_id) DO NOTHING
  `);
}

async function lockCorrelationHead(
  client: DbClient,
  correlationId: string,
): Promise<CorrelationHeadRow> {
  const rows = (await client.$queryRaw(Prisma.sql`
    SELECT
      correlation_id AS "correlationId",
      next_sequence AS "nextSequence",
      last_event_hash AS "lastEventHash"
    FROM pgl.correlation_heads
    WHERE correlation_id = ${correlationId}
    FOR UPDATE
  `)) as CorrelationHeadRow[];

  const row = rows[0];
  if (!row) {
    throw new Error(`Missing PGL correlation head for ${correlationId}`);
  }

  return row;
}

async function findCorrelationIdByDecisionFrameId(
  client: DbClient,
  decisionFrameId: string,
) {
  const rows = (await client.$queryRaw(Prisma.sql`
    SELECT
      subject_id AS "decisionFrameId",
      correlation_id AS "correlationId"
    FROM pgl.events
    WHERE event_type = 'router_decision'
      AND subject_type = 'decision_frame'
      AND subject_id = ${decisionFrameId}
    ORDER BY sequence DESC
    LIMIT 1
  `)) as DecisionCorrelationRow[];

  return rows[0] ?? null;
}

function computeRetryBackoffTimestamp(attemptCount: number) {
  const backoffMs = Math.max(
    env.PGL_AUDIT_RETRY_BASE_MS,
    env.PGL_AUDIT_RETRY_BASE_MS * attemptCount,
  );
  return new Date(Date.now() + backoffMs);
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, 1000);
  }

  return String(error).slice(0, 1000);
}

function textArraySql(values: string[]) {
  if (values.length === 0) {
    return Prisma.sql`ARRAY[]::text[]`;
  }

  return Prisma.sql`ARRAY[${Prisma.join(values.map((value) => Prisma.sql`${value}`))}]::text[]`;
}
