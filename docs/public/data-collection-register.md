# CO2 Router — Public Data Collection Register

This register lists categories of data collected by CO2 Router and their
purpose. It is a public‑safe summary and does not expose proprietary processing
details or internal schemas.

## Environmental Inputs

| Category | Examples | Purpose | PII |
|---|---|---|---|
| Carbon signals | WattTime, GridStatus/EIA‑930, Ember (structural baseline) | Measure grid intensity and signal quality for routing | No |
| Water authority datasets | Aqueduct, AWARE, WWF, NREL | Apply water‑stress constraints and evidence | No |

## Decision & Proof Records

| Category | Examples | Purpose | PII |
|---|---|---|---|
| Decision frames | decisionFrameId, action, region, reason code | Authorization outcomes and audit trail | No |
| Proof & trace | proof hash, trace lineage, replay metadata | Integrity, auditability, deterministic replay | No |

## Operational Metrics

| Category | Examples | Purpose | PII |
|---|---|---|---|
| Latency & SLO | p95 total/compute, samples | Performance monitoring | No |
| Provider health | staleness, availability | Signal reliability and degraded modes | No |

## Customer/Usage (If Enabled)

| Category | Examples | Purpose | PII |
|---|---|---|---|
| Organization/tenant IDs | org identifiers, usage counters | Billing, access control, analytics | No |

## Retention (Public Summary)

Retention and deletion policies are defined per environment and customer
agreement. Decision and proof data are retained to support auditability.

## Contact

founder@co2router.com
