import { BrandLogo } from './BrandLogo'

const flowCards = [
  {
    title: 'Signals',
    body: 'Carbon, water, latency, and runtime posture are normalized into a bounded decision input.',
  },
  {
    title: 'SAIQ Governance',
    body: 'Weighting, constraint logic, and zone posture shape the decision frame before execution.',
  },
  {
    title: 'Policy',
    body: 'Water guardrails, hard overrides, and execution rules determine what is admissible.',
  },
  {
    title: 'Decision',
    body: 'The engine returns one binding action: run, reroute, delay, throttle, or deny.',
  },
  {
    title: 'Proof',
    body: 'Proof hash, trace state, replay posture, and provenance remain attached to the same frame.',
  },
] as const

const supportingPanels = [
  {
    title: 'Deterministic inputs',
    body: 'Signals degrade, caches warm, and fallback discipline protects the decision path from becoming advisory.',
  },
  {
    title: 'Execution authority',
    body: 'The returned action is the control point. Downstream runtimes use it before the workload starts.',
  },
  {
    title: 'Replayable artifact',
    body: 'One decision frame, one proof chain, and one replayable envelope that can be inspected later.',
  },
] as const

export function DecisionFlowDiagram() {
  return (
    <div className="space-y-5">
      <div className="eyebrow">How it works</div>
      <h2 className="text-3xl font-semibold text-white sm:text-4xl">Signals become one binding decision path.</h2>

      <div className="relative grid gap-4 xl:grid-cols-5">
        <div className="pointer-events-none absolute left-[12%] right-[12%] top-1/2 hidden h-px -translate-y-1/2 bg-[linear-gradient(90deg,rgba(125,211,252,0.1),rgba(125,211,252,0.95),rgba(190,242,100,0.1))] xl:block" />
        <div className="pointer-events-none absolute left-[12%] right-[12%] top-1/2 hidden h-px -translate-y-1/2 xl:block">
          <div className="flow-pulse h-full w-24 rounded-full bg-[linear-gradient(90deg,rgba(125,211,252,0),rgba(125,211,252,0.95),rgba(190,242,100,0))]" />
        </div>

        {flowCards.map((card, index) => (
          <div key={card.title} className="surface-card relative overflow-hidden p-5">
            <div className="pointer-events-none absolute right-4 top-4 opacity-[0.12]">
              <BrandLogo variant="icon" className="h-10 w-auto" alt="" />
            </div>
            <div className="eyebrow">Step {index + 1}</div>
            <div className="mt-3 text-xl font-semibold text-white">{card.title}</div>
            <p className="mt-3 text-sm leading-7 text-slate-300">{card.body}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {supportingPanels.map((panel) => (
          <div key={panel.title} className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="eyebrow">{panel.title}</div>
            <p className="mt-3 text-sm leading-7 text-slate-300">{panel.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
