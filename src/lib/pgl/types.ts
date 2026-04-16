export const PGL_VERSION = "pgl.v0";

export const PGL_EVENT_TYPES = [
  "session_start",
  "governance_validation",
  "router_decision",
  "agent_step",
  "tool_call",
  "audit_persist_retry",
  "error",
] as const;

export const PGL_DECISIONS = ["allow", "deny", "throttle", "noop"] as const;
export const PGL_OUTCOMES = [
  "permitted",
  "denied",
  "throttled",
  "failed",
] as const;
export const PGL_RETRY_STATUSES = [
  "PENDING",
  "PROCESSING",
  "FAILED",
  "COMPLETED",
] as const;

export type PglEventType = (typeof PGL_EVENT_TYPES)[number];
export type PglDecision = (typeof PGL_DECISIONS)[number];
export type PglOutcome = (typeof PGL_OUTCOMES)[number];
export type PglRetryStatus = (typeof PGL_RETRY_STATUSES)[number];
export type PglRiskClass = "low" | "high";

export type PglGovernanceContext = {
  governanceProfileId: string;
  policySnapshotRef: string;
  signalSnapshotRef: string;
  purpose: string;
  operation: string;
  jurisdictionTags: string[];
};

export type PglGovernanceValidationResult = {
  ok: boolean;
  reasonCode: string;
  reasonDetail: string;
};

export type PglPreparedLifecycle = {
  correlationId: string;
  decisionFrameId: string;
  riskClass: PglRiskClass;
  governance: PglGovernanceContext;
  validation: PglGovernanceValidationResult;
  routerDecision: string;
  decisionReasonCode: string;
  decisionReasonDetail: string;
  requestTimestamp: string;
  validationTimestamp: string;
  decisionTimestamp: string;
  inputHash: string;
  sessionOutputHash: string;
  validationOutputHash: string;
  outputHash: string;
  routerNodeId: string;
  pglNodeId: string;
  requestMetadata: Record<string, unknown>;
  validationMetadata: Record<string, unknown>;
  decisionMetadata: Record<string, unknown>;
};

export type PglEventDraft = {
  correlationId: string;
  eventType: PglEventType;
  timestamp: string;
  decisionContextHash: string;
  outcome: PglOutcome;
  decision: PglDecision;
  riskClass: PglRiskClass;
  routerNodeId: string;
  pglNodeId: string;
  governance: PglGovernanceContext;
  subjectType: string;
  subjectId: string;
  parentSubjectId?: string | null;
  decisionReasonCode: string;
  decisionReasonDetail: string;
  errorCode?: string | null;
  errorDetail?: string | null;
  inputHash: string;
  outputHash: string;
  metadata?: Record<string, unknown>;
};

export type PglStoredEvent = {
  version: string;
  event_id: string;
  correlation_id: string;
  sequence: number;
  event_type: PglEventType;
  timestamp: string;
  prev_event_hash: string | null;
  event_hash: string;
  decision_context_hash: string;
  outcome: PglOutcome;
  decision: PglDecision;
  risk_class: PglRiskClass;
  router_node_id: string;
  pgl_node_id: string;
  governance_profile_id: string;
  policy_snapshot_ref: string;
  signal_snapshot_ref: string;
  purpose: string;
  jurisdiction_tags: string[];
  operation: string;
  subject_type: string;
  subject_id: string;
  parent_subject_id: string | null;
  decision_reason_code: string;
  decision_reason_detail: string;
  error_code: string | null;
  error_detail: string | null;
  input_hash: string;
  output_hash: string;
  metadata: Record<string, unknown>;
};

export type PglAttestationRecord = {
  attestationId: string;
  alg: string;
  keyId: string;
  signature: string;
  eventHash: string;
  decisionContextHash: string;
  timestamp: string;
  correlationId: string;
};

export type PglDecisionSummary = {
  decisionFrameId: string;
  correlationId: string;
  riskClass: string;
  pglStatus: string;
  attestationRef: string | null;
  eventCount: number;
};
