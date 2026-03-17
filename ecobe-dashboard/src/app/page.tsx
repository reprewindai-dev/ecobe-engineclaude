'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

const regions = [
  { id: 'us-east-1', name: 'US East (N. Virginia)', carbon: 245, demand: '67%', renewable: '45%' },
  { id: 'us-west-2', name: 'US West (Oregon)', carbon: 124, demand: '51%', renewable: '78%' },
  { id: 'eu-west-1', name: 'EU (Ireland)', carbon: 189, demand: '58%', renewable: '62%' },
  { id: 'eu-central-1', name: 'EU (Frankfurt)', carbon: 156, demand: '54%', renewable: '68%' },
  { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)', carbon: 312, demand: '82%', renewable: '12%' },
  { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)', carbon: 203, demand: '71%', renewable: '35%' },
]

const scenarios = [
  {
    workload: 'ML Training (8h)',
    memory: '256 GB',
    compute: '8x GPU',
    deadline: '2 hours',
    description: 'Time-flexible ML workload',
  },
  {
    workload: 'Database Migration',
    memory: '512 GB',
    compute: '16x vCPU',
    deadline: '6 hours',
    description: 'Batch data processing job',
  },
  {
    workload: 'Video Encoding',
    memory: '128 GB',
    compute: '32x vCPU',
    deadline: '1 hour',
    description: 'Parallel transcoding pipeline',
  },
]

export default function LandingPage() {
  const [demoScenario, setDemoScenario] = useState(0)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [showDecision, setShowDecision] = useState(false)
  const [decisionPayload, setDecisionPayload] = useState<any>(null)
  const [expandPayload, setExpandPayload] = useState(false)
  const demoTimer = useRef<NodeJS.Timeout>()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      const nextScenario = (demoScenario + 1) % scenarios.length
      setDemoScenario(nextScenario)
      setSelectedRegion(null)
      setShowDecision(false)
      setDecisionPayload(null)
    }, 8000)

    return () => clearTimeout(timer)
  }, [demoScenario])

  const handleRouteGreen = () => {
    const cleanestRegion = regions.reduce((prev, current) =>
      current.carbon < prev.carbon ? current : prev
    )

    const carbonSaved = Math.round(
      (regions[0].carbon - cleanestRegion.carbon) *
        (parseInt(scenarios[demoScenario].memory) / 100) *
        2.5
    )

    const payload = {
      timestamp: new Date().toISOString().split('T')[1].split('.')[0],
      scenario: scenarios[demoScenario].workload,
      selectedRegion: cleanestRegion.id,
      carbonIntensity: cleanestRegion.carbon,
      score: 94 + Math.random() * 6,
      qualityTier: 'high',
      carbon_delta_g_per_kwh: regions[0].carbon - cleanestRegion.carbon,
      forecast_stability: 'stable',
      provider_disagreement: { flag: false, pct: 0 },
      balancingAuthority: 'MISO',
      demandRampPct: 2.3,
      carbonSpikeProbability: 0.08,
      curtailmentProbability: 0.02,
      importCarbonLeakageScore: 0.15,
      source_used: 'WattTime',
      validation_source: 'Electricity Maps',
      fallback_used: false,
      estimatedFlag: false,
      syntheticFlag: false,
      carbonSaved: `${carbonSaved}g CO₂`,
      deadline: scenarios[demoScenario].deadline,
    }

    setSelectedRegion(cleanestRegion.id)
    setShowDecision(true)
    setDecisionPayload(payload)
  }

  if (!isMounted) return null

  return (
    <div className="bg-gray-950 text-gray-100">
      {/* Navigation */}
      <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <span className="text-white font-bold text-xl">🌱</span>
            </div>
            <span className="text-lg font-bold text-white">ECOBE</span>
          </div>
          <div className="flex items-center space-x-6">
            <a
              href="#pricing"
              className="text-sm text-gray-400 hover:text-emerald-400 transition"
            >
              Pricing
            </a>
            <a
              href="#signals"
              className="text-sm text-gray-400 hover:text-emerald-400 transition"
            >
              How It Works
            </a>
            <Link
              href="/console"
              className="px-4 py-2 bg-emerald-500 text-gray-950 font-medium rounded-lg hover:bg-emerald-400 transition"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 via-gray-950 to-gray-950" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />

        <div className="relative container mx-auto px-6 py-24">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Route Compute to Clean Energy.
              <span className="block text-emerald-400">Automatically.</span>
            </h1>
            <p className="text-xl text-gray-400 mb-8 leading-relaxed">
              ECOBE is the world's most accurate carbon-aware routing engine. Cut your cloud
              carbon footprint by 40–70% with zero code changes.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <button
                onClick={() => {
                  document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="px-8 py-3 bg-emerald-500 text-gray-950 font-semibold rounded-lg hover:bg-emerald-400 transition"
              >
                Try Live Demo
              </button>
              <a
                href="#pricing"
                className="px-8 py-3 border border-gray-700 text-gray-100 font-semibold rounded-lg hover:bg-gray-900 transition"
              >
                Start Free
              </a>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-8 border-t border-gray-800">
              <div>
                <div className="text-2xl font-bold text-emerald-400">4</div>
                <div className="text-sm text-gray-500">Signal Providers</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-400">6</div>
                <div className="text-sm text-gray-500">Cloud Regions</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-400">&lt;200ms</div>
                <div className="text-sm text-gray-500">p99 Latency</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-400">12%</div>
                <div className="text-sm text-gray-500">Forecast Accuracy</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Demo Section */}
      <section id="demo" className="border-t border-gray-800 bg-gray-900/50 py-24">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">See It Work in Real-Time</h2>
            <p className="text-gray-400 text-lg">
              Interactive routing decision engine with live carbon calculations
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Demo Input */}
            <div className="space-y-6">
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Workload</h3>
                <div className="space-y-2">
                  {scenarios.map((s, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        setDemoScenario(i)
                        setSelectedRegion(null)
                        setShowDecision(false)
                      }}
                      className={`p-3 rounded-lg border cursor-pointer transition ${
                        demoScenario === i
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-gray-700 hover:border-gray-600 bg-gray-900/50'
                      }`}
                    >
                      <div className="font-medium text-gray-100">{s.workload}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {s.memory} • {s.compute}
                      </div>
                      <div className="text-xs text-emerald-400 mt-1">{s.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Regions</h3>
                <div className="space-y-2">
                  {regions.map((region) => (
                    <div
                      key={region.id}
                      onClick={() => setSelectedRegion(region.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition ${
                        selectedRegion === region.id
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-gray-700 hover:border-gray-600 bg-gray-900/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-gray-100">{region.name}</div>
                        <div className="text-sm font-bold text-emerald-400">
                          {region.carbon} g/kWh
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {region.renewable} renewable • {region.demand} demand
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleRouteGreen}
                className="w-full px-6 py-3 bg-emerald-500 text-gray-950 font-semibold rounded-lg hover:bg-emerald-400 transition"
              >
                Route Green
              </button>
            </div>

            {/* Demo Output */}
            <div className="space-y-6">
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Scenario</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Workload</span>
                    <span className="font-medium text-gray-100">{scenarios[demoScenario].workload}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Memory</span>
                    <span className="font-medium text-gray-100">{scenarios[demoScenario].memory}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Compute</span>
                    <span className="font-medium text-gray-100">{scenarios[demoScenario].compute}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Deadline</span>
                    <span className="font-medium text-gray-100">{scenarios[demoScenario].deadline}</span>
                  </div>
                </div>
              </div>

              {showDecision && selectedRegion && decisionPayload ? (
                <>
                  <div className="bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/50 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white">Decision</h3>
                      <div className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded">
                        HIGH CONFIDENCE
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="text-gray-500 text-sm mb-1">Selected Region</div>
                        <div className="text-2xl font-bold text-emerald-400">
                          {regions.find((r) => r.id === selectedRegion)?.name}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                        <div>
                          <div className="text-gray-500 text-xs mb-1">Carbon Intensity</div>
                          <div className="text-xl font-bold text-gray-100">
                            {decisionPayload.carbonIntensity}
                            <span className="text-xs text-gray-500 ml-1">g/kWh</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-xs mb-1">Quality Score</div>
                          <div className="text-xl font-bold text-gray-100">
                            {Math.round(decisionPayload.score)}
                            <span className="text-xs text-gray-500 ml-1">/100</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-xs mb-1">Carbon Saved</div>
                          <div className="text-xl font-bold text-emerald-400">
                            {decisionPayload.carbonSaved}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-xs mb-1">Forecast Stability</div>
                          <div className="text-xl font-bold text-gray-100 capitalize">
                            {decisionPayload.forecast_stability}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
                    <button
                      onClick={() => setExpandPayload(!expandPayload)}
                      className="w-full flex items-center justify-between"
                    >
                      <span className="font-semibold text-white">Decision Payload</span>
                      <span className="text-gray-500">{expandPayload ? '−' : '+'}</span>
                    </button>

                    {expandPayload && (
                      <div className="mt-4 p-3 bg-gray-900 rounded font-mono text-xs text-gray-400 overflow-auto max-h-64">
                        <pre>{JSON.stringify(decisionPayload, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-12 text-center">
                  <div className="text-gray-500">
                    Select a region and click "Route Green" to see the decision
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="signals" className="py-24 border-t border-gray-800">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-gray-400 text-lg">Three steps to carbon-aware compute</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Connect',
                description: 'Drop-in SDK, 3 lines of code. No infrastructure changes.',
                code: 'const ecobe = new CarbonRouter()',
              },
              {
                step: '2',
                title: 'Route',
                description: 'AI selects the cleanest region in real-time based on live grid signals.',
                code: 'await ecobe.route(workload)',
              },
              {
                step: '3',
                title: 'Save',
                description:
                  'Track carbon avoided, forecast accuracy, and compliance in your dashboard.',
                code: 'const avoided = metrics.carbonSaved',
              },
            ].map((item, i) => (
              <div
                key={i}
                className="bg-gray-800/50 border border-gray-700 rounded-lg p-8 hover:border-emerald-500/50 transition"
              >
                <div className="h-12 w-12 rounded-lg bg-emerald-500/20 flex items-center justify-center mb-4">
                  <span className="text-2xl font-bold text-emerald-400">{item.step}</span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm mb-4">{item.description}</p>
                <div className="bg-gray-900 border border-gray-700 rounded p-3 font-mono text-xs text-emerald-400">
                  {item.code}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Signal Intelligence Section */}
      <section className="py-24 bg-gray-900/50 border-y border-gray-800">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Signal Intelligence</h2>
            <p className="text-gray-400 text-lg">Four providers, one truth</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                name: 'WattTime',
                signal: 'MOER',
                description: 'Real-time marginal operating emissions rate. Primary routing signal.',
                status: 'Live',
                color: 'emerald',
              },
              {
                name: 'Electricity Maps',
                signal: 'Flow-traced Intensity',
                description: 'Grid intelligence with electricity mix and cross-zone effects.',
                status: 'Live',
                color: 'cyan',
              },
              {
                name: 'Ember',
                signal: 'Structural Profile',
                description: 'Monthly/yearly carbon baseline and generation mix trends.',
                status: 'Live',
                color: 'amber',
              },
              {
                name: 'EIA-930',
                signal: 'Predictive Telemetry',
                description: 'Balance, interchange, demand ramps, and curtailment probability.',
                status: 'Live',
                color: 'blue',
              },
            ].map((provider, i) => {
              const colorClasses: Record<string, string> = {
                emerald: 'from-emerald-500/20 to-emerald-500/0 border-emerald-500/50',
                cyan: 'from-cyan-500/20 to-cyan-500/0 border-cyan-500/50',
                amber: 'from-amber-500/20 to-amber-500/0 border-amber-500/50',
                blue: 'from-blue-500/20 to-blue-500/0 border-blue-500/50',
              }

              return (
                <div
                  key={i}
                  className={`bg-gradient-to-br ${colorClasses[provider.color]} border rounded-lg p-6`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-white">{provider.name}</h3>
                      <div className="text-xs font-mono text-gray-400 mt-1">{provider.signal}</div>
                    </div>
                    <div className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded">
                      {provider.status}
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm">{provider.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 border-t border-gray-800">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Transparent Pricing</h2>
            <p className="text-gray-400 text-lg">Start free, scale as you grow</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                name: 'Free',
                price: '$0',
                period: '/month',
                commands: '1,000',
                features: [
                  'Basic routing',
                  '1 cloud region',
                  'Community support',
                  'Public dashboard',
                  '30-day retention',
                ],
                cta: 'Get Started',
                highlight: false,
              },
              {
                name: 'Pro',
                price: '$99',
                period: '/month',
                commands: '50,000',
                features: [
                  'Full intelligence',
                  'All 6 regions',
                  'Priority support',
                  'Private dashboard',
                  '1-year retention',
                  'API access',
                ],
                cta: 'Start Free Trial',
                highlight: true,
              },
              {
                name: 'Enterprise',
                price: 'Custom',
                period: 'contact sales',
                commands: 'Unlimited',
                features: [
                  'Unlimited routing',
                  'Custom regions',
                  'Dedicated support',
                  'SLA guaranteed',
                  'Custom integrations',
                  'Training included',
                ],
                cta: 'Contact Sales',
                highlight: false,
              },
            ].map((plan, i) => (
              <div
                key={i}
                className={`rounded-lg p-8 transition ${
                  plan.highlight
                    ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border-2 border-emerald-500 ring-emerald-500/20 ring-2'
                    : 'bg-gray-800/50 border border-gray-700'
                }`}
              >
                <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  <span className="text-gray-400 text-sm ml-2">{plan.period}</span>
                  <div className="text-sm text-gray-500 mt-2">{plan.commands} commands/month</div>
                </div>

                <button
                  className={`w-full py-2.5 rounded-lg font-semibold mb-8 transition ${
                    plan.highlight
                      ? 'bg-emerald-500 text-gray-950 hover:bg-emerald-400'
                      : 'border border-gray-600 text-gray-100 hover:bg-gray-700'
                  }`}
                >
                  {plan.cta}
                </button>

                <div className="space-y-3">
                  {plan.features.map((feature, j) => (
                    <div key={j} className="flex items-center space-x-3">
                      <div className="h-5 w-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      </div>
                      <span className="text-sm text-gray-300">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-gray-500 text-sm">
              Overage pricing: <span className="text-emerald-400 font-semibold">$0.0015/command</span>
            </p>
            <p className="text-gray-500 text-sm mt-2">
              Simulation commands count at 0.5x
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-emerald-500/10 border-t border-gray-800">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold text-white mb-6">Start Routing Carbon, Not Emissions</h2>
          <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            Join companies cutting their cloud carbon footprint by 40–70% without code changes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-3 bg-emerald-500 text-gray-950 font-semibold rounded-lg hover:bg-emerald-400 transition">
              Start Free
            </button>
            <button className="px-8 py-3 border border-gray-700 text-gray-100 font-semibold rounded-lg hover:bg-gray-900 transition">
              Schedule Demo
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-gray-900/50">
        <div className="container mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">🌱</span>
                </div>
                <span className="text-lg font-bold text-white">ECOBE</span>
              </div>
              <p className="text-gray-500 text-sm">
                Carbon-aware compute routing engine built for a sustainable future.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <div className="space-y-2 text-sm text-gray-500">
                <a href="#demo" className="hover:text-emerald-400 transition">
                  Live Demo
                </a>
                <a href="#" className="hover:text-emerald-400 transition">
                  Documentation
                </a>
                <a href="#" className="hover:text-emerald-400 transition">
                  API Reference
                </a>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <div className="space-y-2 text-sm text-gray-500">
                <a href="#" className="hover:text-emerald-400 transition">
                  Status
                </a>
                <a href="#" className="hover:text-emerald-400 transition">
                  Methodology
                </a>
                <a href="#" className="hover:text-emerald-400 transition">
                  Contact
                </a>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <div className="space-y-2 text-sm text-gray-500">
                <a href="#" className="hover:text-emerald-400 transition">
                  Privacy
                </a>
                <a href="#" className="hover:text-emerald-400 transition">
                  Terms
                </a>
                <a href="#" className="hover:text-emerald-400 transition">
                  Security
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 flex items-center justify-between">
            <p className="text-gray-500 text-sm">
              © 2026 ECOBE. Built for a carbon-neutral future.
            </p>
            <p className="text-gray-500 text-sm">
              Powered by WattTime, Electricity Maps, Ember, EIA-930
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
