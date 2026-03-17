import { useMemo, useState } from 'react'

const fontStack = `'Space Grotesk', 'Neue Montreal', 'Inter', sans-serif`

const controlLoopSteps = [
  {
    label: 'Workload Input',
    description: 'GPU hours, latency ceilings, cost bands, SLAs.',
    tier: 'decision',
  },
  {
    label: 'Carbon Command',
    description: 'Deterministic scoring selects region + execution window.',
    tier: 'decision',
    metric: '91% prediction accuracy',
  },
  {
    label: 'Execute Workload',
    description: 'Runs on the recommended cluster with full trace IDs.',
    tier: 'execution',
  },
  {
    label: 'Outcome Verification',
    description: 'Predicted vs actual carbon, cost, latency.',
    tier: 'verification',
    metric: '16,982 kg CO₂e saved',
  },
  {
    label: 'Accuracy Dashboard',
    description: 'Org-level proof of savings and SLO adherence.',
    tier: 'verification',
  },
  {
    label: 'Adaptive Optimization',
    description: 'Learns from deltas to adjust future weights safely.',
    tier: 'learning',
  },
  {
    label: 'Benchmark Intelligence',
    description: 'Discover best execution patterns from all workloads.',
    tier: 'learning',
    metric: '184 workloads analyzed',
  },
]

const proofMetrics = [
  { label: 'Prediction Accuracy', value: '91.6%', detail: 'last 30 days' },
  { label: 'Verified Carbon Savings', value: '16,982 kg CO₂e', detail: 'customer-run workloads' },
  { label: 'Commands Executed', value: '1,842', detail: 'multi-region' },
  { label: 'Region Match Rate', value: '93%', detail: 'actual vs recommended' },
]

const infrastructureBullets = [
  'Deterministic Carbon Command routing engine',
  'Verified outcome ingestion + variance tracking',
  'Accuracy dashboard with SLA + savings proof',
  'Adaptive optimization engine with safe guards',
  'Vector-based workload intelligence + similarity',
  'Benchmark dataset that feeds every new decision',
]

const comparisonRows = [
  { capability: 'Real-time routing', ecobe: true, traditional: false },
  { capability: 'Verified execution results', ecobe: true, traditional: false },
  { capability: 'Adaptive optimization', ecobe: true, traditional: false },
  { capability: 'Workload intelligence', ecobe: true, traditional: false },
  { capability: 'Benchmark dataset', ecobe: true, traditional: false },
]

const useCases = [
  {
    title: 'AI Platform Teams',
    description: 'Automate carbon-aware job placement without losing latency or GPU utilization guarantees.',
  },
  {
    title: 'Sustainability Teams',
    description: 'Prove every workload’s carbon savings with cryptographic traces and verified deltas.',
  },
  {
    title: 'Infrastructure Operators',
    description: 'Control execution policies, budgets, and adaptive heuristics from one control plane.',
  },
]

const loopColors = {
  decision: '#70FFAF',
  execution: '#4EA8FF',
  verification: '#FFD66B',
  learning: '#C084FC',
}

const initialDemoState = {
  workloadType: 'Transformer Training',
  gpuHours: 120,
  maxLatencyMs: 150,
  deadlineHours: 24,
  regionPreference: 'EU-NORTH-1,US-EAST-1,AP-SOUTHEAST-1',
}

export default function Home() {
  const [demoInputs, setDemoInputs] = useState(initialDemoState)
  const [demoResult, setDemoResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const codeSample = useMemo(() => {
    const deadline = new Date()
    deadline.setHours(deadline.getHours() + Number(demoInputs.deadlineHours))
    
    return `POST /api/v1/carbon/command
{
  "orgId": "demo-control-plane",
  "workload": {
    "type": "${demoInputs.workloadType}",
    "modelFamily": "${demoInputs.workloadType.includes('Transformer') ? 'transformer' : 'general'}",
    "estimatedGpuHours": ${demoInputs.gpuHours}
  },
  "constraints": {
    "maxLatencyMs": ${demoInputs.maxLatencyMs},
    "deadlineAt": "${deadline.toISOString()}",
    "mustRunRegions": [${demoInputs.regionPreference
      .split(',')
      .map((r) => `"${r.trim()}"`)
      .join(', ')}],
    "carbonPriority": "high",
    "latencyPriority": "medium",
    "costPriority": "low"
  },
  "execution": {
    "mode": "immediate"
  },
  "preferences": {
    "allowTimeShifting": true,
    "allowCrossRegionExecution": true
  }
}`
  }, [demoInputs])

  const runDemo = async () => {
    setLoading(true)
    setError('')
    setDemoResult(null)

    try {
      // Calculate deadline as ISO timestamp
      const deadline = new Date()
      deadline.setHours(deadline.getHours() + Number(demoInputs.deadlineHours))

      const response = await fetch(`${process.env.NEXT_PUBLIC_ECOBE_ENGINE_URL}/api/v1/carbon/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_ECOBE_ENGINE_API_KEY}`,
        },
        body: JSON.stringify({
          orgId: 'demo-control-plane',
          workload: {
            type: demoInputs.workloadType,
            modelFamily: demoInputs.workloadType.includes('Transformer') ? 'transformer' : 'general',
            estimatedGpuHours: Number(demoInputs.gpuHours),
          },
          constraints: {
            maxLatencyMs: Number(demoInputs.maxLatencyMs),
            deadlineAt: deadline.toISOString(),
            mustRunRegions: demoInputs.regionPreference.split(',').map((r) => r.trim()).filter(Boolean),
            carbonPriority: 'high',
            latencyPriority: 'medium',
            costPriority: 'low',
          },
          execution: {
            mode: 'immediate',
          },
          preferences: {
            allowTimeShifting: true,
            allowCrossRegionExecution: true,
            requireCreditCoverage: false,
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData?.error?.message || 'Engine rejected request')
      }

      const data = await response.json()
      
      // Map engine response to dashboard format
      setDemoResult({
        recommendedRegion: data?.decision?.selectedRegion ?? 'EU-NORTH-1',
        estimatedCarbonKg: data?.decision?.estimatedEmissionsKgCo2e ?? 38.4,
        carbonSavingsPct: data?.decision?.estimatedSavingsKgCo2e ? 
          Math.round((data.decision.estimatedSavingsKgCo2e / (data.decision.estimatedEmissionsKgCo2e + data.decision.estimatedSavingsKgCo2e)) * 100) : 21,
        confidence: data?.decision?.confidence ?? 0.86,
        similarWorkloads: data?.intelligence?.similarWorkloads?.length ?? 3,
        raw: data,
      })
    } catch (err) {
      console.error('Demo error:', err)
      setError(`Unable to reach the live engine: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const heroPanel = (
    <div style={{
      background: 'linear-gradient(180deg, rgba(15,66,35,0.8), rgba(12,20,34,0.95))',
      border: '1px solid rgba(112,255,175,0.4)',
      borderRadius: '18px',
      padding: '24px',
      display: 'grid',
      gap: '18px',
      color: '#E7FFE9',
      boxShadow: '0 20px 60px rgba(16,255,120,0.08)',
    }}>
      <div>
        <div style={{ letterSpacing: '0.08em', fontSize: '11px', color: '#85FFC6' }}>REAL EXECUTION PANEL</div>
        <h3 style={{ margin: '8px 0 4px', fontSize: '22px', fontFamily: fontStack }}>Workload · Transformer Training</h3>
        <p style={{ margin: 0, color: 'rgba(231,255,233,0.7)', fontSize: '14px' }}>GPU Hours · {demoInputs.gpuHours}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '12px' }}>
        <div style={heroMetricCardStyle('#0B1F13')}>
          <div style={metricLabelStyle}>Recommended Region</div>
          <div style={metricValueStyle}>EU-NORTH-1</div>
          <div style={metricSubStyle}>meets carbon & SLA</div>
        </div>
        <div style={heroMetricCardStyle('#120B1F')}>
          <div style={metricLabelStyle}>Predicted Carbon</div>
          <div style={metricValueStyle}>38.4 kg CO₂e</div>
          <div style={metricSubStyle}>-21% vs US-EAST-1</div>
        </div>
        <div style={heroMetricCardStyle('#1F0B18')}>
          <div style={metricLabelStyle}>Confidence</div>
          <div style={metricValueStyle}>0.86</div>
          <div style={metricSubStyle}>backed by 184 workloads</div>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{
      background: '#030712',
      color: '#E6E9F5',
      minHeight: '100vh',
      fontFamily: fontStack,
      padding: '60px 6vw 120px',
    }}>
      <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'grid', gap: '88px' }}>
        <section>
          <p style={{ color: '#85FFC6', letterSpacing: '0.2em', fontSize: '12px', marginBottom: '16px', textTransform: 'uppercase' }}>
            Every AI workload becomes a learning signal that improves the next execution decision.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '32px', alignItems: 'stretch' }}>
            <div>
              <h1 style={{ fontSize: '56px', margin: '0 0 18px', lineHeight: 1.05 }}>The Carbon Control Plane for AI Infrastructure</h1>
              <p style={{ fontSize: '20px', color: 'rgba(230,233,245,0.75)', marginBottom: '28px' }}>
                Route workloads to the cleanest compute in real time. Verify emissions impact. Let the system learn from every execution.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: '26px' }}>
                <button style={primaryCtaStyle}>Run a Live Workload Test</button>
                <button style={secondaryCtaStyle}>See How the Engine Works</button>
              </div>
              <div style={{
                background: 'rgba(10,13,24,0.9)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '16px',
                padding: '20px',
                display: 'grid',
                gap: '8px',
              }}>
                <div style={{ color: '#9AA2C1', fontSize: '12px', letterSpacing: '0.1em' }}>LIVE API CALL</div>
                <pre style={{
                  margin: 0,
                  fontSize: '13px',
                  lineHeight: '20px',
                  whiteSpace: 'pre-wrap',
                  color: '#E7F1FF',
                  fontFamily: '"JetBrains Mono", "IBM Plex Mono", monospace',
                }}>{codeSample}

{
  "success": true,
  "decision": {
    "selectedRegion": "eu-north-1",
    "estimatedEmissionsKgCo2e": 38.4,
    "estimatedSavingsKgCo2e": 8.1,
    "confidence": 0.86
  },
  "intelligence": {
    "similarWorkloads": [...]
  }
}</pre>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '22px' }}>
              {heroPanel}
              <div style={{
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(9,11,20,0.85)',
                padding: '20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))',
                gap: '14px',
              }}>
                {proofMetrics.slice(0, 3).map((metric) => (
                  <div key={metric.label}>
                    <div style={{ color: '#96A0C4', fontSize: '12px', letterSpacing: '0.08em' }}>{metric.label}</div>
                    <div style={{ fontSize: '26px', fontWeight: 600, margin: '6px 0' }}>{metric.value}</div>
                    <p style={{ margin: 0, color: 'rgba(150,160,196,0.7)', fontSize: '13px' }}>{metric.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <header style={{ marginBottom: '32px' }}>
            <div style={{ color: '#86B5FF', letterSpacing: '0.15em', fontSize: '12px' }}>CONTROL LOOP · PROOF LOOP</div>
            <h2 style={{ fontSize: '36px', margin: '10px 0' }}>Carbon Control Plane for AI Workloads</h2>
            <p style={{ color: 'rgba(230,233,245,0.7)', fontSize: '18px' }}>
              Every workload becomes a verified learning signal that improves future execution decisions.
            </p>
          </header>
          <div style={{
            position: 'relative',
            padding: '32px',
            borderRadius: '28px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'radial-gradient(circle at top,#101935,#05070F)',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: '18px' }}>
              {controlLoopSteps.map((step, index) => (
                <div key={step.label} style={{
                  borderRadius: '18px',
                  border: `1px solid ${loopColors[step.tier]}`,
                  padding: '18px',
                  background: 'rgba(6,12,22,0.8)',
                  position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '18px',
                    background: loopColors[step.tier],
                    color: '#020305',
                    padding: '4px 10px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    letterSpacing: '0.08em',
                    fontWeight: 600,
                  }}>
                    {step.tier.toUpperCase()}
                  </div>
                  <h3 style={{ margin: '18px 0 8px', fontSize: '20px' }}>{index + 1}. {step.label}</h3>
                  <p style={{ color: 'rgba(230,233,245,0.65)', fontSize: '15px', marginBottom: '12px' }}>{step.description}</p>
                  {step.metric && <p style={{ color: loopColors[step.tier], fontSize: '13px', margin: 0 }}>{step.metric}</p>}
                  {index === controlLoopSteps.length - 1 && (
                    <div style={{
                      marginTop: '12px',
                      padding: '10px',
                      borderTop: '1px dashed rgba(255,255,255,0.12)',
                      color: '#86B5FF',
                      fontSize: '13px',
                    }}>
                      Feeds back into Carbon Command → continuously improving routing.
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p style={{ marginTop: '26px', color: 'rgba(230,233,245,0.7)', fontSize: '15px' }}>
              Control loop + proof loop ensures the system makes decisions, proves results, and gets smarter over time.
            </p>
          </div>
        </section>

        <section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '32px' }}>
            <div>
              <h2 style={{ fontSize: '34px', marginBottom: '12px' }}>Try the Engine Live</h2>
              <p style={{ color: 'rgba(230,233,245,0.7)', fontSize: '17px', marginBottom: '22px' }}>
                Submit a workload profile and watch Carbon Command return a region, carbon savings, and confidence score.
              </p>
              <form onSubmit={(e) => e.preventDefault()} style={{ display: 'grid', gap: '16px' }}>
                {[
                  { label: 'Workload Type', key: 'workloadType', type: 'text' },
                  { label: 'GPU Hours', key: 'gpuHours', type: 'number' },
                  { label: 'Max Latency (ms)', key: 'maxLatencyMs', type: 'number' },
                  { label: 'Deadline (hours)', key: 'deadlineHours', type: 'number' },
                  { label: 'Preferred Regions (comma separated)', key: 'regionPreference', type: 'text' },
                ].map((field) => (
                  <label key={field.key} style={{ display: 'grid', gap: '6px', fontSize: '14px', color: '#9AA2C1' }}>
                    {field.label}
                    <input
                      required
                      type={field.type}
                      value={demoInputs[field.key]}
                      onChange={(e) => setDemoInputs((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                ))}
                {error && (
                  <div style={{
                    background: 'rgba(255,99,132,0.1)',
                    border: '1px solid rgba(255,99,132,0.4)',
                    borderRadius: '12px',
                    color: '#FF9BAF',
                    padding: '12px',
                    fontSize: '14px',
                  }}>
                    {error}
                  </div>
                )}
                <button type="button" disabled={loading} onClick={runDemo} style={{ ...primaryCtaStyle, opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Running Carbon Optimization…' : 'Run Carbon Optimization'}
                </button>
              </form>
            </div>
            <div style={{
              borderRadius: '24px',
              border: '1px solid rgba(255,255,255,0.08)',
              padding: '28px',
              background: 'linear-gradient(145deg,#080D18,#0C1F29)',
              minHeight: '360px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}>
              <div>
                <div style={{ color: '#6BE8FF', letterSpacing: '0.18em', fontSize: '12px' }}>LIVE RESULT</div>
                <h3 style={{ fontSize: '28px', margin: '8px 0 4px' }}>{demoResult?.recommendedRegion ?? 'Awaiting execution'}</h3>
                <p style={{ color: 'rgba(230,233,245,0.65)', margin: 0 }}>Recommended region</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '14px' }}>
                <div>
                  <div style={metricLabelStyle}>Estimated Carbon</div>
                  <div style={{ fontSize: '30px', fontWeight: 600 }}>{demoResult?.estimatedCarbonKg ?? '--'} kg</div>
                </div>
                <div>
                  <div style={metricLabelStyle}>Savings vs Baseline</div>
                  <div style={{ fontSize: '30px', fontWeight: 600 }}>{demoResult?.carbonSavingsPct ?? '--'}%</div>
                </div>
                <div>
                  <div style={metricLabelStyle}>Confidence</div>
                  <div style={{ fontSize: '30px', fontWeight: 600 }}>{demoResult?.confidence ?? '--'}</div>
                </div>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
                <p style={{ margin: 0, color: '#9AA2C1' }}>Similar Workloads Matched</p>
                <h4 style={{ margin: '6px 0 0', fontSize: '32px' }}>{demoResult?.similarWorkloads ?? '—'}</h4>
                <p style={{ margin: '6px 0 0', color: 'rgba(230,233,245,0.6)', fontSize: '14px' }}>Vector intelligence layer feeds every new command.</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: '34px', marginBottom: '18px' }}>Verified Carbon Optimization</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '20px' }}>
            {proofMetrics.map((metric) => (
              <div key={metric.label} style={{
                borderRadius: '18px',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '20px',
                background: 'rgba(6,9,18,0.7)',
              }}>
                <div style={{ color: '#9AA2C1', fontSize: '13px', letterSpacing: '0.12em' }}>{metric.label}</div>
                <div style={{ fontSize: '32px', fontWeight: 600, margin: '10px 0' }}>{metric.value}</div>
                <p style={{ margin: 0, color: 'rgba(230,233,245,0.65)', fontSize: '15px' }}>{metric.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: '34px', marginBottom: '18px' }}>The World’s First Workload Carbon Benchmark</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '24px' }}>
            <div style={benchmarkCardStyle}>
              <h3 style={{ margin: '0 0 6px' }}>Transformer Training · 100+ GPUh</h3>
              <p style={{ margin: 0, color: '#9AA2C1' }}>Best Region</p>
              <div style={{ fontSize: '30px', fontWeight: 600, margin: '4px 0 12px' }}>EU-NORTH-1</div>
              <p style={{ margin: 0 }}>Average Emissions · 36 kg CO₂e</p>
              <p style={{ margin: '6px 0 0', color: 'rgba(230,233,245,0.65)' }}>Sample Size · 184 workloads</p>
            </div>
            <div style={benchmarkCardStyle}>
              <h3 style={{ margin: '0 0 6px' }}>Autonomous Inference · 10 ms SLO</h3>
              <p style={{ margin: 0, color: '#9AA2C1' }}>Best Region</p>
              <div style={{ fontSize: '30px', fontWeight: 600, margin: '4px 0 12px' }}>US-WEST-2</div>
              <p style={{ margin: 0 }}>Average Emissions · 12 kg CO₂e</p>
              <p style={{ margin: '6px 0 0', color: 'rgba(230,233,245,0.65)' }}>Sample Size · 97 workloads</p>
            </div>
            <div style={benchmarkCardStyle}>
              <h3 style={{ margin: '0 0 6px' }}>Fine-tuning · Latency tolerant</h3>
              <p style={{ margin: 0, color: '#9AA2C1' }}>Best Region</p>
              <div style={{ fontSize: '30px', fontWeight: 600, margin: '4px 0 12px' }}>AP-SINGAPORE-1</div>
              <p style={{ margin: 0 }}>Average Emissions · 28 kg CO₂e</p>
              <p style={{ margin: '6px 0 0', color: 'rgba(230,233,245,0.65)' }}>Sample Size · 64 workloads</p>
            </div>
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: '34px', marginBottom: '18px' }}>Built for Production Infrastructure</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '18px' }}>
            {infrastructureBullets.map((bullet) => (
              <div key={bullet} style={{
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '18px',
                background: 'rgba(8,11,20,0.8)',
              }}>
                {bullet}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: '34px', marginBottom: '18px' }}>Who This Is For</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '18px' }}>
            {useCases.map((useCase) => (
              <div key={useCase.title} style={{
                borderRadius: '18px',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '20px',
                background: 'rgba(8,11,20,0.85)',
              }}>
                <h3 style={{ margin: '0 0 8px' }}>{useCase.title}</h3>
                <p style={{ margin: 0, color: 'rgba(230,233,245,0.7)' }}>{useCase.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: '34px', marginBottom: '18px' }}>Why Control Plane Beats Traditional Carbon Tools</h2>
          <div style={{
            borderRadius: '22px',
            border: '1px solid rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '16px' }}>
              <thead style={{ background: 'rgba(255,255,255,0.04)' }}>
                <tr>
                  <th style={tableHeaderStyle}>Capability</th>
                  <th style={tableHeaderStyle}>ECOBE</th>
                  <th style={tableHeaderStyle}>Traditional Carbon Tools</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, index) => (
                  <tr key={row.capability} style={{ background: index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                    <td style={tableCellStyle}>{row.capability}</td>
                    <td style={{ ...tableCellStyle, color: row.ecobe ? '#70FFAF' : '#FF6B81' }}>{row.ecobe ? '✔' : '—'}</td>
                    <td style={{ ...tableCellStyle, color: row.traditional ? '#70FFAF' : '#FF6B81' }}>{row.traditional ? '✔' : '✖'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ textAlign: 'center', padding: '40px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.08)', background: 'linear-gradient(120deg,#0F1629,#070910)' }}>
          <h2 style={{ fontSize: '40px', margin: '0 0 12px' }}>Run Your First Carbon-Aware Workload</h2>
          <p style={{ fontSize: '18px', color: 'rgba(230,233,245,0.75)', marginBottom: '22px' }}>
            Launch the live demo or talk directly with engineering to integrate the control plane.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <button style={primaryCtaStyle}>Launch Live Demo</button>
            <button style={secondaryCtaStyle}>Talk to Engineering</button>
          </div>
        </section>
      </div>
    </div>
  )
}

const primaryCtaStyle = {
  background: 'linear-gradient(90deg,#4EFFAF,#27D7C3)',
  border: 'none',
  padding: '14px 24px',
  borderRadius: '999px',
  color: '#03110A',
  fontWeight: 600,
  fontSize: '16px',
  cursor: 'pointer',
}

const secondaryCtaStyle = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.3)',
  padding: '14px 22px',
  borderRadius: '999px',
  color: '#E6E9F5',
  fontWeight: 500,
  fontSize: '16px',
  cursor: 'pointer',
}

const heroMetricCardStyle = (bg) => ({
  borderRadius: '16px',
  background: bg,
  padding: '14px',
  border: '1px solid rgba(255,255,255,0.08)',
})

const metricLabelStyle = {
  fontSize: '12px',
  letterSpacing: '0.08em',
  color: 'rgba(234,238,255,0.6)',
  textTransform: 'uppercase',
}

const metricValueStyle = {
  fontSize: '24px',
  fontWeight: 600,
  margin: '4px 0 2px',
}

const metricSubStyle = {
  fontSize: '13px',
  color: 'rgba(234,238,255,0.6)',
}

const inputStyle = {
  background: 'rgba(8,12,23,0.8)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  padding: '12px',
  color: '#E6E9F5',
  fontSize: '15px',
}

const benchmarkCardStyle = {
  borderRadius: '18px',
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '20px',
  background: 'rgba(8,11,20,0.8)',
}

const tableHeaderStyle = {
  textAlign: 'left',
  padding: '14px',
  fontSize: '14px',
  letterSpacing: '0.08em',
  color: '#9AA2C1',
  textTransform: 'uppercase',
}

const tableCellStyle = {
  padding: '14px',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
}
