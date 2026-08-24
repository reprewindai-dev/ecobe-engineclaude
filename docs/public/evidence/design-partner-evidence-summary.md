# CO2 Router Design Partner Evidence Summary

Generated from the live canonical production evidence set on `2026-03-31`.

## What has been proven

- CO2 Router is live as a pre-execution control plane for compute.
- The system makes binding decisions before workloads run.
- Every captured decision can be traced, replayed, and tied to proof artifacts.
- Water provenance is verified and can participate in execution control.
- The production engine operated inside the target authority envelope for the captured evidence window.

## Why this matters for a design partner

CO2 Router is not a reporting layer that explains workloads after they have already run. It is an execution-authority layer that can admit, delay, reroute, or deny compute before execution while preserving proof for the decision that was made.

That makes the design-partner pilot concrete:

- one real workflow
- one production proof chain
- one deterministic replay path
- one clear paid continuation decision at the end of the pilot

## Proof surfaces available in the pilot

- authorize: the binding pre-execution decision
- trace: the stored decision lineage for the frame
- replay: deterministic verification against the stored frame
- provenance: verified environmental inputs grounding the decision

## Evidence points from the captured production set

- engine p95 total: `56ms`
- engine p95 compute: `39ms`
- deterministic replay: `true`
- verified water datasets: `4`
- provenance mismatches: `0`

## Best-fit pilot motions

- CI or GitHub Actions routing before execution
- scheduled or batch job authorization
- regional placement with environmental guardrails
- policy-gated high-compute workflows

## Safe public references

- proof summary: [README.md](/Users/antho/.windsurf/ecobe-engineclaude-evidence/docs/public/evidence/README.md)
- design partner program: [design-partner-program-one-pager.md](/Users/antho/.windsurf/ecobe-engineclaude-evidence/docs/public/design-partner-program-one-pager.md)

Detailed operational artifacts remain private.
