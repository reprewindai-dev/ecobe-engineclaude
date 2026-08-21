---
name: local-engine-testing
description: Boot the ECOBE engine locally against real Postgres/Redis and exercise the authenticated /api/v1/ci endpoints (decisions, export proof chain, Merkle proofs).
---

# Local ECOBE engine testing

## Services
No docker-compose service is wired for tests; start your own:

```bash
docker run -d --name pg-test -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -p 5432:5432 postgres:16
docker run -d --name redis-test -p 6379:6379 redis:7
docker exec pg-test psql -U postgres -c "CREATE DATABASE ecobe_engine;"
```

Minimal `.env` (the rest of the provider keys are optional; routing degrades gracefully):

```
PORT=3004
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/ecobe_engine?schema=public
DIRECT_DATABASE_URL=<same>
REDIS_URL=redis://127.0.0.1:6379
ECOBE_INTERNAL_API_KEY=test-internal-key-123
ECOBE_ENFORCE_BROKER_ID=false
ENGINE_BACKGROUND_WORKERS_ENABLED=false
```

Then: `npx prisma migrate deploy && npm run prisma:seed && npm run dev` (tsx watch, port 3004).
`npm run prisma:seed` seeds the 42 reference regions and is required for realistic routing.

## Auth
Every `/api/v1/ci/*` route is behind `internalServiceGuard` (src/middleware/internal-auth.ts).
Send `x-ecobe-internal-key: $ECOBE_INTERNAL_API_KEY` (or `Authorization: Bearer ...`, or `x-api-key`).
Missing/incorrect key -> `{"error":"Unauthorized","code":"UNAUTHORIZED_INTERNAL_CALL"}`.

## Producing real CIDecision rows
`POST /api/v1/ci/authorize` (aliases `/route`, `/carbon-route`) needs an organization scope with an
ACTIVE doctrine version, otherwise it 503s with `DOCTRINE_ORG_SCOPE_MISSING` /
`DOCTRINE_ACTIVE_VERSION_NOT_FOUND`:

1. Insert an Organization row (`INSERT INTO "Organization" (id,name,slug,"apiKey","updatedAt") VALUES (...)`).
2. Do NOT send `x-ecobe-org-id` — only the fallback-org path (`resolveFallbackOrgId`) calls
   `ensureActiveDoctrineForOrg` and bootstraps a doctrine. Passing the header skips bootstrap.
3. The fallback org lookup is cached for 60s, including a negative (null) result: if you insert the
   org after a failed call, wait ~60s (or restart the server) before retrying.

Example body: `{"repository":"acme/app","workflow":"build","commitSha":"sha1","preferredRegions":["us-east-1"],"criticality":"batch"}`.
Without provider API keys the engine returns CRISIS-mode `delay` decisions — still persisted to
`CIDecision`, which is enough for export/proof testing.

## Export proof chain + Merkle
- `POST /api/v1/ci/exports/proof {"limit":10}` -> batchId/batchHash/merkleRoot; envelope written to
  `data/exports/ci/<batchId>.json` (git-ignored artifacts accumulate; the chain is append-only).
- `GET /api/v1/ci/exports/proof/:batchId/merkle/:decisionFrameId` -> `{record, proof}`.
- `POST /api/v1/ci/exports/proof/verify` `{batchId?, expectedRoot?, proof}` -> `{verified}`.
- To prove the root is real, recompute independently: leaf = sha256(0x00 || sha256(canonicalJSON(record))),
  node = sha256(0x01 || L || R), odd trailing node promoted unchanged. canonicalJSON = sorted keys, no
  whitespace (`sha256Canonical` in src/lib/proof/export-chain.ts). `batchHash` =
  sha256(canonicalJSON({previousBatchHash, payload, merkleRoot})).

## Devin Secrets Needed
None for local testing (provider keys such as ELECTRICITY_MAPS_API_KEY / WATTTIME_* are optional and
only needed for non-degraded routing signals).
