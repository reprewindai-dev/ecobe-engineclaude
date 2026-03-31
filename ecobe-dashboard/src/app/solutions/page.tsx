import Link from 'next/link'

const sections = [
  {
    id: 'ci-cd',
    title: 'CI/CD',
    body: 'Put a deterministic decision gate in front of build, test, and deploy jobs. Delay or reroute the job when conditions are wrong, and return proof metadata with the job context.',
  },
  {
    id: 'serverless',
    title: 'Serverless',
    body: 'Support Lambda as an adapter and control point, not as the architecture. The runtime can stay serverless while the decision core remains universal.',
  },
  {
    id: 'kubernetes',
    title: 'Kubernetes',
    body: 'Use admission and scheduling lanes to carry deny, reroute, or throttle posture into cluster execution with deterministic enforcement artifacts.',
  },
  {
    id: 'batch-queues',
    title: 'Batch & Queues',
    body: 'Queued and movable work is where delay and reroute become most valuable. Evaluate before dispatch, not after the workload has already burned the wrong window.',
  },
  {
    id: 'enterprise-governance',
    title: 'Enterprise Governance',
    body: 'Give platform and compliance teams one doctrine, one proof model, and one place to review why execution was allowed, delayed, or blocked.',
  },
] as const

export default function SolutionsPage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="surface-card-strong p-8">
        <div className="eyebrow">Solutions</div>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Control points for the workloads buyers actually run.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
          CO2 Router is strongest where the buyer has execution flexibility, governance pressure, and a clear need to prove what happened before a workload ran.
        </p>
      </section>

      <section className="grid gap-6">
        {sections.map((section) => (
          <div id={section.id} key={section.id} className="surface-card p-6">
            <div className="eyebrow">{section.title}</div>
            <p className="mt-4 max-w-4xl text-base leading-7 text-slate-300">{section.body}</p>
          </div>
        ))}
      </section>

      <section className="surface-card p-6">
        <div className="eyebrow">Need a pilot path?</div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/access" className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">
            Request access
          </Link>
          <Link href="/contact" className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/5">
            Talk to the team
          </Link>
        </div>
      </section>
    </div>
  )
}
