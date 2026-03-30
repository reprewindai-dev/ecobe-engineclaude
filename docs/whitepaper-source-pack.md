# CO2 Router Whitepaper Source Pack

Last updated: 2026-03-29

## 1. Canonical source of truth

Use only these two repositories as the authoritative production source:

- Dashboard: `C:\Users\antho\.windsurf\ecobe-engineclaude\ecobe-dashboard`
- Engine: `C:\Users\antho\.windsurf\ecobe-engineclaude\ecobe-engine`

Current pushed commits:

- Dashboard GitHub `main`: `fd27133f3c475c3a4a2d33fe0f77986a51e82d84`
- Engine GitHub `main`: `bd988284677e245bb8def26a7b7f5986950ff8a1`

GitHub remotes:

- Dashboard: `https://github.com/reprewindai-dev/co2-router-dashboard.git`
- Engine: `https://github.com/reprewindai-dev/ecobe-engineclaude`

Public production URLs:

- Site: `https://co2router.com`
- Command center JSON: `https://co2router.com/api/control-surface/command-center`
- Engine base: `https://ecobe-engineclaude-production.up.railway.app`

Do not use side worktrees, nested repo copies, root wrapper files, demo folders, or archived landing folders as product evidence.

## 2. Product definition

CO2 Router is a deterministic pre-execution environmental execution control plane for compute.

It evaluates:

- carbon
- water
- latency
- cost
- policy

It returns exactly one binding outcome:

- `run_now`
- `reroute`
- `delay`
- `throttle`
- `deny`

It is not:

- a passive ESG dashboard
- a post-hoc reporting tool
- a generic scheduler
- a marketing concept product

## 3. Safe public claims

These claims are supported by the current canonical production system and documentation:

- Decisions are made before execution.
- Water can block or delay execution.
- Every new decision can produce proof, trace, and replay artifacts.
- Governance is active and exposed in the command center.
- The system records trace hashes and previous trace hashes for append-only trace continuity.
- The system emits signed decision events through an outbox.
- The water authority layer is backed by verified dataset provenance.
- The command center is powered by real runtime data, not mock data.

## 4. Claims to avoid right now

Do not claim these as fully closed or universally true without qualification:

- `p95 <= 100ms` is currently the rolling production truth window
- every provider is healthy globally at all times
- every public route is backed by a long-history persistent analytics store
- a separate published SDK ecosystem already exists
- broad enterprise customer adoption already exists

Current live nuance:

- current decision latency is low on fresh requests
- the persisted SLO window is still above target because older slow samples remain in the rolling window
- GridStatus and some regional carbon fallback sources are still honestly degraded/stale

## 5. Runtime architecture

### Dashboard service

- Framework: Next.js 14 App Router
- Purpose:
  - public site
  - command center
  - dashboard-side engine proxy/composition routes
- Canonical entrypoints:
  - `src/app/layout.tsx`
  - `src/app/page.tsx`
  - `src/app/console/page.tsx`

### Engine service

- Framework: Express + TypeScript
- Persistence:
  - Postgres via Prisma
  - Redis for cache/state
- Canonical entrypoints:
  - `src/server.ts`
  - `src/app.ts`

### Deploy topology

- Production is a two-service Railway deployment
- Dashboard deploy source: `ecobe-dashboard/Dockerfile`
- Engine deploy source: `ecobe-engine/Dockerfile`

## 6. Decision path

Actual execution order:

1. request validation and normalization
2. optional request signature validation
3. water artifact snapshot read
4. candidate region expansion
5. provider signal resolution per region
6. water authority assembly
7. water guardrail evaluation
8. governance evaluation
9. final action selection
10. proof and trace assembly
11. response finalization
12. persistence transaction
13. signed outbox event enqueue

Doctrine order:

1. policy overrides
2. water guardrails
3. latency and SLA protection
4. carbon optimization inside allowed envelope
5. cost as late influence

## 7. Governance and doctrine

Current active first-party governance source:

- `SEKED_INTERNAL_V1`

Governance payload fields in trace:

- `source`
- `score`
- `zone`
- `weights`
- `thresholds`
- `policyReference`
- `rationale`
- `constraintsApplied`

Zones:

- `green`
- `amber`
- `red`

Current doctrine reference:

- `docs/co2-router-doctrine.md`

## 8. Water authority and provenance

Verified dataset suppliers:

- Aqueduct
- AWARE
- WWF
- NREL

Canonical water artifact paths:

- raw source artifacts: `data/source/water`
- normalized bundle: `data/normalized/water/water.bundle.json`
- normalized manifest: `data/normalized/water/manifest.json`
- last-known-good artifacts: `data/normalized/water/.lkg`

Current truth model:

- water datasets are treated as verified static bundle providers
- they are not treated like real-time feeds
- provider health is based on provenance, hash validity, schema compatibility, and bundle TTL

## 9. Carbon and signal fabric

Primary/important providers in the live system:

- `WATTTIME_MOER`
- `GRIDSTATUS`
- `EIA_930`
- `EMBER_STRUCTURAL_BASELINE`
- `GB_CARBON`
- regional providers for Denmark and Finland where configured

Signal/cache design:

- minute-bucket routing cache
- current and next minute warming
- last-known-good routing records
- degraded provider short-circuiting
- Ember structural baseline treated as structural/TTL-backed, not as a real-time stream

## 10. Proof, trace, replay, and events

### Persisted proof and trace

Primary persistence models:

- `CIDecision`
- `DecisionTraceEnvelope`
- `WaterPolicyEvidence`

Trace continuity fields:

- `decisionFrameId`
- `sequenceNumber`
- `traceHash`
- `previousTraceHash`
- `inputSignalHash`

### Replay

Replay is available for trace-backed fresh frames and is designed to re-evaluate from stored decision inputs rather than from live provider calls.

### Event delivery

Decision event path:

- event schema: `DecisionEvaluatedV1`
- queue table: `DecisionEventOutbox`
- sink registry: `IntegrationWebhookSink`
- receipts: `IntegrationEvent`

Current runtime behavior:

- events are signed
- a system-managed verifier sink exists
- outbox delivery is asynchronous

## 11. What is actually collecting real data right now

This is the most important section for white papers, future public datasets, and defensibility.

### Real persisted production data

#### A. Decision records

Stored in:

- `CIDecision`
- `DashboardRoutingDecision`
- `RoutingDecision`
- `RoutingCandidate`
- `WorkloadDecisionOutcome`

What this gives you:

- total decision volume
- action distribution
- region selection patterns
- baseline vs selected environmental deltas
- fallback usage
- latency per decision

#### B. Trace records

Stored in:

- `DecisionTraceEnvelope`

What this gives you:

- trace coverage rate
- hash-chain continuity
- governance source coverage
- weight/threshold exposure
- candidate evaluation evidence

#### C. Water evidence

Stored in:

- `WaterPolicyEvidence`
- `WaterProviderSnapshot`
- `FacilityWaterTelemetry`
- `WaterScenarioRun`

What this gives you:

- water-driven decision evidence
- supplier references used in decisions
- authority mode distribution
- scenario-planning evidence

#### D. Provider integration health

Stored in:

- `IntegrationMetric`
- `IntegrationEvent`

What this gives you:

- provider success/failure counts
- last success / last failure
- last latency
- p95 latency by provider
- alert activation state

This is the right source for provider reliability reporting over time.

#### E. Carbon forecast quality

Stored in:

- `CarbonForecast`
- forecast verification audit events inside `IntegrationEvent`

What this gives you:

- predicted vs realized intensity
- forecast error percentage
- within-target accuracy rate
- by-region forecast quality

#### F. EIA / grid raw data

Stored in:

- `Eia930BalanceRaw`
- `Eia930InterchangeRaw`
- `Eia930SubregionRaw`
- `GridSignalSnapshot`

What this gives you:

- raw ingest evidence
- source freshness trail
- derived grid signal features

#### G. Event delivery evidence

Stored in:

- `DecisionEventOutbox`
- `IntegrationWebhookSink`
- `IntegrationEvent`

What this gives you:

- signed delivery attempts
- sent/failed/dead-letter distribution
- sink reliability
- operational integration evidence

### Runtime-only or short-window data

These are real, but not your best long-horizon white paper source unless you also persist/export them:

#### A. In-memory telemetry

Defined in:

- `src/lib/observability/telemetry.ts`

Examples:

- authorization decision latency
- provider resolution latency
- replay mismatch count
- outbox lag

Important:

- this is real runtime telemetry
- it is not a long-retention persistent warehouse by itself

#### B. Rolling SLO window

Exposed by:

- `/api/v1/ci/slo`

Important:

- it is real
- it reflects a rolling window
- it should be cited carefully if older slow samples are still inside the window

## 12. Worker and schedule map

Workers started on engine boot:

- forecast poller
- EIA ingestion worker
- intelligence scheduler
- forecast verification worker
- routing signal warm loop
- learning loop worker
- runtime supervisor
- decision event dispatcher

Important cadence examples:

- runtime supervisor: every configured interval, default operational cadence around 60 seconds
- decision event dispatcher: cron-driven
- forecast verification: every 30 minutes
- EIA ingestion: cron-driven, default quarter-hour cadence
- water bundle refresh workflow: scheduled in GitHub Actions

## 13. Real public evidence surfaces

These endpoints are valid source material for documentation and public evidence screens:

- `GET /api/v1/ci/health`
- `GET /api/v1/ci/slo`
- `GET /api/v1/water/provenance`
- `GET /api/v1/dashboard/provider-trust`
- `GET /api/control-surface/command-center`
- `GET /api/v1/ci/decisions`
- `GET /api/v1/ci/decisions/:decisionFrameId/trace`
- `GET /api/v1/ci/decisions/:decisionFrameId/replay`

## 14. Data sections you can publish after 30-60 days

Using the current real collection surfaces, you can publish:

- total decisions evaluated
- decisions by action: run_now / reroute / delay / throttle / deny
- region routing distribution
- carbon delta distribution
- water-driven block or delay frequency
- trace coverage percentage
- replay deterministic match percentage
- verified water supplier coverage
- provider uptime / reliability by source
- forecast accuracy by region
- outbox delivery success rate
- governance zone distribution

These can all be computed from existing persisted data without inventing synthetic datasets.

## 15. Recommended white paper sections

Tell Claude to produce these documents first:

1. Core white paper
   - category definition
   - doctrine
   - architecture
   - governance
   - proof / replay / assurance

2. Assurance and audit paper
   - provenance
   - trace hash chain
   - replay determinism
   - signed event delivery

3. Data methodology paper
   - provider hierarchy
   - water bundle methodology
   - structural vs live signals
   - degraded mode handling

4. Operations and resilience paper
   - workers
   - caching
   - degraded mode
   - event delivery
   - incident containment

5. Regulatory/governance mapping note
   - doctrine profiles
   - audit evidence model
   - pre-execution control framing

## 16. Claude input prompt

Use this as the base instruction:

```text
Use only the attached CO2 Router source pack as factual input.

Write documentation for a real pre-execution environmental execution control plane.

Rules:
- Do not invent customers, adoption, or unsupported claims
- Do not describe CO2 Router as a dashboard or post-hoc reporting system
- Keep all claims aligned to the source pack
- Distinguish clearly between:
  - live signals
  - verified static datasets
  - degraded fallback modes
  - rolling-window metrics vs long-retention persisted evidence

Write in an enterprise technical style.

Produce:
1. a white paper
2. an assurance paper
3. a methodology paper
4. a resilience/security paper
5. a short investor/partner brief
```

## 17. Best evidence files already in-repo

Give Claude these first:

- `docs/co2-router-doctrine.md`
- `docs/data-foundation/canonical-production-architecture.md`
- `docs/data-foundation/governance-lineage-audit.md`
- `docs/data-foundation/medallion.json`
- `docs/data-foundation/pipeline-contracts.yaml`
- `docs/data-foundation/production-validation-checklist.md`
- `docs/investor-brief.md`
- `docs/enterprise-sales-narrative.md`
- `docs/universal-adapter-spec.md`
- `docs/HARDENING_PLAN.md`
- `docs/whitepaper-source-pack.md`

## 18. Final truth for documentation

If you need one sentence to anchor everything:

CO2 Router is a deterministic pre-execution environmental execution control plane that authorizes compute before it runs, uses carbon and water as binding decision inputs, persists proof and trace artifacts for every decision, and supports deterministic replay and signed event delivery.
