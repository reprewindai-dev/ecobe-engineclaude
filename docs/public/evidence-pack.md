# CO2 Router First Evidence Pack

This document defines the first publication-safe evidence set for CO2 Router.
It is limited to claims that can be supported directly from the canonical live
runtime without disclosing proprietary implementation details.

## Claims Allowed in Public

- CO2 Router is live in production.
- CO2 Router makes binding pre-execution decisions.
- CO2 Router returns proof-rich outcomes for each decision.
- The core engine operates inside real-time targets in production.
- The public command center remains operational under load.

## Claims Not Yet Allowed in Public

- Every public-facing route is optimized to engine speed.
- The dashboard simulation path is performance-equivalent to the core engine.
- The whole platform is fully finished.

## Required Artifacts

Capture these four artifacts from canonical live runtime only:

1. Engine latency evidence
   - Source: engine `/api/v1/ci/slo`
   - Capture:
     - `p95 total`
     - `p95 compute`
     - `p99 total`
     - `withinBudget`
     - sample count and source

2. Command center evidence
   - Source: dashboard command center page or `/api/control-surface/command-center`
   - Capture:
     - command center live posture
     - provider status strip
     - trace/proof/replay state
     - cache header `x-co2router-snapshot-cache`

3. Proof artifact
   - Source: one real decision response
   - Capture:
     - `decisionFrameId`
     - `proofHash`
     - additive headers:
       - `Replay-Trace-ID`
       - `X-CO2Router-Trace-Hash`

4. Replay-consistent frame
   - Source: `/trace` and `/replay` for a fresh trace-backed frame
   - Capture:
     - same decision frame id
     - deterministic match
     - trace hash continuity

## Internal Capture Checklist

- Use canonical engine only:
  - `C:\Users\antho\.windsurf\ecobe-engineclaude\ecobe-engine`
- Use canonical dashboard only:
  - `C:\Users\antho\.windsurf\ecobe-engineclaude\ecobe-dashboard`
- Do not source evidence from side trees or nested copies.
- Do not use synthetic screenshots or mock data.
- Keep one timestamped archive folder per evidence run.

## Public Packaging Guidance

Public screenshots and writeups may show:

- route names
- high-level architecture statements
- headline latency numbers
- proof/replay posture
- public-safe provider names

Public screenshots and writeups must not show:

- internal secrets
- environment values
- private sink urls
- internal policy thresholds beyond what is already exposed in the public UI
- source code, cache keys, or internal runbooks

## Minimum Bundle for Design-Partner Outreach

- one latency screenshot
- one command center screenshot
- one proof screenshot or redacted JSON excerpt
- one replay verification screenshot
- one short summary paragraph using only the allowed claims above
