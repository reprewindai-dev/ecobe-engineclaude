export type BlogPost = {
  slug: string
  title: string
  description: string
  publishedAt: string
  readTime: string
  summary: string
  keywords: string[]
  sections: Array<{
    heading: string
    paragraphs: string[]
  }>
  relatedLinks: Array<{
    href: string
    label: string
  }>
}

export const blogPosts: BlogPost[] = [
  {
    slug: 'what-is-pre-execution-environmental-governance-for-compute',
    title: 'What is pre-execution environmental governance for compute?',
    description:
      'Why environmentally-governed compute needs a binding authorization layer before execution instead of post-hoc reporting.',
    publishedAt: '2026-03-30',
    readTime: '7 min read',
    summary:
      'Pre-execution environmental governance means a workload is evaluated before it runs, not after the fact. The control plane decides whether compute can proceed, where it may run, and what proof stays attached to that decision.',
    keywords: [
      'pre-execution environmental governance',
      'compute governance',
      'carbon aware control plane',
      'water aware compute',
      'environmental execution control',
    ],
    sections: [
      {
        heading: 'Execution is the control point',
        paragraphs: [
          'Most sustainability software operates after execution. It measures impact, explains historical usage, or recommends better placement. That is useful for reporting, but it is not governance.',
          'Pre-execution governance moves the control point upstream. A workload asks to run. The authority layer evaluates the request against environmental signals, policy constraints, and execution posture before compute is admitted.',
        ],
      },
      {
        heading: 'Authorization changes the category',
        paragraphs: [
          'The critical distinction is whether the system can bind the outcome. A reporting tool can describe what happened. A scheduler can recommend a cleaner region. A control plane can return one of several binding actions such as run, reroute, delay, throttle, or deny.',
          'That changes the product from advisory software into operational infrastructure. The system does not describe behavior at the edge of execution. It decides whether behavior is allowed at all.',
        ],
      },
      {
        heading: 'Environmental governance is multi-objective',
        paragraphs: [
          'Carbon is not the only signal that matters. Water stress, latency protection, and operating policy all shape whether a decision is defensible. A real governance layer must combine them without hiding the trade-offs inside black-box heuristics.',
          'CO2 Router uses SAIQ governance to evaluate those constraints before execution. The result is attached to the decision frame so trace, replay, and provenance remain consistent with the decision that was actually enforced.',
        ],
      },
      {
        heading: 'Proof is part of the contract',
        paragraphs: [
          'Pre-execution governance only matters if the resulting decision can be inspected later. That requires proof, trace, replay, and provenance to stay attached to the same frame, rather than being reconstructed later from best-effort logs.',
          'The system therefore needs deterministic replay, trace-backed decision state, and verified environmental inputs. Without that, governance is only a narrative.',
        ],
      },
    ],
    relatedLinks: [
      { href: '/methodology', label: 'Read the methodology' },
      { href: '/system/decision-engine', label: 'Inspect the decision engine' },
      { href: '/system/provenance', label: 'Review provenance' },
    ],
  },
  {
    slug: 'why-dashboards-are-not-enough-from-reporting-to-enforcement',
    title: 'Why dashboards are not enough: from reporting to enforcement',
    description:
      'Dashboards and telemetry are not enough to govern compute. The missing layer is pre-execution enforcement with proof.',
    publishedAt: '2026-03-30',
    readTime: '6 min read',
    summary:
      'Dashboards make systems visible. They do not decide whether a workload may run. Infrastructure governance requires an execution layer that can enforce policy before compute starts.',
    keywords: [
      'dashboards are not enough',
      'reporting versus enforcement',
      'control plane vs dashboard',
      'carbon dashboards',
      'infrastructure enforcement',
    ],
    sections: [
      {
        heading: 'Visibility is not authority',
        paragraphs: [
          'Dashboards are useful because they surface system state. They show carbon signals, cost posture, regional health, and decision history. They are not the layer that binds execution.',
          'If a workload can still run unchanged while the dashboard warns about better options, the operational control point remains elsewhere. Reporting has value, but it does not enforce.',
        ],
      },
      {
        heading: 'Enforcement begins before execution',
        paragraphs: [
          'A control surface becomes meaningful when it sits in front of execution and returns an outcome that downstream systems follow. That outcome has to exist before the workload starts, not after the fact.',
          'For environmental governance, that means carbon, water, and policy constraints must be resolved before the runtime commits to a region or queue.',
        ],
      },
      {
        heading: 'Proof separates infrastructure from presentation',
        paragraphs: [
          'Once a system starts returning binding decisions, it also has to explain them. That is why proof, trace, replay, and provenance are not ornamental features. They are part of the enforcement contract.',
          'A dashboard can display those artifacts, but the artifacts must originate in the decision system itself. Otherwise the presentation layer outruns the truth of the runtime.',
        ],
      },
      {
        heading: 'The new category is operational governance',
        paragraphs: [
          'CO2 Router is not trying to become a better dashboard. It is building a decision authority layer that happens to expose a public control surface. The dashboard exists to reveal the control plane, not to replace it.',
          'That is the transition from reporting to enforcement: from describing infrastructure behavior to governing it before execution.',
        ],
      },
    ],
    relatedLinks: [
      { href: '/console', label: 'Open the control surface' },
      { href: '/assurance', label: 'See assurance posture' },
      { href: '/system/trace-ledger', label: 'Inspect trace ledger' },
    ],
  },
  {
    slug: 'how-co2-router-makes-deterministic-decisions-with-proof-replay-and-provenance',
    title: 'How CO2 Router makes deterministic decisions with proof, replay, and provenance',
    description:
      'Inside the deterministic decision chain: signals, SAIQ governance, policy, decision, proof, replay, and provenance.',
    publishedAt: '2026-03-30',
    readTime: '8 min read',
    summary:
      'The system path is intentionally strict: signals are normalized, SAIQ governance applies policy, the engine returns a binding decision, and proof artifacts remain attached to the resulting frame for replay and inspection.',
    keywords: [
      'deterministic decisions',
      'proof replay provenance',
      'SAIQ governance',
      'trace ledger',
      'environmental decision engine',
    ],
    sections: [
      {
        heading: 'Signals become a bounded decision input',
        paragraphs: [
          'CO2 Router does not let request-time provider behavior define execution. Signals are collected, normalized, cached, and evaluated through a bounded decision path. Carbon and water inputs exist to support a deterministic decision, not a best-effort live fetch.',
          'That distinction matters for both latency and trust. A control plane cannot wait on the outside world and still claim real-time authority.',
        ],
      },
      {
        heading: 'SAIQ provides governance context',
        paragraphs: [
          'SAIQ is the governance layer that applies weighting, constraint logic, and zone semantics to the decision frame. It does not replace the engine. It explains how policy shaped the final action.',
          'That governance state becomes part of the trace record so the control plane can show why the frame was admitted, delayed, rerouted, throttled, or denied.',
        ],
      },
      {
        heading: 'The decision is binding',
        paragraphs: [
          'Once the engine resolves the frame, it returns one binding outcome. The downstream adapter or runtime uses that result as the execution authority. That is the moment where infrastructure control actually exists.',
          'Everything after that point is evidence: proof references, trace state, replay posture, and provenance visibility.',
        ],
      },
      {
        heading: 'Replay and provenance close the loop',
        paragraphs: [
          'Replay only matters if the same frame can be reconstructed against the same stored inputs. Provenance only matters if the environmental datasets behind the decision can be identified and verified.',
          'The result is a single chain from signal inputs to proof artifacts. That is what lets the product defend a decision instead of merely describing one.',
        ],
      },
    ],
    relatedLinks: [
      { href: '/developers/architecture', label: 'View architecture' },
      { href: '/system/replay', label: 'Inspect replay' },
      { href: '/system/provenance', label: 'Inspect provenance' },
    ],
  },
]

export function getBlogPost(slug: string) {
  return blogPosts.find((post) => post.slug === slug) ?? null
}
