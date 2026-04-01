# CI Projection Cutover Runbook

Verified baseline before cutover:
- `CIDecision` live and current
- `DashboardRoutingDecision` stale after `2026-03-24`
- `DecisionEventOutbox` healthy but sink-only

## Goal
- Make `CIDecision` the canonical CI write model
- Feed `DashboardRoutingDecision` only through `DecisionProjectionOutbox` + projector worker
- Restore trustworthy `24h`, `7d`, and `30d` dashboard windows

## Pre-cutover checks
Run and record timestamps for:

```sql
SELECT COUNT(*) AS routing_count, MAX("createdAt") AS latest_routing
FROM "DashboardRoutingDecision";

SELECT COUNT(*) AS ci_count, MAX("createdAt") AS latest_ci
FROM "CIDecision";

SELECT status, COUNT(*)
FROM "DecisionProjectionOutbox"
GROUP BY status
ORDER BY status;
```

## Deployment order
1. Deploy the application code with:
   - direct dashboard write removed from `persistCiDecisionResult`
   - projection worker enabled
   - dashboard fallback labels enabled
2. Apply Prisma migration `20260401221000_add_ci_projection_outbox`.
3. Verify startup passes the schema readiness gate.

## Replay
Replay the last 30 days into the projection outbox:

```bash
npm --prefix ecobe-engine run projection:replay:ci -- 30
```

Then allow the `decisionProjectionDispatcher` worker to drain the outbox.

## Verification
Record start and end timestamps for:

```sql
SELECT
  MAX("createdAt") AS latest_projection_source_at,
  MAX("projectedAt") AS latest_projected_at
FROM "DashboardRoutingDecision"
WHERE "sourceCiDecisionId" IS NOT NULL;

SELECT COUNT(*) AS canonical_rows
FROM "CIDecision"
WHERE "createdAt" >= now() - interval '30 days';

SELECT COUNT(*) AS projected_rows
FROM "DashboardRoutingDecision"
WHERE "sourceCiDecisionId" IS NOT NULL
  AND "createdAt" >= now() - interval '30 days';

SELECT "qualityStatus", COUNT(*)
FROM "DashboardRoutingDecision"
WHERE "sourceCiDecisionId" IS NOT NULL
  AND "createdAt" >= now() - interval '30 days'
GROUP BY "qualityStatus"
ORDER BY "qualityStatus";
```

Expected:
- projection lag falls under SLO
- `24h`, `7d`, `30d` views populate again
- suspect rows are explainable
- invalid rows are quarantined from credibility claims

## Public-read checks
Verify:
- `/api/v1/dashboard/impact-report`
- `/api/v1/dashboard/metrics`
- `/api/v1/dashboard/savings`

Each response must now label:
- `dataSource`
- `dataStatus`
- `projectionLagSec`
- `latestProjectionAt`
- `latestCanonicalAt`

If projection is stale or broken, the response must switch to `canonical_fallback`.

## Follow-on work
- Full-history replay after 30-day cutover is stable
- Convert legacy/admin dashboard writers to the same canonical projection path
- Add alerting on projection lag and projection dead letters
