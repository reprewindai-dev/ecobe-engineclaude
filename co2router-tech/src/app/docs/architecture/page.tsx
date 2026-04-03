import { DocLayout } from '@/components/DocLayout'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Architecture Diagrams',
  description: 'CO₂Router architecture: signal tier topology, decision pipeline, provider hierarchy, fallback chain, and enforcement path.',
}

export default function ArchitecturePage() {
  return (
    <DocLayout
      title="Architecture Diagrams"
      subtitle="Signal tier topology, decision pipeline, provider hierarchy, fallback chain, SAIQ framework, and enforcement path."
      badge="March 2026"
      badgeColor="blue"
      currentPath="/docs/architecture"
    >
      {/* ── VISUAL DIAGRAMS FROM PITCH ── */}

      {/* Assembly Line */}
      <div className="border border-[#1a2826] rounded-2xl bg-[#0d1412] overflow-hidden my-8">
        <div className="px-6 pt-6 pb-4 border-b border-[#1a2826]">
          <div className="text-xs font-mono text-[#556663] uppercase tracking-wider mb-1">Execution Model</div>
          <div className="text-lg font-bold text-[#e2ebe8]">The execution engine assembly line.</div>
        </div>
        <div className="grid grid-cols-5 divide-x divide-[#1a2826]">
          {[
            { n: '1', name: 'Signals', desc: 'Carbon, water, latency, and runtime posture are normalised into a bounded decision input.' },
            { n: '2', name: 'SAIQ Governance', desc: 'Weighting, constraint logic, and zone posture shape the decision frame.' },
            { n: '3', name: 'Policy', desc: 'Water guardrails, hard overrides, and execution rules determine what is admissible.' },
            { n: '4', name: 'Decision', desc: 'The engine returns one binding action (run, reroute, delay, throttle, deny).' },
            { n: '5', name: 'Proof', desc: 'Proof hash, trace state, replay posture, and provenance lock to the frame.' },
          ].map((s, i) => (
            <div key={s.n} className="p-5 relative">
              <div className="text-3xl font-black text-[#e2ebe8] mb-2">{s.n}</div>
              <div className="text-sm font-semibold text-[#22c55e] mb-2">{s.name}</div>
              <div className="text-xs text-[#8a9e9a] leading-relaxed">{s.desc}</div>
              {i < 4 && (
                <div className="absolute top-1/2 -right-3 w-5 h-5 bg-[#0d1412] border border-[#1a2826] rounded-full flex items-center justify-center z-10">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4H7M7 4L4.5 1.5M7 4L4.5 6.5" stroke="#556663" strokeWidth="1" strokeLinecap="round"/></svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Proof Chain */}
      <div className="border border-[#1a2826] rounded-2xl bg-[#0d1412] overflow-hidden my-8">
        <div className="px-6 pt-6 pb-4 border-b border-[#1a2826]">
          <div className="text-xs font-mono text-[#556663] uppercase tracking-wider mb-1">Cryptographic Provenance</div>
          <div className="text-lg font-bold text-[#e2ebe8]">Every decision carries inspectable, tamper-evident evidence.</div>
        </div>
        <div className="p-6">
          <div className="flex items-stretch gap-0 mb-6 overflow-x-auto">
            {[
              { label: 'Block 1', sub: '(Input)', color: '#556663' },
              { label: 'Block 2', sub: '(Signals)', color: '#3b82f6' },
              { label: 'Block 3', sub: '(Policy)', color: '#8b5cf6' },
              { label: 'Block 4', sub: '(Decision)', color: '#22c55e' },
              { label: 'Block 5', sub: '(Proof)', color: '#22c55e' },
            ].map((b, i) => (
              <div key={b.label} className="flex items-center">
                <div className="border-2 rounded-xl px-4 py-3 text-center min-w-[90px]" style={{ borderColor: b.color + '40' }}>
                  <div className="text-xs font-mono font-bold" style={{ color: b.color }}>{b.label}</div>
                  <div className="text-xs text-[#556663]">{b.sub}</div>
                </div>
                {i < 4 && <div className="text-[#556663] px-2 text-lg">→</div>}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-[#1a2826] rounded-xl p-4 font-mono text-xs">
              <div className="text-[#556663] mb-2">Input</div>
              <div className="text-[#e2ebe8]">job_id: 32133b3a-77f5-4123-b5f6-024e8f954eba</div>
              <div className="text-[#e2ebe8]">selected_region: us-west-2</div>
            </div>
            <div className="border border-[#22c55e]/20 rounded-xl p-4 font-mono text-xs">
              <div className="text-[#22c55e]/70 mb-2">Output Proof</div>
              <div className="text-[#e2ebe8]">proof_hash: cdfe785dcbef178175</div>
              <div className="text-[#e2ebe8]">confidence: 0.88</div>
              <div className="mt-2 text-[#22c55e] text-xs px-2 py-1 rounded bg-[#22c55e]/10 inline-block">replay deterministic match</div>
            </div>
          </div>
          <div className="mt-3 border border-[#1a2826] rounded-xl p-3 font-mono text-xs text-[#556663]">
            Policy Trace Ledger: SEKED_POLICY_ADAPTER_APPLIED · SEKED_POLICY_ZONE_GREEN · OPERATING_MODE_NORMAL
          </div>
        </div>
      </div>

      {/* Signal Degradation / Mirrored Caches */}
      <div className="border border-[#1a2826] rounded-2xl bg-[#0d1412] overflow-hidden my-8">
        <div className="px-6 pt-5 pb-4 border-b border-[#1a2826]">
          <div className="text-lg font-bold text-[#e2ebe8]">Signals degrade. Execution authority does not.</div>
          <div className="text-xs text-[#556663] mt-1">Caches warm, fallback discipline activates, and SAIQ governance protects the decision path.</div>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            {[
              { name: 'EMBER', count: '29 mirrored observations', status: 'healthy', color: '#22c55e' },
              { name: 'WATTTIME MOER', count: '33 mirrored observations', status: 'healthy · 26s', color: '#22c55e' },
              { name: 'aqueduct', count: '1 mirrored observation', status: 'healthy · 96693s', color: '#22c55e' },
              { name: 'aware', count: '', status: 'mirrored fallback', color: '#d97706' },
              { name: 'nrel', count: '', status: 'mirrored fallback', color: '#d97706' },
            ].map((p) => (
              <div key={p.name} className="border border-[#1a2826] rounded-lg px-4 py-2.5 flex items-center justify-between">
                <div className="text-xs font-mono font-semibold text-[#e2ebe8]">{p.name}</div>
                <div className="text-xs font-mono" style={{ color: p.color }}>{p.status}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <div className="border border-[#1a2826] rounded-xl p-4 bg-[#131c1a] flex-1">
              <div className="text-xs font-mono text-[#556663] mb-2">Mirrored Caches → Control Node</div>
              <div className="text-xs text-[#8a9e9a] leading-relaxed">The system never fails open. It remains deterministic and auditable even when providers degrade.</div>
            </div>
            <div className="border border-[#22c55e]/20 rounded-xl p-3 text-xs text-[#22c55e]/80">
              SAIQ governance protects the decision path regardless of provider health.
            </div>
          </div>
        </div>
      </div>

      {/* Live Evidence */}
      <div className="border border-[#1a2826] rounded-2xl bg-[#0d1412] overflow-hidden my-8">
        <div className="px-6 pt-5 pb-4 border-b border-[#1a2826]">
          <div className="text-lg font-bold text-[#e2ebe8]">Real execution authority. Real trace. Real replay.</div>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border border-[#1a2826] rounded-xl p-4">
            <div className="text-xs font-mono text-[#556663] uppercase tracking-wider mb-3">Latency Window</div>
            <div className="space-y-1.5 font-mono text-xs">
              <div className="flex justify-between"><span className="text-[#8a9e9a]">decision samples</span><span className="text-[#e2ebe8]">250</span></div>
              <div className="flex justify-between"><span className="text-[#8a9e9a]">p95 total</span><span className="text-[#22c55e] font-bold">77 ms</span></div>
              <div className="flex justify-between"><span className="text-[#8a9e9a]">p95 compute</span><span className="text-[#22c55e] font-bold">59 ms</span></div>
              <div className="flex justify-between"><span className="text-[#8a9e9a]">budget</span><span className="text-[#e2ebe8]">100 / 50 ms</span></div>
            </div>
          </div>
          <div className="border border-[#1a2826] rounded-xl p-4">
            <div className="text-xs font-mono text-[#556663] uppercase tracking-wider mb-3">Recent Decisions</div>
            <div className="space-y-2 font-mono text-xs">
              <div className="text-[#8a9e9a]"><span className="text-[#22c55e]">run now</span> | us-west-2 | Allow | frame 080277b0</div>
              <div className="text-[#8a9e9a]"><span className="text-[#22c55e]">run now</span> | us-west-2 | Allow | frame 452c11fd</div>
            </div>
          </div>
          <div className="border border-[#1a2826] rounded-xl p-4">
            <div className="text-xs font-mono text-[#556663] uppercase tracking-wider mb-3">Verified Datasets Manifest</div>
            <div className="font-mono text-xs text-[#8a9e9a] space-y-1">
              <div>aqueduct_2_1: manifest dad82073...f226</div>
              <div>aware_2_0: manifest 91235ec0...131e</div>
              <div>wwf_water_risk_filter_v1</div>
            </div>
          </div>
          <div className="border border-[#22c55e]/20 rounded-xl p-4">
            <div className="text-xs font-mono text-[#556663] uppercase tracking-wider mb-3">Trace Ledger</div>
            <div className="font-mono text-xs space-y-1">
              <div className="text-[#e2ebe8]">traceAvailable <span className="text-[#22c55e]">yes</span></div>
              <div className="text-[#e2ebe8]">replay consistency <span className="text-[#22c55e]">consistent</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Decision Pipeline */}
      <h2>Decision Pipeline</h2>
      <p>Every authorization request flows through the same deterministic pipeline. No branching on provider availability — degraded providers are handled transparently by the cache hierarchy before the hot path is reached.</p>

      <div className="border border-[#1a2826] rounded-xl p-5 bg-[#0d1412] my-6 font-mono text-xs">
        <div className="text-[#556663] mb-4 text-xs uppercase tracking-wider">Hot Path — p95 target: 77ms</div>
        {[
          { step: '01', label: 'Authorization Request', detail: 'workloadId, regions[], deadline, policyCtx', ms: '0ms' },
          { step: '02', label: 'Policy Pre-check', detail: 'Policy → guardrail scan → exit early on hard deny', ms: '2ms' },
          { step: '03', label: 'Signal Resolution', detail: 'L1 cache → Redis → Last-Known-Good (no provider call)', ms: '40ms' },
          { step: '04', label: 'SAIQ Arbitration', detail: 'Signal → Arbitration → Integrity → Quality', ms: '20ms' },
          { step: '05', label: 'Action Selection', detail: 'run_now | reroute | delay | throttle | deny', ms: '5ms' },
          { step: '06', label: 'Proof Assembly', detail: 'proofHash = SHA-256(canonicalEnvelope)', ms: '5ms' },
          { step: '07', label: 'Response + Async Write', detail: 'CiResponseV2 returned · DecisionLog written fire-and-forget', ms: '5ms' },
        ].map((row, i, arr) => (
          <div key={row.step} className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-0">
              <div className="w-7 h-7 rounded-full bg-[#131c1a] border border-[#1a2826] flex items-center justify-center text-[#556663] text-xs flex-shrink-0">{row.step}</div>
              {i < arr.length - 1 && <div className="w-px h-5 bg-[#1a2826]" />}
            </div>
            <div className="pt-1 pb-4">
              <div className="text-[#e2ebe8] font-medium text-xs">{row.label}</div>
              <div className="text-[#556663] text-xs mt-0.5">{row.detail}</div>
            </div>
            <div className="ml-auto text-[#22c55e] text-xs pt-1 flex-shrink-0">{row.ms}</div>
          </div>
        ))}
      </div>

      {/* Signal Tier Architecture */}
      <h2>Signal Tier Architecture</h2>
      <p>Providers are ranked by trust tier. The routing engine selects the lowest defensible signal — never an average. Every tier has a defined fallback.</p>

      <div className="space-y-3 my-6">
        {[
          {
            tier: 'Tier 1 — Primary Routing Signal',
            color: '#22c55e',
            providers: [
              { name: 'WattTime MOER', type: 'Marginal Operating Emissions Rate', regions: 'US regions (CAISO_NORTH free)', note: 'Primary causal routing truth for marginal scheduling' },
              { name: 'EIA-930', type: 'Grid telemetry — BALANCE / INTERCHANGE / SUBREGION', regions: 'US balancing authorities', note: 'demandRampPct · carbonSpikeProbability · curtailmentProbability · importCarbonLeakageScore' },
            ],
          },
          {
            tier: 'Tier 2 — Flow-Traced Enrichment (Optional)',
            color: '#3b82f6',
            providers: [
              { name: 'Electricity Maps', type: 'Flow-traced carbon intensity', regions: 'Global (per API key)', note: 'Cross-border electricity flow accounting — most precise for EU regions' },
            ],
          },
          {
            tier: 'Tier 3 — Structural Validation Only',
            color: '#8b5cf6',
            providers: [
              { name: 'Ember', type: 'Monthly/yearly baselines, generation mix', regions: 'Global', note: 'Never used as routing signal. Confidence dampening + RegionStructuralProfile only.' },
            ],
          },
          {
            tier: 'Tier 4 — Water Constraints',
            color: '#d97706',
            providers: [
              { name: 'Aqueduct 2.1 / AWARE 2.0', type: 'Basin-level water stress index', regions: 'Global', note: 'Status: degraded (27hr stale). Facility overlay from WWF Water Risk Filter.' },
            ],
          },
        ].map((tier) => (
          <div key={tier.tier} className="border border-[#1a2826] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0d1412] border-b border-[#1a2826] flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: tier.color }} />
              <span className="text-xs font-mono font-semibold" style={{ color: tier.color }}>{tier.tier}</span>
            </div>
            <div className="divide-y divide-[#1a2826]/50">
              {tier.providers.map((p) => (
                <div key={p.name} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-1">
                  <div>
                    <div className="text-sm font-medium text-[#e2ebe8]">{p.name}</div>
                    <div className="text-xs text-[#556663] mt-0.5">{p.regions}</div>
                  </div>
                  <div className="text-xs text-[#8a9e9a]">{p.type}</div>
                  <div className="text-xs text-[#556663] italic">{p.note}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Cache Architecture */}
      <h2>Cache Architecture</h2>
      <p>All provider data flows through the cache hierarchy. The hot path never calls external providers directly.</p>

      <div className="border border-[#1a2826] rounded-xl p-5 bg-[#0d1412] my-6 font-mono text-xs">
        <div className="text-[#556663] mb-4 uppercase tracking-wider">Data Flow</div>
        <div className="space-y-2">
          {[
            { from: 'Provider APIs', to: 'Background Worker', note: '15s–15min polling interval per provider', dir: '→' },
            { from: 'Background Worker', to: 'Redis Cache (L2)', note: 'TTL: 15min live / 1hr degraded / 6hr fallback', dir: '→' },
            { from: 'Redis Cache (L2)', to: 'L1 In-Process Cache', note: 'TTL: 5 seconds — eliminates Redis round-trip', dir: '→' },
            { from: 'L1 Cache', to: 'Hot Path (SAIQ)', note: 'Signal resolution budget: 40ms', dir: '→' },
          ].map((row) => (
            <div key={row.from} className="flex items-center gap-3">
              <span className="text-[#e2ebe8] w-44 flex-shrink-0">{row.from}</span>
              <span className="text-[#22c55e]">{row.dir}</span>
              <span className="text-[#e2ebe8] w-44 flex-shrink-0">{row.to}</span>
              <span className="text-[#556663]">{row.note}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-[#1a2826] text-[#556663]">
          Cache miss path: Background Worker → Redis miss → Last-Known-Good (LKG) applied → <span className="text-amber-400">syntheticFlag=true · qualityTier=LOW · lease=30min</span>
        </div>
      </div>

      {/* SAIQ Framework */}
      <h2>SAIQ Governance Framework</h2>
      <p>The four-layer evaluation model applied to every authorization request. Layers execute sequentially within the latency budget.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-6">
        {[
          { letter: 'S', name: 'Signal', budget: '40ms', color: '#22c55e', desc: 'Resolve authoritative signal value from provider hierarchy. Apply Lowest Defensible Signal doctrine. No provider averaging. Return with source, freshness, estimated/synthetic flags.' },
          { letter: 'A', name: 'Arbitration', budget: '20ms', color: '#3b82f6', desc: 'Multi-objective scoring against evaluation order: Policy → Water → SLA → Carbon → Cost. Exit early on hard policy or water violation. Return action candidate with reasoning chain.' },
          { letter: 'I', name: 'Integrity', budget: '5ms', color: '#8b5cf6', desc: 'Provenance validation. Provider disagreement detection and classification (none/low/medium/high/severe). Fallback documentation. Policy trace assembly.' },
          { letter: 'Q', name: 'Quality', budget: '5ms + 20ms buffer', color: '#d97706', desc: 'Confidence scoring. Quality tier assignment (HIGH/MEDIUM/LOW). Governance lease calculation. Operating mode determination (NORMAL/STRESS/CRISIS). proofHash computation.' },
        ].map((layer) => (
          <div key={layer.letter} className="border border-[#1a2826] rounded-xl p-4 bg-[#0d1412]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-sm" style={{ background: `${layer.color}15`, color: layer.color, border: `1px solid ${layer.color}30` }}>
                {layer.letter}
              </div>
              <div>
                <div className="text-sm font-semibold text-[#e2ebe8]">{layer.name}</div>
                <div className="text-xs font-mono" style={{ color: layer.color }}>{layer.budget}</div>
              </div>
            </div>
            <p className="text-xs text-[#8a9e9a] leading-relaxed">{layer.desc}</p>
          </div>
        ))}
      </div>

      {/* Fallback Chain */}
      <h2>Five-Level Fallback Chain</h2>
      <p>Degradation is transparent and documented. Every fallback level sets the appropriate flags in the decision output.</p>

      <div className="border border-[#1a2826] rounded-xl overflow-hidden my-6">
        <table>
          <thead>
            <tr>
              <th>Level</th>
              <th>Source</th>
              <th>Condition</th>
              <th>Flags Set</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['1', 'Live provider data', 'Normal operation — fresh signal', 'estimatedFlag per provider · HIGH tier'],
              ['2', 'Warm cache (15min)', 'Background worker recent success', 'fallbackUsed=false · MEDIUM tier possible'],
              ['3', 'Warm cache (1–6hr)', 'Provider degraded but not dead', 'fallbackUsed=true · LOW tier · leaseExpiry=30min'],
              ['4', 'Ember structural baseline', 'All real-time providers failed', 'syntheticFlag=true · LOW · Ember-sourced note in policyTrace'],
              ['5', 'Static 450 gCO₂/kWh', 'All data paths failed', 'syntheticFlag=true · LOW · operatingMode=CRISIS'],
            ].map(([level, source, condition, flags]) => (
              <tr key={level as string}>
                <td><span className={`font-mono text-xs font-bold ${level === '1' ? 'text-[#22c55e]' : level === '2' ? 'text-[#3b82f6]' : level === '3' ? 'text-amber-400' : level === '4' ? 'text-orange-400' : 'text-red-400'}`}>L{level}</span></td>
                <td className="text-sm font-medium text-[#e2ebe8]">{source}</td>
                <td className="text-xs text-[#8a9e9a]">{condition}</td>
                <td className="text-xs font-mono text-[#556663]">{flags}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Enforcement Path */}
      <h2>Enforcement Path</h2>
      <p>CO₂Router integrates at the execution boundary — the moment before compute resources are provisioned. Two primary integration patterns:</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
        <div className="border border-[#1a2826] rounded-xl p-4 bg-[#0d1412]">
          <div className="text-xs font-mono text-[#22c55e] uppercase tracking-wider mb-3">CI/CD Integration</div>
          <pre className="text-xs !bg-transparent !border-0 !p-0">{`# .github/workflows/build.yml
- name: Authorize execution
  run: |
    DECISION=$(curl -s \\
      -H "Authorization: Bearer $CO2_TOKEN" \\
      -d '{"workloadId":"'$GITHUB_RUN_ID'",
           "regions":["us-east-1","eu-west-1"],
           "deadline":"'$DEADLINE'"}' \\
      $CO2_ROUTER_URL/api/v1/authorize)
    
    ACTION=$(echo $DECISION | jq -r '.decision')
    
    if [ "$ACTION" = "deny" ]; then
      echo "::error::Execution denied by CO₂Router"
      exit 1
    fi
    
    echo "Authorized: $ACTION"
    echo "Region: $(echo $DECISION | jq -r '.selectedRegion')"
    echo "Carbon: $(echo $DECISION | jq -r '.carbonIntensity')g/kWh"`}
          </pre>
        </div>
        <div className="border border-[#1a2826] rounded-xl p-4 bg-[#0d1412]">
          <div className="text-xs font-mono text-[#22c55e] uppercase tracking-wider mb-3">Kubernetes Admission Webhook</div>
          <pre className="text-xs !bg-transparent !border-0 !p-0">{`# ValidatingWebhookConfiguration
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: co2router-admission
webhooks:
- name: authorize.co2router.io
  rules:
  - apiGroups: ["batch"]
    resources: ["jobs"]
    operations: ["CREATE"]
  clientConfig:
    service:
      name: co2router-webhook
      namespace: co2router-system
      path: /admission/authorize
  failurePolicy: Fail  # Hard stop on deny`}
          </pre>
        </div>
      </div>

      {/* Region Coverage */}
      <h2>Initial Region Scope</h2>
      <div className="border border-[#1a2826] rounded-xl overflow-hidden my-4">
        <table>
          <thead>
            <tr>
              <th>Region</th>
              <th>Cloud Providers</th>
              <th>Primary Signal</th>
              <th>EIA-930 Coverage</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['us-east-1', 'AWS / GCP / Azure', 'WattTime (PJM)', 'Yes — PJM BA'],
              ['us-west-2', 'AWS / GCP / Azure', 'WattTime (CAISO_NORTH)', 'Yes — CAISO BA'],
              ['eu-west-1', 'AWS / GCP / Azure', 'Electricity Maps (IE)', 'No — Electricity Maps only'],
              ['eu-central-1', 'AWS / GCP / Azure', 'Electricity Maps (DE)', 'No — Electricity Maps only'],
              ['ap-southeast-1', 'AWS / GCP / Azure', 'Electricity Maps (SG)', 'No — Electricity Maps only'],
              ['ap-northeast-1', 'AWS / GCP / Azure', 'Electricity Maps (JP)', 'No — Electricity Maps only'],
            ].map(([region, providers, signal, eia]) => (
              <tr key={region as string}>
                <td><code className="text-xs text-[#22c55e]">{region}</code></td>
                <td className="text-xs">{providers}</td>
                <td className="text-xs text-[#8a9e9a]">{signal}</td>
                <td className={`text-xs font-mono ${(eia as string).startsWith('Yes') ? 'text-[#22c55e]' : 'text-[#556663]'}`}>{eia}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Data Model */}
      <h2>Core Data Model Relationships</h2>
      <pre>{`DecisionLog (append-only)
  ├── CarbonCommand (per-request, 22 required fields)
  │   └── CarbonLedgerEntry (audit-grade accounting)
  ├── GridSignalSnapshot[] (one per candidate region)
  │   └── ProviderSnapshot[] (one per active provider per region)
  ├── MultiSignalSnapshot (MSS — provenance summary)
  │   ├── carbonLineage: string[]
  │   └── waterLineage: string[]
  ├── DecisionTraceEnvelope (full canonical state)
  │   └── proofHash: SHA-256
  └── WaterBundle (nullable — facility data)
      ├── scenario: "current" | "2030" | "2050" | "2080"
      └── sources: Aqueduct21 | AWARE20 | WWFWaterRisk`}</pre>
    </DocLayout>
  )
}
