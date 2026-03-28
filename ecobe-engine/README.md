# CO2 Router

CO2 Router is a deterministic pre-execution environmental authorization control plane for compute.

It evaluates:

- carbon
- water
- latency
- cost
- policy

and returns exactly one binding action:

- `run_now`
- `reroute`
- `delay`
- `throttle`
- `deny`

It then emits enforcement artifacts, persists proof and replay lineage, and exposes adapter/control-point metadata for external callers.

## What it is

CO2 Router is infrastructure governance software that decides whether compute is allowed to run, where it should run, and under what environmental conditions, before execution happens.

It is not:

- a passive dashboard
- an ESG reporting suite
- a generic scheduler
- a recommendation engine

## What is real today

The current engine already has:

- deterministic decision doctrine
- replay and persisted decision lineage
- proof export chain
- water-aware authorization
- CI/CD enforcement bundle generation
- Kubernetes enforcement bundle generation
- canonical decision and proof envelopes
- adapter entry points for HTTP, CloudEvents, queue/job, and Lambda paths

## What is not fully closed yet

The product is live and operational, but not every runtime-quality target is closed.

Current gaps are operational rather than conceptual:

- latency budgets are still above target in live production
- replay consistency still needs more hardening
- provider quality and freshness still vary by source
- the adapter ecosystem is structurally correct but still early outside the strongest wedges

Use this external qualifier:

Production-grade deterministic decisioning and proof, with live operational authority and continuous hardening still in progress.

## Core runtime flow

1. A caller submits a workload request with execution context, constraints, runtime target, and policy metadata.
2. The engine resolves candidate regions and gathers carbon and water signals.
3. It applies doctrine in fixed order:
   - policy overrides
   - water guardrails
   - SLA / critical-path protection
   - carbon optimization inside the allowed envelope
   - cost as late influence
4. It returns one binding action.
5. It emits enforcement outputs and canonical proof metadata.
6. It persists the decision for replay, evidence lookup, and export.

## Canonical API surfaces

### Decision API v1

- `POST /api/v1/ci/authorize`
- aliases:
  - `POST /api/v1/ci/route`
  - `POST /api/v1/ci/carbon-route`

### Event ingress

- `POST /api/v1/events/ingest`

### Queue/job adapter

- `POST /api/v1/adapters/queue/dispatch`

### Lambda adapter

- `POST /api/v1/adapters/lambda/invoke`

### Execution outcome callback

- `POST /api/v1/adapters/execution-outcomes`

### Replay

- `GET /api/v1/ci/decisions/:decisionFrameId/replay`

### Proof export

- `POST /api/v1/ci/exports/proof`

### Water provenance

- `GET /api/v1/water/provenance`
- `POST /api/v1/water/provenance/verify`

## Canonical response shape

The decision response includes both the historical CI response and the canonical envelopes:

- `decisionEnvelope`
- `proofEnvelope`
- `telemetryBridge`
- `adapterContext`

These sit alongside:

- `policyTrace`
- `decisionExplanation`
- `proofRecord`
- `enforcementBundle`
- `mss`

## Who it is for

Primary buyers and operators:

- platform engineering
- infrastructure governance
- CI/CD owners
- Kubernetes platform teams
- regulated enterprises
- sustainability/compliance teams that need pre-execution evidence

Best fit environments:

- movable workloads
- multi-region execution
- CI/CD-heavy delivery
- Kubernetes clusters
- queue and batch workloads

## Strengths

- deterministic decisioning
- one canonical decision and proof model
- water as a real hard constraint
- replay and proof lineage
- runtime-agnostic core with thin adapters
- honest degraded-state handling

## Weaknesses

- not fully assurance-ready yet
- adapter ecosystem still early
- strongest production wedge is still CI/CD and Kubernetes
- local Windows Prisma build friction can block `prisma generate`

## Local development

### Prerequisites

- Node.js 20+
- PostgreSQL
- Redis

### Install

```bash
npm install
```

### Recommended validation posture

- **Windows** is a convenience environment for local development.
- **Railway/Linux** is the canonical validation path for production truth.
- Do not treat a Windows Prisma DLL lock as an engine architecture failure.

### Run development server

```bash
npm run dev
```

### Run a fresh Windows-safe development session

This command cleans generated Prisma artifacts, stops repo-local Node holders when needed on Windows, regenerates the client, then starts the dev server.

```bash
npm run dev:fresh
```

### Type-check

```bash
npm run type-check
```

### Run focused doctrine tests

```bash
npm test -- --runTestsByPath src/__tests__/ci-doctrine.test.ts
npm test -- --runTestsByPath src/__tests__/ci-response-v2-contract.test.ts
```

### Verify water provenance

```bash
npm run water:verify-provenance
```

## Windows Prisma workflow

Windows can keep `node_modules/.prisma/client/query_engine-windows.dll.node` locked if a repo-local Node process, Prisma Studio session, or orphaned watcher is still holding the Prisma engine open.

Use these scripts instead of hand-cleaning:

```bash
npm run clean:prisma
npm run prisma:regen
npm run prisma:reset-win
npm run dev:fresh
```

What they do:

- `clean:prisma`
  - removes `node_modules/.prisma`
  - on Windows, terminates repo-local Node processes that commonly lock Prisma
- `prisma:regen`
  - runs guarded cleanup, then `prisma generate`
- `prisma:reset-win`
  - same intent as `prisma:regen`, explicitly named for Windows recovery flow
- `dev:fresh`
  - guarded cleanup
  - Prisma client regeneration
  - starts the dev server only after cleanup is complete

### Minimal Windows recovery procedure

If Prisma locks reappear:

```bash
npm run prisma:reset-win
```

If you want the manual equivalent:

1. Stop local dev servers and Prisma Studio.
2. Remove `node_modules/.prisma`.
3. Run `npx prisma generate`.
4. Start the app again.

### Build note

`npm run build` now routes Prisma generation through the guarded cleanup path.

For final release confidence:

- trust Railway/Linux deploys
- trust CI and production verification
- treat Windows Prisma locking as a local operational nuisance, not a product blocker

## Key docs

- [Doctrine](C:/Users/antho/.windsurf/ecobe-engineclaude/ecobe-engine/docs/co2-router-doctrine.md)
- [Universal Adapter Spec](C:/Users/antho/.windsurf/ecobe-engineclaude/ecobe-engine/docs/universal-adapter-spec.md)
- [Investor Brief](C:/Users/antho/.windsurf/ecobe-engineclaude/ecobe-engine/docs/investor-brief.md)
- [Enterprise Sales Narrative](C:/Users/antho/.windsurf/ecobe-engineclaude/ecobe-engine/docs/enterprise-sales-narrative.md)
