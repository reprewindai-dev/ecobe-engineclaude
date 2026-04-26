# Hetzner Engine Handoff

This document is the deployment checklist for the engine only.

Do not move the public site repo into this host.
Do not store real secrets in this repo.
Paste secret values into Hetzner env vars or a secret manager only.

## Goal

Run the CO2 Router engine as the only backend service on Hetzner with:

- Postgres
- Redis
- internal auth
- schema-ready health checks
- background workers
- decision proof and replay support

## Repo map

This checkout contains multiple worktrees under one local root. Windsurf should treat them as separate responsibilities, even if they live side by side here.

| Worktree / repo | Purpose | Handoff rule |
| --- | --- | --- |
| `ecobe-engine` | Canonical internal engine | Move to Hetzner only; keep Postgres, Redis, internal auth, schema readiness, and proof/replay here |
| `ecobe-dashboard` | Public control-surface UI | Keep separate from the engine; point it at the engine host via env vars |
| `ecobe-engine-integration` | Integration / adapter harness | Use for end-to-end verification, not as the canonical runtime |
| `ecobe-engine-mainline-gate` | Mainline gate / validation copy | Use for merge gating and proof checks, not as the live runtime |
| `co2router-tech` | Local dependency cache / stray workspace | Not a production source repo; do not deploy from it |

## System boundary

- Engine runtime: Hetzner
- Public site/UI: separate repo and deployment target
- Autonoma / preview checks: GitHub-connected quality gate only
- Render: no longer part of the engine runtime path

## Required services

- PostgreSQL
- Redis
- one app host for the engine
- outbound internet access for provider APIs

## Required env vars

These must be set before the engine boots.

| Name | Purpose | Example source |
| --- | --- | --- |
| `DATABASE_URL` | Runtime database connection string | Managed Postgres or pooled Postgres URL |
| `DIRECT_DATABASE_URL` | Direct migration connection string | Direct Postgres URL with SSL |
| `REDIS_URL` | Cache, queues, worker state | Managed Redis URL |
| `ECOBE_INTERNAL_API_KEY` | Internal service auth | Random 32+ char secret |
| `JWT_SECRET` | Token signing | Random 32+ char secret |
| `DECISION_API_SIGNATURE_SECRET` | Signed decision callback verification | Random 32+ char secret |

## Recommended engine env vars

These are not strictly required for boot, but they keep the engine self-healing and production-usable.

| Name | Purpose |
| --- | --- |
| `ENGINE_BACKGROUND_WORKERS_ENABLED` | Enable internal workers |
| `RUNTIME_SUPERVISOR_ENABLED` | Self-heal and stale-state recovery |
| `DECISION_EVENT_DISPATCH_ENABLED` | Decision outbox dispatch |
| `FORECAST_REFRESH_ENABLED` | Forecast refresh jobs |
| `LEARNING_LOOP_ENABLED` | Learning loop jobs |
| `PGL_AUDIT_RETRY_ENABLED` | Audit retry workers |
| `EIA_BACKFILL_ENABLED` | Backfill grid data |
| `OTEL_EXPORT_ENABLED` | Observability export toggle |
| `OTEL_EXPORT_ENDPOINT` | Observability endpoint |

## Optional integrations

Set these only if the feature is live on Hetzner.

| Name | Purpose |
| --- | --- |
| `DEKES_API_KEY` | DEKES integration auth |
| `DEKES_WEBHOOK_URL` | DEKES webhook sink |
| `DEKES_WEBHOOK_SECRET` | DEKES webhook verification |
| `QSTASH_TOKEN` | Upstash QStash auth |
| `QSTASH_BASE_URL` | QStash region endpoint |
| `QSTASH_CURRENT_SIGNING_KEY` | Current QStash signing key |
| `QSTASH_NEXT_SIGNING_KEY` | Rotating QStash signing key |
| `STRIPE_SECRET_KEY` | Billing API key |
| `STRIPE_WEBHOOK_SECRET` | Billing webhook verification |
| `WATTTIME_USERNAME` | WattTime provider auth |
| `WATTTIME_PASSWORD` | WattTime provider auth |
| `EMBER_API_KEY` | Ember provider auth |
| `EIA_API_KEY` | EIA provider auth |
| `GRIDSTATUS_API_KEY` | GridStatus provider auth |
| `FINGRID_API_KEY` | Fingrid provider auth |

## Environment template

Paste values into Hetzner as secrets. Leave unset fields empty if the feature is not used.

```env
PORT=3000
NODE_ENV=production

DATABASE_URL=""
DIRECT_DATABASE_URL=""
REDIS_URL=""

ECOBE_INTERNAL_API_KEY=""
JWT_SECRET=""
DECISION_API_SIGNATURE_SECRET=""

ENGINE_BACKGROUND_WORKERS_ENABLED=true
RUNTIME_SUPERVISOR_ENABLED=true
DECISION_EVENT_DISPATCH_ENABLED=true
FORECAST_REFRESH_ENABLED=true
LEARNING_LOOP_ENABLED=true
PGL_AUDIT_RETRY_ENABLED=true
EIA_BACKFILL_ENABLED=true

OTEL_EXPORT_ENABLED=false
OTEL_EXPORT_ENDPOINT=""
OTEL_SERVICE_NAME=ecobe-engine

DEKES_API_KEY=""
DEKES_WEBHOOK_URL=""
DEKES_WEBHOOK_SECRET=""

QSTASH_TOKEN=""
QSTASH_BASE_URL=""
QSTASH_CURRENT_SIGNING_KEY=""
QSTASH_NEXT_SIGNING_KEY=""

STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
STRIPE_GROWTH_MONTHLY_PRICE_ID=""
STRIPE_GROWTH_ANNUAL_PRICE_ID=""
STRIPE_ENTERPRISE_PRICE_ID=""

WATTTIME_USERNAME=""
WATTTIME_PASSWORD=""
EMBER_API_KEY=""
EIA_API_KEY=""
GRIDSTATUS_API_KEY=""
FINGRID_API_KEY=""
```

## Deployment order

1. Provision Postgres and Redis.
2. Set the required env vars.
3. Run migrations with `DIRECT_DATABASE_URL`.
4. Run `npm ci`.
5. Run `npm run build`.
6. Start the service with `npm run start`.
7. Verify `GET /internal/v1/health`.
8. Verify `POST /internal/v1/routing-decisions`.
9. Verify `GET /internal/v1/routing-decisions/:decisionId`.
10. Verify `POST /internal/v1/routing-decisions/:decisionId/execute`.

## Validation commands

```bash
npm ci
npm run type-check
npm run build
npm run prisma:migrate:deploy
npm run start
```

## Health contract

The engine should only be considered healthy when all of these are true:

- Postgres reachable
- Redis reachable
- schema readiness passes
- water artifacts validate
- required workers are running

If schema readiness fails, the engine should report degraded instead of pretending to be healthy.

## Do not do this

- Do not commit secrets to git.
- Do not copy local `.env.local` into docs.
- Do not expose internal routes directly to the public site.
- Do not skip migrations before boot.
- Do not treat missing optional integrations as fatal if they are intentionally unused.

## Windsurf handoff summary

- Scope: engine only.
- Final home: Hetzner-hosted engine, PostgreSQL, Redis, and internal auth.
- Out of scope: public site repo, Render runtime assumptions, and preview-layer testing setup.
- First verification after transfer:
  - `GET /internal/v1/health`
  - `POST /internal/v1/routing-decisions`
  - `GET /internal/v1/routing-decisions/:decisionId`
  - `POST /internal/v1/routing-decisions/:decisionId/execute`
- If any of those fail, fix the engine contract before touching UI or preview tooling.

## Start here for Windsurf

1. Open `ecobe-engine` first.
2. Verify `ECOBE_ENGINE_URL`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, and `REDIS_URL`.
3. Verify migrations and schema readiness.
4. Verify health and CI decision endpoints.
5. Only after the engine is stable, update the public UI repo to point at the engine host.
