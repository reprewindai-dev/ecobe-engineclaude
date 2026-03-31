# CO2 Router Governance, Lineage, and Audit Spec

## Access control
### Roles
- `system`
  - internal workers, dispatchers, verifier endpoints
  - authenticated with `ECOBE_INTERNAL_API_KEY`
- `admin`
  - operational console and manual inspection surfaces
  - authenticated with `UI_TOKEN`
- `operator`
  - future tenant or support operator role
  - read access to tenant-scoped operational state and proofs
- `client`
  - tenant-scoped consumer of decision, proof, replay, and billing outputs

### Row-level isolation
- All tenant-bearing gold and platinum tables must include `tenant_id` or `organization_id`
- Tenant reads must filter by tenant boundary before returning data
- Cross-tenant analytics are system-only

### Column-level handling
- Secrets, auth tokens, webhook credentials, and provider credentials never persist in queryable business tables
- Internal signatures and auth headers are redacted from public or tenant-facing surfaces
- Raw inbound headers captured for audit stay system-only

## Lineage model
### Decision lineage
- Every decision is reconstructable from:
  - caller request
  - normalized candidate set
  - water authority artifact state
  - governance output
  - proof envelope
  - trace chain position
- Canonical lineage chain:
  - raw provider signal -> normalized routing signal -> policy input assembly -> ci decision fact -> decision trace ledger -> outbox event

### Table-level lineage
- `provider_signal_raw` -> `routing_signal_normalized`
- `water_artifact_raw` -> `water_authority_normalized`
- `routing_signal_normalized` + `water_authority_normalized` + request payload -> `policy_input_assembly`
- `policy_input_assembly` -> `ci_decision_fact`
- `ci_decision_fact` + frozen inputs -> `decision_trace_ledger`
- `ci_decision_fact` + `decision_trace_ledger` -> `decision_event_outbox_fact`
- gold facts -> platinum rollups

### Column-level lineage
- `decision_trace_ledger.payload.inputSignals.request`
  - derived from normalized inbound request body
- `decision_trace_ledger.payload.normalizedSignals.candidates[*].score`
  - derived from routing candidate evaluation
- `decision_trace_ledger.payload.governance.source`
  - derived from active policy adapter selection
- `decision_trace_ledger.payload.proof.proofHash`
  - derived from proof seed assembly and hash canonicalization
- `decision_slo_rollup.p95_total_ms`
  - derived from `ci_decision_fact.latency_total_ms`

## Audit model
### Immutable records
- `DecisionTraceEnvelope` is append-only
- raw inbound event capture is append-only
- proof chain references are append-only
- outbox state transitions are update-based operational records, but delivery receipts are additive

### Proof chain
- Each trace row contains:
  - `traceHash`
  - `previousTraceHash`
  - `inputSignalHash`
- Chain continuity rule:
  - each new row references the prior trace hash
  - mismatched predecessor hash is a hard audit failure

### Replay verification
- Replay input must use the exact frozen request and resolved candidate overrides from the original frame
- Replay must not hit live providers for trace-backed post-migration frames
- Replay mismatch is always surfaced, never silently corrected
- Missing replay prerequisites must fail loud

### Signed delivery verification
- Decision events are signed with `DECISION_EVENT_SIGNATURE_SECRET`
- Verification endpoint validates shape and captures receipt metadata
- Production verification requires at least one active sink plus verifier receipt

## Observability
### Core metrics
- p50/p95/p99 total latency
- p50/p95/p99 compute latency
- provider freshness and degradation rate
- trace coverage
- replay deterministic match rate
- outbox lag
- outbox failure rate
- dead-letter count
- water dataset verification coverage
- governance-enabled decision share

### Alerts
- outbox lag breach
- outbox failure rate breach
- dead-letter breach
- water artifact health failure
- provider freshness breach
- replay mismatch
- p95 latency breach
- governance source unexpectedly `NONE`

## Data classification
### Sensitive
- auth tokens
- webhook secrets
- provider credentials
- internal API keys
- Stripe credentials
- JWT secrets

### Controlled operational data
- raw inbound headers
- internal signatures
- sink URLs
- tenant billing facts

### Non-sensitive but auditable
- decision outcomes
- trace hashes
- proof hashes
- dataset hashes
- region-level carbon and water signals

## Mutation rules
- No silent mutation of trace, proof, or raw ingest records
- Corrections require additive superseding records, not rewrite-in-place
- Operational status fields may update on outbox rows, counters, and rollups
- Replay payloads for historic frames are immutable after append

## Deterministic replay constraints
- Freeze time with recorded timestamp
- Freeze candidate set with stored overrides
- Freeze water bundle references by recorded bundle and manifest hashes
- Freeze governance output by persisted source, thresholds, and weights when present
- Reject replay if required frozen inputs are absent
