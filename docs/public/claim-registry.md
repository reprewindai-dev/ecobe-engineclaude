# CO2 Router Claim Registry

This document defines the publication standard for CO2 Router claims.
Every public claim must resolve to one of three statuses:

- `SAFE`: supported directly by current live runtime or canonical code truth
- `LABEL`: publishable only with the required qualifier attached
- `VERIFY`: blocked from publication until re-certified

## Operating Rule

CO2 Router does not publish performance, trust, proof, governance, or market claims
from memory. The canonical claim registry lives in:

- `C:\Users\antho\.windsurf\ecobe-engineclaude\ecobe-dashboard\src\lib\claims\registry.json`

Public-facing surfaces must read from that registry or from checked derivatives of it.

## Enforcement

Certification checks now verify:

- live engine SLO posture
- live example decision proof and trust posture
- provider freshness posture
- current Prisma model and migration counts
- replay and proof availability
- public homepage / roadmap / control-surface route exposure
- absence of blocked `VERIFY` claims in public materials

## Examples

### SAFE

- CO2 Router returns five binding actions.
- Replay verifies whether the engine still reaches the same governed result.
- Every decision carries a SHA-256 proof hash.

### LABEL

- Designed for per-workload CSRD-ready records.
- The current example decision exposes estimated water impact directly in the proof envelope.
- $600B+ addressable market for an execution-governance layer.

### VERIFY

- Any stale exact-number claim that no longer matches current evidence.
- Any exact point-in-time provider snapshot reused without recertification.
- Any operational count that has not been revalidated against live runtime.

## Publication Discipline

If a claim cannot survive certification, it is not a marketing problem.
It is removed, downgraded, or relabeled until the evidence catches up.
