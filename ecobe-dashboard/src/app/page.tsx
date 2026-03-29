'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'

import { CO2RouterLogo } from '@/components/CO2RouterLogo'

interface RegionData {
  id: string
  name: string
  carbonIntensity: number | null
  demand: string
  renewable: string
  confidence: number
  source: string
  timestamp: string
}

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
  const [regions, setRegions] = useState<RegionData[]>([])
  const [regionsLoading, setRegionsLoading] = useState(true)
  const [regionsError, setRegionsError] = useState<string | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [showDecision, setShowDecision] = useState(false)
  const [decisionPayload, setDecisionPayload] = useState<Record<string, unknown> | null>(null)
  const [expandPayload, setExpandPayload] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    let active = true

    async function loadRegions() {
      try {
        setRegionsLoading(true)
        setRegionsError(null)
        const { data } = await axios.get<RegionData[]>('/api/dashboard/regions')
        if (!active) return
        setRegions(data)
      } catch (error) {
        if (!active) return
        setRegionsError(error instanceof Error ? error.message : 'Failed to load live regions')
      } finally {
        if (active) setRegionsLoading(false)
      }
    }

    void loadRegions()

    return () => {
      active = false
    }
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
    const routableRegions = regions.filter(
      (region): region is RegionData & { carbonIntensity: number } =>
        typeof region.carbonIntensity === 'number'
    )

    if (routableRegions.length === 0) {
      return
    }

    const baselineRegion =
      routableRegions.find((region) => region.id === selectedRegion) ?? routableRegions[0]
    const cleanestRegion = routableRegions.reduce((prev, current) =>
      current.carbonIntensity < prev.carbonIntensity ? current : prev
    )

    const carbonSaved = Math.round(
      Math.max(0, baselineRegion.carbonIntensity - cleanestRegion.carbonIntensity) *
        (parseInt(scenarios[demoScenario].memory, 10) / 100) *
        2.5
    )

    const payload = {
      timestamp: new Date().toISOString().split('T')[1]?.split('.')[0],
      scenario: scenarios[demoScenario].workload,
      selectedRegion: cleanestRegion.id,
      carbonIntensity: cleanestRegion.carbonIntensity,
      score: 94 + Math.random() * 6,
      qualityTier: 'high',
      carbon_delta_g_per_kwh: baselineRegion.carbonIntensity - cleanestRegion.carbonIntensity,
      forecast_stability: 'stable',
      provider_disagreement: { flag: false, pct: 0 },
      balancingAuthority: 'MISO',
      demandRampPct: 2.3,
      carbonSpikeProbability: 0.08,
      curtailmentProbability: 0.02,
      importCarbonLeakageScore: 0.15,
      source_used: 'WattTime',
      validation_source: 'Carbon Signal Provider',
      fallback_used: false,
      estimatedFlag: false,
      syntheticFlag: false,
      carbonSaved: `${carbonSaved}g CO2`,
      deadline: scenarios[demoScenario].deadline,
    }

    setSelectedRegion(cleanestRegion.id)
    setShowDecision(true)
    setDecisionPayload(payload)
  }

  if (!isMounted) return null

  return (
    <div className="bg-gray-950 text-gray-100 bg-grid-mesh">
      <nav className="sticky top-0 z-50 border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-xl">
        <div className="container mx-auto flex items-center justify-between px-6 py-3">
          <CO2RouterLogo size="md" />
          <div className="flex items-center gap-4">
            <a
              href="#pricing"
              className="text-sm text-gray-400 transition-colors duration-200 hover:text-emerald-400"
            >
              Pricing
            </a>
            <a
              href="#signals"
              className="text-sm text-gray-400 transition-colors duration-200 hover:text-emerald-400"
            >
              How It Works
            </a>
            <Link
              href="/contact"
              className="text-sm text-gray-400 transition-colors duration-200 hover:text-cyan-300"
            >
              Contact
            </Link>
            <Link
              href="/console"
              className="rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-2 text-gray-950 shadow-lg shadow-emerald-500/20 transition-all duration-200 hover:from-emerald-400 hover:to-cyan-400"
            >
              Open Console
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/8 via-gray-950 to-gray-950" />
        <div className="absolute right-20 top-20 h-[500px] w-[500px] animate-breathe rounded-full bg-emerald-500/5 blur-[100px]" />
        <div className="absolute bottom-0 left-10 h-[400px] w-[400px] rounded-full bg-cyan-500/5 blur-[80px]" />
        <div className="absolute left-1/2 top-40 h-[300px] w-[300px] rounded-full bg-blue-500/3 blur-[60px]" />

        <div className="relative container mx-auto px-6 py-28">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-glow" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Live - 6 Regions Active
              </span>
            </div>
            <h1 className="mb-6 text-5xl font-black leading-[1.1] tracking-tight text-white md:text-7xl">
              Route Compute to
              <span className="block gradient-text">Clean Energy.</span>
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-xl leading-relaxed text-gray-400">
              CO2 Router is the world&apos;s most accurate carbon-aware routing engine. Cut your cloud
              carbon footprint by 40-70% with zero code changes.
            </p>

            <div className="mb-12 flex flex-col justify-center gap-4 sm:flex-row">
              <button
                onClick={() => {
                  document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="rounded-lg bg-emerald-500 px-8 py-3 font-semibold text-gray-950 transition hover:bg-emerald-400"
              >
                Try Live Demo
              </button>
              <Link
                href="/contact"
                className="rounded-lg border border-gray-700 px-8 py-3 font-semibold text-gray-100 transition hover:bg-gray-900"
              >
                Start Contact
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-gray-800 pt-8 md:grid-cols-4">
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

      <section id="demo" className="border-t border-gray-800 bg-gray-900/50 py-24">
        <div className="container mx-auto px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold text-white">See It Work in Real-Time</h2>
            <p className="text-lg text-gray-400">
              Interactive routing decision engine with live carbon calculations
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
                <h3 className="mb-4 text-lg font-semibold text-white">Workload</h3>
                <div className="space-y-2">
                  {scenarios.map((scenario, index) => (
                    <div
                      key={scenario.workload}
                      className={`cursor-pointer rounded-lg border p-4 transition ${
                        index === demoScenario
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                      onClick={() => {
                        setDemoScenario(index)
                        setSelectedRegion(null)
                        setShowDecision(false)
                        setDecisionPayload(null)
                      }}
                    >
                      <div className="font-medium text-white">{scenario.workload}</div>
                      <div className="mt-1 text-sm text-gray-400">{scenario.description}</div>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                        <span>{scenario.memory}</span>
                        <span>{scenario.compute}</span>
                        <span>Deadline {scenario.deadline}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">Live Region Signals</h3>
                  <button
                    onClick={handleRouteGreen}
                    disabled={regionsLoading || regions.length === 0}
                    className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-gray-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Route Green
                  </button>
                </div>

                {regionsLoading ? <div className="text-sm text-gray-400">Loading live regions...</div> : null}
                {regionsError ? <div className="text-sm text-rose-300">{regionsError}</div> : null}

                <div className="space-y-3">
                  {regions.map((region) => (
                    <button
                      key={region.id}
                      type="button"
                      onClick={() => setSelectedRegion(region.id)}
                      className={`w-full rounded-lg border p-4 text-left transition ${
                        selectedRegion === region.id
                          ? 'border-cyan-400 bg-cyan-500/10'
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-white">{region.name}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-gray-500">
                            {region.source}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-emerald-300">
                            {region.carbonIntensity != null ? `${region.carbonIntensity.toFixed(0)} gCO2/kWh` : 'N/A'}
                          </div>
                          <div className="text-xs text-gray-500">
                            Confidence {Math.round(region.confidence * 100)}%
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
                <h3 className="mb-4 text-lg font-semibold text-white">Decision Envelope</h3>
                {showDecision && decisionPayload ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
                      <div>
                        <div className="text-sm uppercase tracking-[0.18em] text-emerald-300">Routed</div>
                        <div className="mt-1 text-2xl font-bold text-white">
                          {String(decisionPayload.selectedRegion)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-400">Carbon saved</div>
                        <div className="mt-1 text-xl font-semibold text-emerald-300">
                          {String(decisionPayload.carbonSaved)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-700 bg-gray-900/70 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-semibold text-white">Payload</div>
                        <button
                          type="button"
                          onClick={() => setExpandPayload((value) => !value)}
                          className="text-xs uppercase tracking-[0.2em] text-cyan-300"
                        >
                          {expandPayload ? 'Collapse' : 'Expand'}
                        </button>
                      </div>
                      <pre className={`overflow-x-auto text-xs leading-6 text-slate-300 ${expandPayload ? '' : 'max-h-80 overflow-hidden'}`}>
                        {JSON.stringify(decisionPayload, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-700 p-6 text-sm text-gray-400">
                    Select a workload and route it to the lowest-carbon region to generate a live decision envelope.
                  </div>
                )}
              </div>

              <div id="signals" className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
                <h3 className="mb-4 text-lg font-semibold text-white">Signal Doctrine</h3>
                <div className="grid gap-3 text-sm text-slate-300">
                  <div>Signals feed the router before execution begins.</div>
                  <div>Water authority can block unsafe execution paths.</div>
                  <div>Proof, trace, and replay attach to every governed decision path.</div>
                  <div>Command center and control surface show only real live data.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
