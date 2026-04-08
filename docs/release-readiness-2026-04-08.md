# Release Readiness Report

Date: `2026-04-08`
Scope: `CO2 Router by Veklom`, `HalOGrid Theatre Preview`, `HalOGrid Theatre Pro by Veklom`
Status: `not yet lockable`

## Executive Summary

The frontends, HallOGrid surfaces, and live control-surface JSON are healthy and freshly deployed.
The launch is **not** fully sealed yet because two production blockers remain:

1. `co2router.com` / `www.co2router.com` are attached to Vercel but DNS is still not pointed at Vercel.
2. The generic `/api/ecobe/...` proxy still targets an older Railway backend that does not expose the current adapter, water, and CI surfaces.

Until those two blockers are cleared, the product is demonstrable and partially operational, but not ready for a confident official launch.

## Code Verification

### Frontend

Passed:

- `ecobe-dashboard`: `npm run type-check`
- `ecobe-dashboard`: `npm run build`
- `co2router-site`: `npm run type-check`
- `co2router-site`: `npm run build`

### Engine

Passed:

- `ecobe-engine`: `npm run type-check`
- `ecobe-engine`: targeted verification suite

Targeted suites passed: `10 / 10`
Targeted tests passed: `46 / 46`

Covered suites:

- `architecture-laws.test.ts`
- `ci-response-v2-contract.test.ts`
- `provider-router.test.ts`
- `region-reliability.test.ts`
- `ci-trace.test.ts`
- `ci-replay-determinism.test.ts`
- `ci-replay-proof-hash.test.ts`
- `provider-snapshots.test.ts`
- `water-bundle.test.ts`
- `water-policy.test.ts`

### Production Env Validation

`npm run env:verify:prod` failed against the local engine `.env`.

Blocking missing values in the local production env manifest:

- `NODE_ENV=production`
- `PORT`
- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `REDIS_URL`
- `ECOBE_INTERNAL_API_KEY`
- `INTELLIGENCE_JOB_TOKEN`
- `DECISION_API_SIGNATURE_SECRET`
- `JWT_SECRET`
- `UI_TOKEN`
- at least one live grid/carbon credential set

Interpretation:

- this does **not** prove the deployed runtime is broken
- it **does** prove the local production env manifest is not complete enough to represent a sealed production backend

## Deployment Verification

### Vercel Projects

Verified linked projects:

- `co2router-tech`
- `co2router-site`

Fresh production deployments completed during this pass:

- `co2router-tech`
- `co2router-site`

### Live Frontend Routes

Verified `200`:

- `https://co2router.tech/`
- `https://co2router.tech/console`
- `https://co2router.tech/pricing`
- `https://co2router.tech/access`
- `https://co2router.tech/developers/adapters`
- `https://co2router.tech/developers/api`
- `https://co2router.tech/status`
- `https://co2router.tech/api/health`
- `https://co2router.tech/api/control-surface/hallogrid`
- `https://co2router.tech/api/providers/health`
- `https://co2router-site.vercel.app/`
- `https://co2router-site.vercel.app/console`
- `https://co2router-site.vercel.app/pricing`
- `https://co2router-site.vercel.app/access`
- `https://co2router-site.vercel.app/api/health`
- `https://co2router-site.vercel.app/api/providers/health`

## Live Theater / Command Center Readout

Observed from live command-center JSON:

- `systemActive: true`
- `systemStatus: healthy`
- `saiqEnforced: true`
- `traceLocked: true`
- `replayVerified: true`
- rolling `p95 total latency: 57 ms`
- rolling `p95 compute latency: 48 ms`
- `samples: 250`
- `withinBudget.total: true`
- `withinBudget.compute: true`
- verified water datasets: `4 / 4`
- selected governance source: `SEKED_INTERNAL_V1`
- latest visible decision posture: repeated `delay` decisions under `SEKED_POLICY_RED_ZONE`

## Provider Posture

Observed from live provider-health route:

- `WattTime`: healthy
- `GridStatus EIA-930`: degraded, stale
- `Ember`: healthy
- `GB Carbon Intensity`: healthy
- `DK Carbon`: offline
- `FI Carbon`: offline

Interpretation:

- the core stack is partially healthy
- the US fallback backbone is present but stale
- some regional carbon sources are not currently active
- this is acceptable for a controlled launch only if the public claims stay aligned with actual provider readiness

## Adapter / Catalog Readiness

### Public Docs

Verified live:

- `/developers/adapters`
- `/developers/api`

The adapter docs currently advertise these runtimes:

- `ecobe.http.decision.v1`
- `ecobe.cloudevents.adapter.v1`
- `ecobe.queue.adapter.v1`
- `ecobe.lambda.adapter.v1`
- `ecobe.kubernetes.adapter.v1`
- `ecobe.github-actions.adapter.v1`

### Actual Backend Connectivity

The frontend generic engine proxy is still configured to use:

- `https://ecobe-engineclaude-production.up.railway.app/api/v1`

Observed failures through the live proxy:

- `/api/ecobe/v1/adapters/spec` -> `404`
- `/api/ecobe/v1/water/providers` -> `404`
- `/api/ecobe/v1/ci/slo` -> `404`
- `/api/ecobe/v1/health` -> `404`

Interpretation:

- the public docs describe a richer adapter/control-plane surface than the currently proxied backend is serving
- this is a **launch blocker** for any promise that developers can immediately connect to the canonical adapter plane

## Domain / DNS Status

### Good

- `co2router.tech` is live and correctly aliased on Vercel

### Not Finished

- `co2router.com` is added to the `co2router-site` Vercel project
- `www.co2router.com` is added to the `co2router-site` Vercel project
- both domains still return `404` because DNS is not yet pointed at Vercel

Required DNS records at Porkbun:

```txt
A     co2router.com       76.76.21.21
A     www.co2router.com   76.76.21.21
```

## Changes Completed During This Pass

- rebuilt both active frontends successfully
- redeployed both Vercel projects successfully
- fixed frontend provider-health proxy path to match the real engine mount point
- attached `co2router.com` and `www.co2router.com` to the `co2router-site` Vercel project
- verified live HallOGrid / control-surface JSON after deploy

## Launch Verdict

### Ready

- live theater demo
- pricing / access / homepage positioning
- command-center interaction layer
- proof / trace / replay presentation
- frontends on Vercel

### Not Ready

- custom website domain cutover
- generic backend proxy surface for adapters / CI / water catalog
- fully sealed production env manifest for the engine

## Lock Criteria

Do **not** call this checkpoint gold until all of the following are true:

1. `co2router.com` and `www.co2router.com` resolve to Vercel and return `200`.
2. `/api/ecobe/...` is pointed at a backend that serves the current engine contract.
3. production env manifest is complete enough to pass the engine production verification gate.

## Phase 2 Parking Lot

Do not implement in this checkpoint. Keep parked:

- deeper provider-surface normalization across `health`, `methodology`, and theater
- ENSO doctrine expansion beyond conservative prior behavior
- broader adapter onboarding work beyond the current canonical contract
- outreach and GTM sequencing
