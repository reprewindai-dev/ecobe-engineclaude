# CO2 Router Canonical Production Architecture

## Canonical boundary
- Canonical dashboard source of truth: `C:\Users\antho\.windsurf\ecobe-engineclaude\ecobe-dashboard`
- Canonical engine source of truth: `C:\Users\antho\.windsurf\ecobe-engineclaude\ecobe-engine`
- Non-canonical deploy paths: root wrapper files, side worktrees, nested repo copies, demo folders, `_land_*` folders, `github-action`, `dekes-saas`, `WATER`
- Production topology: two Railway services
  - Dashboard service: Next.js app from `ecobe-dashboard`
  - Engine service: Express/TypeScript app from `ecobe-engine`

## Runtime services
### Dashboard
- Framework: Next.js 14 App Router
- Canonical entrypoints:
  - `src/app/layout.tsx`
  - `src/app/page.tsx`
  - `src/app/console/page.tsx`
- Purpose:
  - public marketing and methodology pages
  - live command center UI
  - dashboard-side engine proxy/composition routes
- Dashboard-to-engine contract:
  - browser -> dashboard route handler -> engine `/api/v1/*`
  - internal trace/replay calls use `ECOBE_INTERNAL_API_KEY`

### Engine
- Framework: Express + TypeScript
- Canonical entrypoints:
  - `src/server.ts`
  - `src/app.ts`
- Persistence:
  - Postgres through Prisma
  - Redis for routing cache, signal cache, idempotency, worker state
- Purpose:
  - pre-execution routing/authorization
  - water-aware guardrails
  - governance evaluation
  - proof, trace, replay, event emission

## Deploy topology
- Dashboard Docker source: `ecobe-dashboard/Dockerfile`
- Engine Docker source: `ecobe-engine/Dockerfile`
- Root repo `package.json` is a thin dashboard wrapper only
- Root `railway.json` is not the doctrine-complete deploy source
- Canonical production deployment must point Railway services at the subdirectories above

## Dashboard composition
### Public pages
- `/`
- `/console`
- `/methodology`
- `/assurance`
- `/status`
- `/company/*`
- `/system/*`
- `/developers/*`
- `/contact`

### Dashboard API routes
- `/api/ecobe/[...path]`
- `/api/control-surface/overview`
- `/api/control-surface/live-system`
- `/api/control-surface/command-center`
- `/api/control-surface/trace/[decisionFrameId]`
- `/api/control-surface/replay/[decisionFrameId]`
- `/api/control-surface/simulate`
- `/api/dashboard/kpis`
- `/api/dashboard/regions`
- `/api/health`
- `/api/integrations/dekes`

### Client polling
- Overview / live-system: 30 seconds
- Command center: 15 seconds
- Selected trace: on demand or 15 seconds for latest frame
- Replay: on demand

## Engine boot sequence
1. Validate water bundle artifacts
2. Recover from last-known-good water artifacts when needed
3. Fail hard in production if artifacts remain unhealthy
4. Connect Prisma/Postgres
5. Run schema readiness check
6. Ping Redis
7. Start HTTP server
8. Start background workers

## Engine route groups
- `/api/v1/ci`
- `/api/v1/water`
- `/api/v1/events`
- `/api/v1/internal`
- `/api/v1/dashboard`
- Additional route groups:
  - organizations
  - integrations
  - carbon ledger
  - intelligence
  - adapters
  - dekes handoff

## Decision execution path
1. Request validation and normalization
2. Signature validation when `DECISION_API_SIGNATURE_SECRET` is configured
3. Water artifact snapshot read
4. Candidate region expansion
5. Provider routing signal resolution per region
6. Water authority assembly
7. Guardrail evaluation
8. Governance evaluation
9. Final decision selection
10. Proof and trace seed assembly
11. Response finalization with trace headers
12. Persistence transaction
13. Event outbox enqueue

## Governance path
### Active sources
- `SEKED_INTERNAL_V1`
  - canonical first-party governance evaluator
  - used when `SEKED_POLICY_ADAPTER_ENABLED=true` and no adapter URL is configured
- external hook
  - only active when explicitly enabled and pointed at a real remote policy authority

### Governance outputs
- source
- score
- zone
- weights
- thresholds
- policy reference
- rationale
- enforced action override when applicable

### Zone rules
- green
  - allow current decision unless stronger water guardrail blocks
- amber
  - reroute to safer candidate when available
  - otherwise delay if allowed
  - otherwise deny
- red
  - throttle for critical workloads
  - otherwise delay if allowed
  - otherwise deny

## Water authority and provenance
- Raw water artifacts: `data/source/water`
- Normalized bundle: `data/normalized/water`
- Last-known-good bundle: `data/normalized/water/.lkg`
- Verified water datasets:
  - Aqueduct
  - AWARE
  - WWF
  - NREL
- Water authority modes:
  - basin
  - facility overlay
  - fallback
- Water guardrails can force:
  - reroute pressure
  - delay
  - deny
  - hard safety block

## Signal fabric and caching
### Provider order
- WattTime marginal
- GB Carbon Intensity
- Denmark / Finland regional providers
- GridStatus / EIA-930 fallback backbone
- Ember structural baseline
- static fallback

### Redis keys
- `grid-signal:snapshots:{region}`
- `grid-signal:features:{region}:{timestamp}`
- `grid-signal:disagreement:{region}:{minute_bucket}`
- `grid-signal:routing:{region}:{minute_bucket}`
- `grid-signal:routing-lkg:{region}`
- `grid-signal:quality:{region}:{timestamp}`

### Cache policy
- Routing cache keys are minute-bucketed
- Warm loop writes current bucket and next bucket
- Request path reads the same bucket helper used by the warmer
- Last-known-good record is region-scoped and used conservatively on degraded live fetches
- GridStatus 403/429/breaker-open must short-circuit to degraded mode
- Ember structural data is TTL-backed and not treated as a real-time dependency

## Trace, replay, and proof
### Trace ledger
- Prisma model: `DecisionTraceEnvelope`
- append-only
- fields include:
  - `decisionFrameId`
  - `sequenceNumber`
  - `traceHash`
  - `previousTraceHash`
  - `inputSignalHash`
  - `payload`

### Trace payload domains
- identity
- input signals
- normalized signals
- decision path
- governance
- proof
- performance

### Replay
- route: `/api/v1/ci/decisions/:decisionFrameId/replay`
- replay is seeded from persisted frame inputs and resolved candidate overrides
- replay must not hit live providers for trace-backed post-migration frames
- decision responses include:
  - `Replay-Trace-ID`
  - `X-CO2Router-Trace-Hash`

## Event delivery
- outbox model: `DecisionEventOutbox`
- sink model: `IntegrationWebhookSink`
- integration receipts: `IntegrationEvent`
- decision event type: `DecisionEvaluatedV1`
- events are verified against `DECISION_API_SIGNATURE_SECRET`
- dispatcher signing prefers `DECISION_API_SIGNATURE_SECRET`, then `DECISION_EVENT_SIGNATURE_SECRET`
- verification endpoint:
  - `POST /api/v1/events/verify`
  - guarded by internal auth
  - validates payload shape and signature metadata
- boot path auto-provisions one system-managed self-verifier sink that targets the local verify endpoint

## Workers
- Forecast poller
- EIA ingestion
- Intelligence scheduler
- Forecast verification
- Routing-cache warm loop
- Learning loop
- Runtime supervisor
- Decision event dispatcher

## Persistence model groups
### Decisioning
- `CIDecision`
- `RoutingDecision`
- `RoutingCandidate`
- `WorkloadDecisionOutcome`
- `DashboardRoutingDecision`

### Trace and audit
- `DecisionTraceEnvelope`
- `WaterPolicyEvidence`
- `CarbonLedgerEntry`
- `CarbonCommand`
- `CarbonCommandTrace`
- `CarbonCommandOutcome`

### Delivery and integration
- `IntegrationWebhookSink`
- `DecisionEventOutbox`
- `IntegrationEvent`

### Provider and signal state
- `ProviderSnapshot`
- `WaterProviderSnapshot`
- `GridSignalSnapshot`
- `CarbonForecast`
- `ForecastRefresh`
- `Eia930BalanceRaw`
- `Eia930InterchangeRaw`
- `Eia930SubregionRaw`

### Usage and commercial domain
- `Organization`
- `OrgUsageCounter`
- `CarbonCredit`

### Learning and intelligence
- `WorkloadEmbeddingIndex`
- `AdaptiveProfile`
- `AdaptiveSignal`
- `AdaptiveRunLog`
- `CarbonCommandAccuracyDaily`

### DEKES domain
- `DekesProspect`
- `DekesTenant`
- `DekesDemo`
- `DekesHandoffEvent`
- `DekesWorkload`

## Trust boundaries
- Internal engine routes require `ECOBE_INTERNAL_API_KEY`
- Admin UI routes require `UI_TOKEN` when enabled
- Dashboard trace/replay composition requires `ECOBE_INTERNAL_API_KEY`
- Signed decision events require `DECISION_EVENT_SIGNATURE_SECRET`
- Public decision contracts must never expose internal tokens or secrets

## Third-party dependencies
- Railway
- Postgres
- Prisma
- Redis / Upstash Redis
- QStash
- WattTime
- GridStatus / EIA-930
- Ember
- GB Carbon Intensity
- Denmark carbon provider
- Fingrid
- Aqueduct
- AWARE
- WWF
- NREL
- OpenAI embeddings
- Stripe

## Current doctrine-complete target state
- `traceAvailable = true`
- `traceLocked = true`
- `replayVerified = true`
- `SAIQ enforced = true`
- `governance source = SEKED_INTERNAL_V1` or a real external authority name
- `verified water datasets >= 4`
- `p95 total <= 100ms`
- `p95 compute <= 50ms`
- signed decision events delivered and verifiable
