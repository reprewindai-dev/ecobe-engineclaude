import Link from 'next/link'

const ACTIONS = [
  { action: 'run_now', color: '#22c55e', desc: 'Conditions clear — execute immediately' },
  { action: 'reroute', color: '#3b82f6', desc: 'Redirect to lower-carbon region' },
  { action: 'delay', color: '#d97706', desc: 'Hold until clean window opens' },
  { action: 'throttle', color: '#f59e0b', desc: 'Reduce resource footprint to comply' },
  { action: 'deny', color: '#dc2626', desc: 'Execution refused — policy violation' },
]

const DOCS = [
  {
    href: '/docs/whitepaper',
    title: 'Technical Whitepaper',
    desc: 'Architecture, signal arbitration, cryptographic decision provenance, and the SAIQ governance framework.',
    badge: 'PDF · March 2026',
  },
  {
    href: '/docs/architecture',
    title: 'Architecture Diagrams',
    desc: 'Signal tier topology, decision pipeline, provider hierarchy, fallback chain, and enforcement path.',
    badge: 'Diagrams',
  },
  {
    href: '/docs/latency',
    title: 'Latency ADR-001',
    desc: 'Five-layer latency control architecture. 100ms hot path budget. Measured: 77ms p95 total, 59ms p95 compute.',
    badge: 'ADR · Accepted',
  },
  {
    href: '/docs/data-layer',
    title: 'Data Layer Report',
    desc: '35+ Prisma models. Decision log, grid signal snapshots, water bundles, adaptive intelligence, observability path.',
    badge: 'Internal · Engineering',
  },
  {
    href: '/docs/audit',
    title: 'Production Audit',
    desc: 'Full audit of engine and dashboard. Implementation status, known issues, test coverage, environment requirements.',
    badge: 'March 2026',
  },
  {
    href: '/docs/master-system',
    title: 'Master System Document',
    desc: 'Canonical reference: locked claims, terminology, identity, architecture principles, and distribution architecture.',
    badge: '12 sections',
  },
]

const SIGNALS = [
  { tier: 'T1', name: 'WattTime MOER', role: 'Primary causal routing signal', status: 'live', note: 'MOER current + forecast' },
  { tier: 'T1', name: 'EIA-930', role: 'Predictive grid telemetry', status: 'live', note: 'Balance, interchange, subregion' },
  { tier: 'T2', name: 'Electricity Maps', role: 'Flow-traced enrichment (optional)', status: 'live', note: 'Premium, per-key' },
  { tier: 'T3', name: 'Ember', role: 'Structural validation only', status: 'live', note: 'Monthly/yearly baseline' },
  { tier: 'T4', name: 'Aqueduct 2.1 / AWARE 2.0', role: 'Water stress index', status: 'degraded', note: '27hr stale — monitored' },
  { tier: 'T4', name: 'CO₂Router Decision Log', role: 'Proprietary moat — owned signal', status: 'live', note: 'Grows with every decision' },
]

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">

      {/* Hero */}
      <div className="relative mb-24 pt-8">
        <div className="hero-glow" />
        <div className="relative z-10">
          <div className="fade-up fade-up-1 inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-[#22c55e]/25 bg-[#22c55e]/5 text-xs font-mono text-[#22c55e] mb-8">
            <span className="relative flex h-2 w-2">
              <span className="pulse-ring absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22c55e]" />
            </span>
            Live · co2router.tech — Technical Reference
          </div>

          <h1 className="fade-up fade-up-2 text-5xl sm:text-6xl lg:text-7xl font-black text-[#e2ebe8] leading-[0.95] tracking-tight mb-6">
            Deterministic<br />
            <span style={{background: 'linear-gradient(90deg, #22c55e 0%, #4ade80 50%, #22c55e 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>
              Environmental
            </span><br />
            Execution Control
          </h1>

          <p className="fade-up fade-up-3 text-lg text-[#8a9e9a] leading-relaxed max-w-2xl mb-4">
            CO₂Router authorizes compute <strong className="text-[#e2ebe8] font-medium">before it runs</strong>.
            Every decision is deterministic, cryptographically sealed, and replayable.
          </p>
          <p className="fade-up fade-up-3 text-sm text-[#556663] font-mono mb-10">
            Five binding actions · Full signal provenance · 77ms p95 · SHA-256 proof per frame
          </p>

          <div className="fade-up fade-up-4 flex flex-wrap gap-3 mb-14">
            <Link
              href="/docs/whitepaper"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#22c55e] text-[#080c0b] text-sm font-bold hover:bg-[#4ade80] transition-colors shadow-lg shadow-[#22c55e]/20"
            >
              Read the Whitepaper
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7H12M12 7L8 3M12 7L8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </Link>
            <Link
              href="/docs/architecture"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[#1a2826] text-[#8a9e9a] text-sm hover:text-[#e2ebe8] hover:border-[#22c55e]/30 hover:bg-[#0d1412] transition-all"
            >
              Architecture
            </Link>
            <Link
              href="/media"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[#1a2826] text-[#8a9e9a] text-sm hover:text-[#e2ebe8] hover:border-[#22c55e]/30 hover:bg-[#0d1412] transition-all"
            >
              Media Kit
            </Link>
          </div>

          {/* Live stats bar */}
          <div className="fade-up fade-up-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'p95 Latency', value: '77ms', sub: '250 samples — measured' },
              { label: 'Compute Budget', value: '59ms', sub: 'p95 — hot path only' },
              { label: 'Signal Tiers', value: '4', sub: 'WattTime · EIA · Ember · Water' },
              { label: 'SLA Ceiling', value: '≤200ms', sub: 'p99 cross-region' },
            ].map((s) => (
              <div key={s.label} className="stat-card border border-[#1a2826] rounded-xl p-4 bg-[#0d1412]">
                <div className="text-xs font-mono text-[#556663] uppercase tracking-wider mb-1">{s.label}</div>
                <div className="text-2xl font-mono font-bold text-[#22c55e]">{s.value}</div>
                <div className="text-[10px] text-[#556663] mt-1 leading-snug">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Five-Action Schema */}
      <section className="mb-20">
        <div className="text-xs font-mono text-[#556663] uppercase tracking-wider mb-4">Decision Schema</div>
        <h2 className="text-xl font-semibold text-[#e2ebe8] mb-6">Five Binding Actions</h2>
        <p className="text-[#8a9e9a] text-sm mb-6 leading-relaxed">
          Every authorization request returns exactly one of five binding actions. These are not recommendations — they are the output of a governance engine with execution authority.
        </p>
        <div className="border border-[#1a2826] rounded-xl overflow-hidden">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {ACTIONS.map((a) => (
                <tr key={a.action}>
                  <td>
                    <code style={{ color: a.color }} className="text-xs font-mono font-semibold bg-transparent border-0 p-0">
                      {a.action}
                    </code>
                  </td>
                  <td className="text-[#8a9e9a] text-sm">{a.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-xs text-[#556663]">
          The <code>deny</code> action distinguishes CO₂Router from advisory systems. A system that cannot deny does not govern.
        </div>
      </section>

      {/* Signal Tier Architecture */}
      <section className="mb-20">
        <div className="text-xs font-mono text-[#556663] uppercase tracking-wider mb-4">Signal Architecture</div>
        <h2 className="text-xl font-semibold text-[#e2ebe8] mb-2">Provider Hierarchy</h2>
        <p className="text-[#8a9e9a] text-sm mb-6 leading-relaxed">
          Signals are ranked by trust tier. The lowest defensible signal is used — never averaged. Every signal carries source, freshness, estimated/synthetic flags, and confidence score through the decision into the proof frame.
        </p>
        <div className="border border-[#1a2826] rounded-xl overflow-hidden">
          <table>
            <thead>
              <tr>
                <th style={{width: '3.5rem'}}>Tier</th>
                <th>Provider</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {SIGNALS.map((s, i) => (
                <tr key={i}>
                  <td>
                    <span className="font-mono text-xs text-[#556663]">{s.tier}</span>
                  </td>
                  <td>
                    <span className="text-[#e2ebe8] text-sm font-medium">{s.name}</span>
                    <div className="text-xs text-[#556663] mt-0.5 font-mono">{s.note}</div>
                  </td>
                  <td className="text-[#8a9e9a] text-sm">{s.role}</td>
                  <td>
                    <span className={`text-xs font-mono ${s.status === 'live' ? 'text-[#22c55e]' : 'text-amber-400'}`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Evaluation Order */}
      <section className="mb-20">
        <div className="text-xs font-mono text-[#556663] uppercase tracking-wider mb-4">Governance</div>
        <h2 className="text-xl font-semibold text-[#e2ebe8] mb-6">Multi-Objective Evaluation Order</h2>
        <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
          {['Policy', 'Water', 'SLA', 'Carbon', 'Cost'].map((step, i, arr) => (
            <div key={step} className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded bg-[#0d1412] border border-[#1a2826]">
                <span className="text-[#556663] text-xs">{i + 1}</span>
                <span className="text-[#e2ebe8]">{step}</span>
              </div>
              {i < arr.length - 1 && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#556663]">
                  <path d="M3 7H11M11 7L7.5 3.5M11 7L7.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-[#556663] mt-3 font-mono">
          Evaluation is sequential and exits early on policy violation. Cost is never a routing reason — it is a consequence.
        </p>
      </section>

      {/* Proof Architecture callout */}
      <section className="mb-20">
        <div className="border border-[#1a2826] rounded-xl p-6 bg-[#0d1412]">
          <div className="text-xs font-mono text-[#556663] uppercase tracking-wider mb-3">Cryptographic Provenance</div>
          <h2 className="text-lg font-semibold text-[#e2ebe8] mb-3">SHA-256 ProofHash per Decision Frame</h2>
          <p className="text-[#8a9e9a] text-sm leading-relaxed mb-4">
            Every decision is sealed with a SHA-256 hash of the canonical decision envelope. The envelope includes: arbitrated signal values, policy evaluation result, decision action, selected region, reference timestamp, and operating mode. Any modification to the record invalidates the hash.
          </p>
          <pre className="text-xs">{`// CiResponseV2 — core proof fields
{
  decisionFrameId:     "32133b3a-77f5-4123-b5f6-024e8f954eba",
  decision:            "run_now",
  proofHash:           "sha256:a7f3d9...",
  qualityTier:         "HIGH",
  signalConfidence:    0.88,
  fallbackUsed:        false,
  carbonIntensity:     112,        // gCO₂/kWh
  selectedRegion:      "us-west-2",
  leaseExpiresAt:      "2026-04-02T08:21:00Z",  // +4h (HIGH tier)
  estimatedFlag:       false,
  syntheticFlag:       false,
  provider_disagreement: { flag: false, pct: 3.1 }
}`}</pre>
        </div>
      </section>

      {/* Latency */}
      <section className="mb-20">
        <div className="text-xs font-mono text-[#556663] uppercase tracking-wider mb-4">Performance</div>
        <h2 className="text-xl font-semibold text-[#e2ebe8] mb-6">Latency Architecture</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'p95 Total', value: '77ms', note: 'measured — 250 samples' },
            { label: 'p95 Compute', value: '59ms', note: 'measured — 250 samples' },
            { label: 'p99 SLA', value: '≤200ms', note: 'cross-region contract' },
          ].map((m) => (
            <div key={m.label} className="border border-[#1a2826] rounded-lg p-4 bg-[#0d1412]">
              <div className="text-xs text-[#556663] font-mono uppercase tracking-wider mb-1">{m.label}</div>
              <div className="text-2xl font-mono font-semibold text-[#22c55e]">{m.value}</div>
              <div className="text-xs text-[#556663] mt-1">{m.note}</div>
            </div>
          ))}
        </div>
        <p className="text-sm text-[#8a9e9a] leading-relaxed">
          Hot path budget: 100ms internal quality gate. Budget allocation: 40ms signal resolution (cache-only) · 20ms scoring · 10ms governance · 10ms serialization · 20ms buffer.
          Provider calls <strong className="text-[#e2ebe8] font-normal">never</strong> occur on the hot path — all external data flows through background workers → Redis cache → hot path.
        </p>
        <Link href="/docs/latency" className="inline-flex items-center gap-1.5 text-xs text-[#22c55e] hover:text-[#4ade80] transition-colors mt-3">
          Read Latency ADR-001 →
        </Link>
      </section>

      {/* Documentation grid */}
      <section className="mb-20">
        <div className="text-xs font-mono text-[#556663] uppercase tracking-wider mb-4">Documentation</div>
        <h2 className="text-xl font-semibold text-[#e2ebe8] mb-6">Reference Materials</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DOCS.map((doc) => (
            <Link
              key={doc.href}
              href={doc.href}
              className="group block p-4 rounded-xl border border-[#1a2826] bg-[#0d1412] hover:border-[#243330] hover:bg-[#131c1a] transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-medium text-[#e2ebe8] group-hover:text-[#22c55e] transition-colors">{doc.title}</h3>
                <span className="flex-shrink-0 text-xs font-mono text-[#556663] border border-[#1a2826] px-1.5 py-0.5 rounded">{doc.badge}</span>
              </div>
              <p className="text-xs text-[#8a9e9a] leading-relaxed">{doc.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Accuracy targets */}
      <section className="mb-8 border border-amber-500/20 rounded-xl p-5 bg-amber-500/3">
        <div className="flex items-start gap-3">
          <div className="w-1 flex-shrink-0 h-full bg-amber-500/40 rounded-full mt-0.5" style={{minHeight: '3rem'}} />
          <div>
            <div className="text-xs font-mono text-amber-400/70 uppercase tracking-wider mb-1.5">Design Targets — Not Yet Validated in Production</div>
            <div className="text-sm text-[#8a9e9a] leading-relaxed">
              Accuracy targets are architectural design goals: ≤12% carbon forecast variance · ≥85% clean window detection · ≤10% confidence calibration error · ≥95% provider disagreement detection.
              Measured latency (77ms p95, 59ms p95 compute, 250 samples) is verified. Accuracy figures require sustained production volume to validate. See the <Link href="/docs/audit" className="text-amber-400 hover:text-amber-300 transition-colors">Production Audit</Link> for current status.
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
