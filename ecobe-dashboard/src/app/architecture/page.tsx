const blocks = [
  {
    title: 'Control plane',
    body: 'The engine decides before execution. The UI explains that doctrine. Adapters translate control-point context. Execution targets remain downstream.',
  },
  {
    title: 'Doctrine order',
    body: 'Policy overrides, water guardrails, SLA protection, carbon optimization inside the allowed envelope, and cost as a late tie-breaker.',
  },
  {
    title: 'Proof model',
    body: 'Every canonical decision frame can carry decision envelope, proof envelope, telemetry bridge, adapter context, and replay-critical metadata.',
  },
  {
    title: 'Enforcement wedges',
    body: 'CI/CD and Kubernetes remain the strongest production wedges today. The broader adapter plane is real but not equally mature yet.',
  },
] as const

export default function ArchitecturePage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="surface-card-strong p-8">
        <div className="eyebrow">Architecture</div>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">A deterministic environmental authorization control plane.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          CO2 Router is not a dashboard pretending to be infrastructure. The core engine authorizes, persists, explains, and replays decisions before workloads run.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {blocks.map((block) => (
          <div key={block.title} className="surface-card p-6">
            <div className="eyebrow">{block.title}</div>
            <p className="mt-4 text-base leading-7 text-slate-300">{block.body}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
