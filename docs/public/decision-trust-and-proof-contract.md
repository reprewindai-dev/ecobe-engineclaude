# CO2 Router Decision Trust And Proof Contract

Verified as of 2026-04-01.

This document records the additive contract shipped on the canonical CI decision path.

## Decision response additions

`CiResponseV2` now includes:

- `workloadClass`
- richer `decisionExplanation`
  - `dominantConstraint`
  - `policyPrecedence`
  - `rejectedAlternatives`
  - `counterfactualCondition`
  - `uncertaintySummary`
- `decisionTrust`
  - `signalFreshness`
  - `providerTrust`
  - `disagreement`
  - `estimatedFields`
  - `replayability`
  - `fallbackMode`
  - `degradedState`

These fields are built from the canonical doctrine path, not route-only glue.

## Workload classes

The response and proof/export path now carry a normalized `workloadClass`:

- `batch`
- `interactive`
- `critical`
- `regulated`
- `emergency`

Normalization rule:

- explicit `workloadClass` wins
- otherwise derive from legacy `criticality + jobType`

## Proof packet export

Decision-level export surfaces now exist for the canonical engine:

- `GET /api/v1/ci/decisions/:decisionFrameId/proof-packet.json`
- `GET /api/v1/ci/decisions/:decisionFrameId/replay-packet.json`
- `GET /api/v1/ci/decisions/:decisionFrameId/proof-packet.pdf`

The PDF is an operational audit packet, not a marketing artifact.

## Trace payload additions

The trace envelope now carries:

- `decisionPath.workloadClass`
- `explanation`
- `trust`

This keeps workload class, dominant constraint, degraded posture, and replayability attached to the same decision frame lineage.
