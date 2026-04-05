# CO2 Router Observability Dashboard Spec

This document defines the internal dashboard and evidence-plane requirements for
the canonical runtime. It is private because it references internal metrics,
runtime contracts, and database analytics paths.

## Goal

Keep three performance surfaces separate at all times:

1. engine decision latency
2. dashboard read/composition latency
3. dashboard simulation/proof-route latency

The internal dashboard must make it impossible to confuse those surfaces.

## Canonical Inputs

### Live route metrics

- Engine SLO endpoint:
  - `/api/v1/ci/slo`
- Engine telemetry endpoint:
  - `/api/v1/ci/telemetry`
- Dashboard telemetry endpoint:
  - `/api/control-surface/metrics`

### Durable fact tables

- `"CIDecision"`
- `"DecisionTraceEnvelope"`
- `"DecisionEventOutbox"`
- `"CarbonLedgerEntry"`
- `"RoutingCandidate"`
- `"ProviderSnapshot"`
- `"WaterProviderSnapshot"`

## Engine panels

### Panel 1: Decision latency

Source:

- `ecobe.authorization.decision.latency.ms`
- `/api/v1/ci/slo`

Show:

- p50 total
- p95 total
- p99 total
- p50 compute
- p95 compute
- p99 compute
- current total
- current compute
- budget line at `100ms total / 50ms compute`

Alert:

- warning at `p95 total > 80ms`
- critical at `p95 total > 100ms`
- critical at `p95 compute > 50ms`

### Panel 2: Hot-path discipline

Source metrics:

- `ecobe.routing.cache.hit.count`
- `ecobe.routing.cache.miss.count`
- `ecobe.routing.hot_path.provider_leak.count`
- `ecobe.provider.resolution.latency.ms`

Show:

- cache hit count by source bucket
- cache miss count
- provider resolution p50/p95
- hot-path provider leak count

Alert:

- any non-zero `ecobe.routing.hot_path.provider_leak.count`

### Panel 3: Warm coverage and worker health

Source metrics:

- `ecobe.routing.cache.coverage.pct`
- `ecobe.routing.warm_loop.lag.seconds`
- `ecobe.routing.warm_loop.cycle.count`
- `ecobe.routing.warm_loop.failure.count`

Show:

- required-region warm coverage percent
- current warm-loop lag
- cycle count over time
- failure count over time

Alert:

- warning if coverage drops below `95%`
- critical if coverage drops below `80%`
- warning if warm-loop lag exceeds one interval

## Dashboard panels

### Panel 4: Read/composition latency

Source:

- `co2router.dashboard.route.duration.ms`
- `co2router.dashboard.route.cache.count`
- `co2router.dashboard.route.response.bytes`

Required route attributes:

- `route=command-center`
- `route=live-system`
- `route=overview`

Show:

- p50/p95 duration by route
- cache-status counts for `hit`, `miss`, `refresh`
- response bytes by route

### Panel 5: Simulation route latency

Source:

- `co2router.dashboard.route.duration.ms` with `route=simulate`
- `co2router.dashboard.simulation.engine.duration.ms`
- `co2router.dashboard.simulation.serialize.duration.ms`
- `co2router.dashboard.route.response.bytes` with `route=simulate`

Required mode attributes:

- `mode=fast`
- `mode=full`

Show:

- fast-mode p50/p95
- full-mode p50/p95
- engine sub-duration
- serialization sub-duration
- response bytes by mode

Alert:

- warning if fast-mode p95 drifts above `250ms`
- critical if fast-mode p95 exceeds `500ms`

## Proof and delivery panels

### Panel 6: Trace and replay integrity

Source:

- `"DecisionTraceEnvelope"`
- `ecobe.replay.consistency.count`
- `ecobe.replay.mismatch.count`

Show:

- total trace-backed decisions
- replay verified count
- replay mismatch count
- hash-chain gap count

Alert:

- any replay mismatch
- any trace hash-chain discontinuity

### Panel 7: Event delivery

Source:

- `"DecisionEventOutbox"`
- `ecobe.outbox.lag.seconds`

Show:

- pending / sent / failed outbox rows
- lag seconds
- average attempts
- latest response codes

Alert:

- pending lag above SLA
- rising failure rate

## Evidence operating cadence

Daily:

- export engine p95 and p99
- export fast-mode simulation p95
- export hot-path provider leak count
- export outbox backlog

Weekly:

- capture one fresh proof artifact
- capture one replay-consistent frame
- review provider freshness tables

Monthly:

- refresh case-study metrics from the query pack
- archive screenshots and numeric extracts in the evidence folder

## Data retention guidance

- keep live metric snapshots small and rolling in memory
- store durable decision facts in Postgres
- roll up daily aggregates for longer-term publication and partner reporting
- never use public docs as the source of operational truth
