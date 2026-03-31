const requestExample = `POST /api/v1/ci/authorize
Content-Type: application/json

{
  "requestId": "req_123",
  "idempotencyKey": "job_123",
  "caller": { "id": "github-actions", "kind": "ci", "signature": "sig_v1" },
  "runtimeTarget": {
    "runtime": "kubernetes",
    "provider": "aws",
    "transport": "sync_http",
    "controlPoint": "runner_pre_job",
    "preferredRegions": ["us-east-1", "eu-west-1"]
  },
  "workload": { "name": "nightly-model-batch", "type": "ci", "criticality": "standard" }
}`

const webhookExample = `{
  "specversion": "1.0",
  "type": "ecobe.decision.applied",
  "source": "co2-router",
  "id": "evt_123",
  "time": "2026-03-27T23:46:37.925Z",
  "data": {
    "decisionFrameId": "d82c61fd-4bd1-4d92-920d-9abba6b2144b",
    "action": "delay",
    "reasonCode": "DELAY_HIGH_WATER",
    "proofHash": "262c0719fc8b084d8096fb412c61c595ee6a8a002ed52873ee2f19a070ef3629"
  }
}`

export default function DevelopersPage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="surface-card-strong p-8">
        <div className="eyebrow">Developers</div>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">One canonical decision model, many thin adapters.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          The moat is the decision core and proof model. Adapters stay thin, transport-friendly, and replay-compatible.
        </p>
      </section>

      <section id="quickstart" className="surface-card p-6">
        <div className="eyebrow">Quickstart</div>
        <p className="mt-4 text-base leading-7 text-slate-300">Send a request to the canonical Decision API v1 and use the returned action, proof, and adapter context to control execution.</p>
        <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-6 text-slate-200">
          <code>{requestExample}</code>
        </pre>
      </section>

      <section id="api-reference" className="surface-card p-6">
        <div className="eyebrow">API reference</div>
        <p className="mt-4 text-base leading-7 text-slate-300">
          The synchronous path is <span className="font-mono text-slate-200">POST /api/v1/ci/authorize</span>. The response returns a canonical decision envelope, proof envelope, telemetry bridge, and adapter context.
        </p>
      </section>

      <section id="adapters" className="surface-card p-6">
        <div className="eyebrow">Adapters</div>
        <p className="mt-4 text-base leading-7 text-slate-300">
          API, CI, Lambda, Kubernetes, queue, and webhook adapters translate runtime context into the same deterministic core. They do not score or decide on their own.
        </p>
      </section>

      <section id="schemas" className="surface-card p-6">
        <div className="eyebrow">Schemas</div>
        <p className="mt-4 text-base leading-7 text-slate-300">
          Decision frame ID, action, reason code, selected target, timing, doctrine version, proof hash, assurance posture, and telemetry attributes remain stable across transports.
        </p>
      </section>

      <section id="webhooks" className="surface-card p-6">
        <div className="eyebrow">Webhooks</div>
        <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-6 text-slate-200">
          <code>{webhookExample}</code>
        </pre>
      </section>
    </div>
  )
}
