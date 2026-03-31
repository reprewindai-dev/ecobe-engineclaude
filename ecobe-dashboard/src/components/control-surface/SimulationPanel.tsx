'use client'

import { useEffect, useState } from 'react'

import { useSimulation } from '@/lib/hooks/control-surface'
import type { CiRouteResponse, ControlSurfaceOverview } from '@/types/control-surface'

const policyProfiles = [
  'default',
  'drought_sensitive',
  'eu_data_center_reporting',
  'high_water_sensitivity',
] as const

export function SimulationPanel({
  defaults,
  onSimulation,
}: {
  defaults: ControlSurfaceOverview['simulationDefaults']
  onSimulation: (decision: CiRouteResponse) => void
}) {
  const simulation = useSimulation('full')
  const [regions, setRegions] = useState(defaults.preferredRegions.join(', '))
  const [jobType, setJobType] = useState(defaults.jobType)
  const [criticality, setCriticality] = useState(defaults.criticality)
  const [waterPolicyProfile, setWaterPolicyProfile] = useState(defaults.waterPolicyProfile)

  useEffect(() => {
    setRegions(defaults.preferredRegions.join(', '))
    setJobType(defaults.jobType)
    setCriticality(defaults.criticality)
    setWaterPolicyProfile(defaults.waterPolicyProfile)
  }, [defaults])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const preferredRegions = regions
      .split(',')
      .map((region) => region.trim())
      .filter(Boolean)

    const result = await simulation.mutateAsync({
      ...defaults,
      preferredRegions,
      jobType,
      criticality,
      waterPolicyProfile,
    })

    onSimulation(result as CiRouteResponse)
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Simulate mode</div>
      <h3 className="mt-2 text-xl font-bold text-white">Ask the engine what it would do</h3>
      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm text-slate-300">
          Regions
          <input
            value={regions}
            onChange={(event) => setRegions(event.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none ring-0 transition focus:border-cyan-300/30"
            placeholder="us-east1, eu-west1, us-west1"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-2 text-sm text-slate-300">
            Workload
            <select
              value={jobType}
              onChange={(event) => setJobType(event.target.value as typeof jobType)}
              className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none"
            >
              <option value="light">Light</option>
              <option value="standard">Standard</option>
              <option value="heavy">Heavy</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Urgency
            <select
              value={criticality}
              onChange={(event) => setCriticality(event.target.value as typeof criticality)}
              className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none"
            >
              <option value="batch">Batch</option>
              <option value="standard">Standard</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Policy mode
            <select
              value={waterPolicyProfile}
              onChange={(event) => setWaterPolicyProfile(event.target.value as typeof waterPolicyProfile)}
              className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none"
            >
              {policyProfiles.map((profile) => (
                <option key={profile} value={profile}>
                  {profile}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={simulation.isPending}
          className="rounded-2xl bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {simulation.isPending ? 'Simulating...' : 'Run simulation'}
        </button>
        {simulation.error && (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {simulation.error instanceof Error ? simulation.error.message : 'Simulation failed'}
          </div>
        )}
      </form>
    </section>
  )
}

