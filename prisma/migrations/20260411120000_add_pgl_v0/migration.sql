CREATE SCHEMA IF NOT EXISTS pgl;

CREATE TABLE pgl.events (
    version TEXT NOT NULL,
    event_id TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL,
    prev_event_hash TEXT,
    event_hash TEXT NOT NULL,
    decision_context_hash TEXT NOT NULL,
    outcome TEXT NOT NULL,
    decision TEXT NOT NULL,
    risk_class TEXT NOT NULL,
    router_node_id TEXT NOT NULL,
    pgl_node_id TEXT NOT NULL,
    governance_profile_id TEXT NOT NULL,
    policy_snapshot_ref TEXT NOT NULL,
    signal_snapshot_ref TEXT NOT NULL,
    purpose TEXT NOT NULL,
    jurisdiction_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    operation TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    parent_subject_id TEXT,
    decision_reason_code TEXT NOT NULL,
    decision_reason_detail TEXT NOT NULL,
    error_code TEXT,
    error_detail TEXT,
    input_hash TEXT NOT NULL,
    output_hash TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pgl_events_pkey PRIMARY KEY (event_id),
    CONSTRAINT pgl_events_correlation_sequence_key UNIQUE (correlation_id, sequence),
    CONSTRAINT pgl_events_event_hash_key UNIQUE (event_hash),
    CONSTRAINT pgl_events_event_type_check CHECK (event_type IN (
        'session_start',
        'governance_validation',
        'router_decision',
        'agent_step',
        'tool_call',
        'audit_persist_retry',
        'error'
    )),
    CONSTRAINT pgl_events_outcome_check CHECK (outcome IN ('permitted', 'denied', 'throttled', 'failed')),
    CONSTRAINT pgl_events_decision_check CHECK (decision IN ('allow', 'deny', 'throttle', 'noop'))
);

CREATE INDEX pgl_events_correlation_created_idx ON pgl.events (correlation_id, created_at);
CREATE INDEX pgl_events_subject_idx ON pgl.events (subject_type, subject_id, created_at);
CREATE INDEX pgl_events_event_type_idx ON pgl.events (event_type, created_at);
CREATE INDEX pgl_events_risk_class_idx ON pgl.events (risk_class, created_at);

CREATE TABLE pgl.attestations (
    id TEXT NOT NULL,
    alg TEXT NOT NULL,
    key_id TEXT NOT NULL,
    signature TEXT NOT NULL,
    event_hash TEXT NOT NULL,
    decision_context_hash TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL,
    correlation_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pgl_attestations_pkey PRIMARY KEY (id),
    CONSTRAINT pgl_attestations_event_hash_key UNIQUE (event_hash),
    CONSTRAINT pgl_attestations_event_hash_fkey FOREIGN KEY (event_hash) REFERENCES pgl.events(event_hash) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX pgl_attestations_correlation_idx ON pgl.attestations (correlation_id, created_at);

CREATE TABLE pgl.correlation_heads (
    correlation_id TEXT NOT NULL,
    next_sequence INTEGER NOT NULL DEFAULT 0,
    last_event_hash TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pgl_correlation_heads_pkey PRIMARY KEY (correlation_id)
);

CREATE TABLE pgl.audit_retries (
    id TEXT NOT NULL,
    decision_frame_id TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pgl_audit_retries_pkey PRIMARY KEY (id),
    CONSTRAINT pgl_audit_retries_decision_frame_id_key UNIQUE (decision_frame_id),
    CONSTRAINT pgl_audit_retries_status_check CHECK (status IN ('PENDING', 'PROCESSING', 'FAILED', 'COMPLETED'))
);

CREATE INDEX pgl_audit_retries_status_idx ON pgl.audit_retries (status, next_attempt_at, created_at);
CREATE INDEX pgl_audit_retries_correlation_idx ON pgl.audit_retries (correlation_id, created_at);

CREATE OR REPLACE FUNCTION pgl.raise_append_only_error()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PGL append-only table "%" cannot be mutated in place', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER pgl_events_append_only_update
BEFORE UPDATE ON pgl.events
FOR EACH ROW
EXECUTE FUNCTION pgl.raise_append_only_error();

CREATE TRIGGER pgl_events_append_only_delete
BEFORE DELETE ON pgl.events
FOR EACH ROW
EXECUTE FUNCTION pgl.raise_append_only_error();

CREATE TRIGGER pgl_attestations_append_only_update
BEFORE UPDATE ON pgl.attestations
FOR EACH ROW
EXECUTE FUNCTION pgl.raise_append_only_error();

CREATE TRIGGER pgl_attestations_append_only_delete
BEFORE DELETE ON pgl.attestations
FOR EACH ROW
EXECUTE FUNCTION pgl.raise_append_only_error();
