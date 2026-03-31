# CO2 Router — Public Whitepaper Source Pack

## Executive Summary

CO2 Router is a deterministic, pre‑execution environmental authorization control
plane for compute. It evaluates carbon, water, latency, cost, and policy inputs
before workloads run and returns exactly one binding action: `run_now`, `reroute`,
`delay`, `throttle`, or `deny`.

The system provides audit‑grade proof and deterministic replay for each decision.
It is designed for platform teams, CI/CD owners, Kubernetes operators, and
regulated enterprises that need provable environmental governance.

## Facts Safe to Publish

- Decisions happen **before** execution.
- Water constraints can **block** or **delay** execution.
- Every decision has a proof record and trace lineage.
- Deterministic replay is supported for trace‑backed frames.
- The control plane is runtime‑agnostic and integrates via adapters.

## System Boundary (Public)

Two production services:

- **Dashboard** — public UI and control‑surface presentation.
- **Engine** — decision API and enforcement pipeline.

The dashboard composes live engine endpoints into a command‑center view and
status surfaces. The engine is the canonical source of truth.

## Data Sources (Public)

Environmental data inputs include:

- Carbon intensity providers (real‑time and structural baseline sources)
- Water authority datasets (verified static datasets)

Specific providers are listed in `data-collection-register.md`.

## Proof and Replay (Public)

For each decision:

- A decision frame identifier is issued.
- A proof hash is attached to the response.
- A trace record is persisted for audit and replay.

Replay is deterministic for trace‑backed frames.

## Governance (Public)

The system applies a named governance framework that scores and constrains
decisions across carbon, water, latency, and cost dimensions. Governance status
is surfaced live in the command center when a policy source is active.

## What This Is Not

- Not a reporting dashboard
- Not a passive monitoring tool
- Not a generic scheduler

## Contact

founder@co2router.com
