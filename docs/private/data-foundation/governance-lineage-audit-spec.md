# ECOBE / CO2 Router Governance, Lineage, and Audit Spec

## 1. Access Control Model

### Roles

- `admin`
  - Platform-level operational authority.
  - Can administer tenants, retention classes, signing keys, catalog mappings, and incident workflows.
  - Cannot bypass append-only or proof-chain controls.
- `operator`
  - Tenant-scoped or platform-scoped runtime operator.
  - Can inspect Bronze through Gold facts for authorized tenants, trigger replay verification, and redrive quarantined or dead-letter work.
  - Cannot read restricted secret columns without explicit break-glass approval.
- `client`
  - Tenant customer user.
  - Can read only tenant-owned Gold and Platinum outputs approved for customer access.
  - Can request exports and replay verification for the tenant's own decision frames.
- `system`
  - Non-human service principal.
  - Scope-limited to declared pipeline stages, delivery workers, signing services, or export workers.
  - Access is purpose-bound and time-bound through short-lived credentials.

### Row-Level Security

- All tenant-scoped Silver, Gold, and Platinum tables must include `tenant_id`.
- Postgres RLS policy for tenant reads:
  - `tenant_id = current_setting('app.tenant_id')::uuid`
- Postgres RLS policy for tenant writes:
  - service role must match both `tenant_id` and `current_setting('app.pipeline_stage')`
- `client` role is further constrained by `account_id` where account-scoped access exists.
- Cross-tenant benchmark tables never expose raw tenant rows; only privacy-screened aggregates are readable.
- Bronze tables containing global provider data are readable only by `admin`, `operator`, and declared `system` stages.

### Column-Level Security

- Restricted columns must use column-level masking or envelope encryption:
  - `headers_json`
  - raw request payloads containing customer runtime context
  - signed payload bodies before disclosure approval
  - signing material references beyond key ids
  - any billing contact or customer secret fields
- `client` role receives masked or omitted restricted columns by default.
- `operator` access to restricted columns requires explicit policy grant and is logged as an audit event.
- `admin` access to restricted columns requires justification metadata for break-glass events.

### Identity and Session Controls

- Every session sets:
  - `app.role`
  - `app.tenant_id`
  - `app.account_id`
  - `app.request_id`
  - `app.pipeline_stage`
- All service principals rotate credentials automatically.
- Long-lived shared secrets are prohibited for data-plane access.

## 2. Lineage System

### Lineage Keys

- Every authoritative row must carry enough lineage to join back to its source path:
  - `tenant_id`
  - `decision_frame_id` when decision-scoped
  - `source_record_id` or source id array
  - `schema_version` or `canonical_schema_version`
  - `payload_sha256`, `canonical_input_hash`, `deterministic_trace_hash`, or equivalent content hash
  - `lineage_run_id` for pipeline execution provenance

### Table-Level Lineage Rules

- Bronze to Silver
  - `silver_provider_signal_canonical.source_record_id -> bronze_provider_signal_ingest.record_id`
  - `silver_policy_rule_version.source_record_id -> bronze_policy_input_ingest.record_id`
  - `silver_decision_input_envelope.source_decision_record_id -> bronze_decision_event_intake.record_id`
- Silver to Gold
  - `gold_routing_decision.input_envelope_id -> silver_decision_input_envelope.decision_input_id`
  - `gold_routing_decision.policy_trace_id -> silver_policy_evaluation_trace.evaluation_trace_id`
  - `gold_compliance_audit_fact.policy_version_id -> silver_policy_rule_version.policy_version_id`
- Gold to Platinum
  - Platinum aggregates reference a stable `source_snapshot_hash` or Gold grain ids used for publication.

### Column-Level Lineage Rules

- `gold_routing_decision.carbon_intensity_gco2_kwh`
  - derives from `silver_signal_state_reconciled.carbon_intensity_gco2_kwh`
- `gold_routing_decision.water_intensity_l_kwh`
  - derives from `silver_signal_state_reconciled.water_intensity_l_kwh`
- `gold_routing_decision.decision_reason_code`
  - derives from `silver_policy_evaluation_trace.rule_results` and engine scoring output
- `gold_proof_hash_chain_record.payload_hash`
  - derives from canonical serialization of Gold decision plus replay root plus trace hash
- `gold_account_usage_fact.billable_units`
  - derives from `silver_usage_meter_event.measured_value` aggregated by commercial dimension
- `platinum_customer_dashboard_daily.proof_coverage_pct`
  - derives from `gold_compliance_audit_fact.audit_exportable` and proof completeness indicators

### Lineage Storage and Querying

- Table-level lineage edges are registered in the catalog and mirrored into system tables.
- Column-level lineage is stored as deterministic mapping metadata, not inferred by AI.
- Every lineage edge is versioned with effective dates.
- Catalog lineage queries must support:
  - source-to-output traversal
  - output-to-source traversal
  - impact analysis for schema changes
  - replay dependency enumeration by `decision_frame_id`

## 3. Audit System

### Immutable Event Log Design

- Append-only required for:
  - Bronze ingest tables
  - Silver policy traces
  - Silver replay artifacts
  - Gold proof chain records
  - Gold delivery attempt logs
  - replay verification results
- Mutable operational state is allowed only when paired with append-only evidence:
  - `gold_signed_event_outbox.delivery_status` may change
  - every state transition must have a matching append-only `gold_event_delivery_attempt` or state-transition audit event
- Hard deletes are prohibited for authoritative evidence before retention expiry.

### Proof Hash-Chain Structure

- Chain grain:
  - per `tenant_id`
  - per `chain_name`
- Required fields:
  - `sequence_number`
  - `previous_hash`
  - `current_hash`
  - `payload_hash`
  - `signer_key_id`
  - `signature_alg`
  - `signature`
  - `anchored_at`
  - `verification_status`
- Hash input order is fixed and versioned.
- Hash-chain continuity must be verifiable from the first retained row through the latest row without gaps.
- Anchor targets may include internal notary, signed object manifest, or approved ledger target.

### Replay Verification Process

- Inputs
  - `tenant_id`
  - `decision_frame_id`
  - original `engine_build_ref`
  - original `canonical_schema_version`
  - original `policy_version_id`
  - original reconciled signal window
- Process
  - Load Bronze decision request, Bronze policy input, and Bronze provider ingests linked by lineage.
  - Resolve the exact Silver decision envelope, policy trace, replay artifacts, and reconciled signal state.
  - Re-execute decision computation using the recorded engine build and schema versions.
  - Recompute canonical input hash, deterministic trace hash, replay artifact root hash, decision outcome, and proof hash.
  - Compare recomputed values to stored Gold values.
  - Write a replay verification result as an append-only audit row.
- Success criteria
  - identical `decision_action`
  - identical `selected_region`
  - identical `decision_reason_code`
  - identical `canonical_input_hash`
  - identical `deterministic_trace_hash`
  - identical `proof_hash`
- Failure criteria
  - any mismatch is severity-critical and pages operators immediately.

### No Silent Mutation Rule

- Authoritative values are never updated in place without an explicit audit companion record.
- Reprocessing may add newer aggregate facts, but cannot rewrite historical Bronze payloads, Silver traces, or Gold proof rows.
- Corrections to published Platinum outputs require:
  - new snapshot version
  - reason code
  - operator identity
  - source snapshot hash delta

## 4. Observability

### Metrics

- Decisioning
  - decision latency p50, p95, p99
  - compute latency p50, p95, p99
  - action distribution by tenant and workload class
  - replay mismatch count
- Provider health
  - provider freshness seconds
  - provider confidence score
  - provider consensus percentage
  - provider fallback rate
- Delivery
  - outbox lag seconds
  - delivery success rate
  - dead-letter count
  - average attempts per endpoint
- Governance
  - proof chain gap count
  - lineage completeness rate
  - audit export readiness count
  - restricted-column access events
- Commercial
  - usage meter lag
  - billable unit reconciliation failures
  - export generation latency

### Alerts

- Critical
  - any replay mismatch
  - any proof chain gap
  - any lineage completeness drop below 100 percent for Gold decisions
  - provider freshness breach beyond hard stop threshold for the active provider basis
- Warning
  - p95 decision latency above target threshold
  - rising fallback provider rate
  - outbox backlog above SLA
  - repeated quarantine growth for one parser or tenant

### Anomaly Detection

- Daily anomaly jobs compare current values against trailing baselines for:
  - reroute rate
  - deny rate
  - provider freshness variance
  - webhook failure rate
  - billable unit drift
- Anomaly detection is assistive only.
- Anomaly classifications cannot become authoritative policy or compliance labels without human review.

## 5. Data Classification

### Classification Levels

- `public`
  - approved disclosure outputs only
  - privacy-screened benchmark aggregates only
- `internal`
  - non-tenant-specific provider facts
  - operational SLO aggregates without customer payload context
- `confidential`
  - tenant-specific Gold facts
  - Silver canonical envelopes
  - policy materializations
  - replay artifacts
  - usage facts
- `restricted`
  - raw webhook headers and signed inbound payloads
  - raw request payloads with customer runtime metadata
  - signing metadata beyond public key ids
  - break-glass access logs
  - any secret-bearing operational columns

### Handling Rules

- `public`
  - may be exported externally after approval workflow
- `internal`
  - available to `admin`, approved `operator`, and declared `system` roles
- `confidential`
  - tenant-scoped only; encrypted at rest; never used in cross-tenant outputs without aggregation
- `restricted`
  - encrypted at rest and in transit; masked by default; access requires explicit policy grant and audit logging

### AI Handling Constraint

- Assistive AI may summarize documentation, incident notes, or operator commentary.
- Assistive AI may not produce authoritative data classification, policy approval, or lineage truth.
- Any AI-enriched field used in governance must include `human_review_status` and remain non-authoritative until approved by a human.

## 6. Operational Enforcement

- Catalog registration is mandatory before any new table becomes writable.
- Every new pipeline stage must declare:
  - lineage keys
  - idempotency key
  - schema version
  - retention class
  - access classification
- Tenant onboarding is incomplete until:
  - RLS policies are active
  - delivery endpoints are versioned
  - proof signing keys are registered
  - replay verification succeeds on a seeded test decision
