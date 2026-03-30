# CO2 Router Production Validation Checklist

## Canonical source validation
- Confirm deploy source is only:
  - `C:\Users\antho\.windsurf\ecobe-engineclaude\ecobe-dashboard`
  - `C:\Users\antho\.windsurf\ecobe-engineclaude\ecobe-engine`
- Confirm no side worktree, nested repo copy, or root wrapper is the active Railway source

## Build validation
- Engine:
  - `npm run type-check`
  - `npm test -- --runTestsByPath src/__tests__/seked-internal.test.ts`
  - `npm test -- --runTestsByPath src/__tests__/grid-signal-cache-bucket.test.ts`
  - `npm run build`
- Dashboard:
  - `npm run type-check`
  - `npm run build`

## Runtime health validation
- `GET /health`
  - expect `200`
  - `checks.database = true`
  - `checks.redis = true`
  - water artifacts healthy
- `GET /api/v1/ci/health`
  - expect healthy or assurance-ready posture
- `GET /api/v1/water/provenance`
  - expect verified `aqueduct`, `aware`, `wwf`, `nrel`
- `GET /api/v1/ci/slo`
  - verify rolling window is updating

## Governance activation validation
- Set production env:
  - `SEKED_POLICY_ADAPTER_ENABLED=true`
  - `SEKED_POLICY_ADAPTER_URL=` blank
  - `EXTERNAL_POLICY_HOOK_ENABLED=false`
- Call `POST /api/v1/internal/policy/seked/evaluate`
  - expect `source = SEKED_INTERNAL_V1`
  - expect `score`, `zone`, `weights`, `thresholds`, `policyReference`
- Post a fresh CI decision
  - expect command center new frame to show:
    - `SAIQ enforced = true`
    - `governance source = SEKED_INTERNAL_V1`

## Trace and replay validation
- Post a fresh CI decision
  - include `x-ecobe-signature` when `DECISION_API_SIGNATURE_SECRET` is configured
- Read response headers:
  - `Replay-Trace-ID`
  - `X-CO2Router-Trace-Hash`
- `GET /api/v1/ci/decisions/:decisionFrameId/trace`
  - expect `traceAvailable = true`
- `GET /api/v1/ci/decisions/:decisionFrameId/trace/raw`
  - expect governance payload to include:
    - `source`
    - `score`
    - `zone`
    - `weights`
    - `thresholds`
- `GET /api/v1/ci/decisions/:decisionFrameId/replay`
  - expect `deterministicMatch = true`
  - expect no mismatches

## Cache-path validation
- Warm loop writes current and next minute buckets
- Request path reads the same minute bucket
- For a hot request:
  - expect cache hit
  - expect no live provider retry storm
  - expect last-known-good used only for degraded path

## Action matrix validation
- Execute live scenarios producing:
  - `run_now`
  - `reroute`
  - `delay`
  - `throttle`
  - `deny`
- For each frame verify:
  - decision persisted
  - trace persisted
  - replay deterministic
  - outbox row created
  - proof hash present

## Event delivery validation
- Confirm the system-managed self-verifier sink exists and is `ACTIVE`
- `GET /api/v1/integrations/webhooks`
  - expect one sink named `CO2 Router Decision Event Self Verifier`
- Dispatch fresh decision
- Verify:
  - outbox row reaches `SENT`
  - verifier route accepts the signed payload
  - `IntegrationEvent` receipt is written

## Dashboard truth validation
- `/console`
  - must render live command center
  - must show real governance source
  - must show real weights when governance payload contains weights
  - if weights are absent, must show:
    - `Unavailable`
    - `Not exposed by current live decision payload`
- `/`
  - must render canonical landing page, not starter page
- `/co2router-logo.png`
  - must resolve to canonical brand asset

## Performance target validation
- `GET /api/v1/ci/slo`
  - target `p95.totalMs <= 100`
  - target `p95.computeMs <= 50`
- Verify command center header and SLO endpoint converge to the same rolling truth window

## Final doctrine-complete expected state
- `traceAvailable = true`
- `traceLocked = true`
- `replayVerified = true`
- `SAIQ enforced = true`
- `governance source = SEKED_INTERNAL_V1` or real external source name
- `verified water datasets >= 4`
- `p95 total <= 100ms`
- `p95 compute <= 50ms`
- signed event delivery verified
