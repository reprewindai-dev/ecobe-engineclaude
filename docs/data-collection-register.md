# CO2 Router Data Collection Register

Last updated: 2026-03-29

## Purpose

This register lists what the canonical production system collects, whether it is real and persisted, and what it can be used for in reporting, assurance, and public documentation.

## Persisted collections

| Domain | Collection point | Storage | Real data | Notes |
|---|---|---|---|---|
| Decision outcomes | CI authorization route | `CIDecision` | Yes | Pre-execution decision record |
| Command-center summaries | Dashboard routing writes | `DashboardRoutingDecision` | Yes | Useful for public-facing aggregated stats |
| Candidate evaluations | Decision pipeline | `RoutingCandidate`, `RoutingDecision` | Yes | Supports region/ranking analysis |
| Trace ledger | Decision persistence | `DecisionTraceEnvelope` | Yes | Append-only hash-chained trace |
| Water proof | Decision persistence | `WaterPolicyEvidence` | Yes | Supplier refs, evidence refs, hashes |
| Water provider observations | Decision persistence | `WaterProviderSnapshot` | Yes | One row per supplier used in decision context |
| Facility telemetry | Water facility path | `FacilityWaterTelemetry` | Yes when facility overlay path is used | Facility-specific water evidence |
| Forecasts | Forecast worker | `CarbonForecast` | Yes | Supports predicted vs realized analysis |
| Forecast verification | Verification worker | `IntegrationEvent` and `CarbonForecast.error` | Yes | Use for forecast quality reporting |
| Provider health metrics | Integration wrappers | `IntegrationMetric` | Yes | Source health summary |
| Provider event trail | Integration wrappers | `IntegrationEvent` | Yes | Source errors, durations, statuses |
| Raw EIA ingest | EIA ingestion worker | `Eia930BalanceRaw`, `Eia930InterchangeRaw`, `Eia930SubregionRaw` | Yes | Raw audit trail |
| Processed grid signals | Grid feature path | `GridSignalSnapshot` | Yes | Derived signal evidence |
| Event delivery queue | Outbox enqueue | `DecisionEventOutbox` | Yes | Delivery queue and retry states |
| Sink registry | Integration management | `IntegrationWebhookSink` | Yes | Signed delivery targets |
| Event receipts | Event processing | `IntegrationEvent` | Yes | Delivery/verification evidence |

## Runtime-only or short-window collections

| Domain | Collection point | Storage | Real data | Notes |
|---|---|---|---|---|
| Telemetry metrics | `recordTelemetryMetric(...)` | in-memory metric store | Yes | Operational only unless exported |
| Rolling SLO window | `/api/v1/ci/slo` | rolling window source | Yes | Use carefully in public claims |
| Redis routing cache | warm loop / request path | Redis | Yes | Operational, not long-retention reporting |
| Redis last-known-good | degraded path | Redis | Yes | Operational fallback, not marketing evidence |

## Worker-generated data

| Worker | Real data produced | Main outputs |
|---|---|---|
| Forecast poller | Yes | `CarbonForecast`, refresh state |
| EIA ingestion worker | Yes | raw EIA records, processed signal snapshots |
| Forecast verification worker | Yes | forecast accuracy audit results |
| Routing warm loop | Yes | live Redis routing buckets and LKG records |
| Learning loop | Yes | region reliability / adaptive model refreshes |
| Runtime supervisor | Yes | worker liveness enforcement, recovery actions |
| Decision event dispatcher | Yes | outbox delivery state transitions |

## Good metrics to publish after 30-60 days

- Decision volume by day/week
- Action distribution by day/week
- Region routing distribution
- Water block/delay frequency
- Governance zone distribution
- Trace coverage rate
- Replay deterministic match rate
- Provider success/failure rates
- Provider p95 latency by source
- Forecast accuracy by region
- Event delivery success/failure rate

## Metrics to label carefully

- Rolling `p95` from `/api/v1/ci/slo`
  - real, but rolling-window dependent
- in-memory telemetry metrics
  - real, but not a long-retention warehouse
- command-center provider health
  - real operational truth, but it is a current-state control surface, not a historical analytics report
