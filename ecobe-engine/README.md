# CO2 Router Engine

CO2 Router is a deterministic, pre‑execution environmental authorization control
plane for compute. The engine evaluates carbon, water, latency, cost, and policy
inputs and returns exactly one binding action:

- `run_now`
- `reroute`
- `delay`
- `throttle`
- `deny`

For each decision it emits proof metadata, trace lineage, and replay support for
trace‑backed frames.

Public documentation lives in:
`docs/public/` (repository root).

## Canonical API (Public)

- `POST /api/v1/ci/authorize`
- `GET /api/v1/ci/decisions`
- `GET /api/v1/ci/decisions/:decisionFrameId/trace`
- `GET /api/v1/ci/decisions/:decisionFrameId/replay`
- `GET /api/v1/water/provenance`
- `GET /api/v1/ci/slo`

## Runtime Notes (Public)

- Decisions are made before execution.
- Water authority can block or delay execution.
- Proof and trace are persisted for auditability.

## Development

```bash
npm install
npm run dev
```
