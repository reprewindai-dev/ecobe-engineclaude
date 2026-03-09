'use client'

import { useState } from 'react'
import { DecisionEngineStatus } from '@/components/DecisionEngineStatus'
import { CarbonOpportunityMap } from '@/components/CarbonOpportunityMap'
import { DecisionStream } from '@/components/DecisionStream'
import { GreenRoutingForm } from '@/components/GreenRoutingForm'
import { DecisionReplay } from '@/components/DecisionReplay'
import { EnergyCalculator } from '@/components/EnergyCalculator'
import { CarbonOpportunityTimeline } from '@/components/CarbonOpportunityTimeline'
import { ForecastAccuracyTracker } from '@/components/ForecastAccuracyTracker'
import { CarbonSavingsDashboard } from '@/components/CarbonSavingsDashboard'
import { DecisionConfidencePanel } from '@/components/DecisionConfidencePanel'
import { CarbonBudgetPanel } from '@/components/CarbonBudgetPanel'
import { ProviderHealthMonitor } from '@/components/ProviderHealthMonitor'
import { PolicyEnforcementPanel } from '@/components/PolicyEnforcementPanel'
import { SystemHealth } from '@/components/SystemHealth'
import { DekesStats } from '@/components/DekesStats'

type Tab = 'operations' | 'routing' | 'energy' | 'forecast' | 'analytics' | 'dekes'

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: 'operations', label: 'Operations', description: 'Signals · Decisions · Live feed' },
  { id: 'routing', label: 'Routing', description: 'Route workloads · Replay decisions' },
  { id: 'energy', label: 'Energy', description: 'Carbon equation calculator' },
  { id: 'forecast', label: 'Forecast', description: '72h carbon opportunity timeline' },
  { id: 'analytics', label: 'Analytics', description: 'Impact · Budget · Health' },
  { id: 'dekes', label: 'DEKES', description: 'Workload optimization' },
]

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>('operations')

  return (
    <div className="space-y-6">
      {/* Always-visible Decision Engine Status strip */}
      <DecisionEngineStatus />

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-white">
            CO₂ Router
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Carbon-aware compute operations console
          </p>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="border-b border-slate-800">
        <nav className="flex space-x-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 py-3 px-4 border-b-2 transition text-left ${
                tab === t.id
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="text-sm font-medium block">{t.label}</span>
              <span className="text-xs block mt-0.5 opacity-60">{t.description}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {tab === 'operations' && (
          <div className="space-y-6">
            <CarbonOpportunityMap />
            <DecisionStream />
          </div>
        )}

        {tab === 'routing' && (
          <div className="space-y-10">
            <GreenRoutingForm />
            <div className="border-t border-slate-800 pt-8">
              <DecisionReplay />
            </div>
          </div>
        )}

        {tab === 'energy' && <EnergyCalculator />}

        {tab === 'forecast' && (
          <div className="space-y-6">
            <CarbonOpportunityTimeline />
            <ForecastAccuracyTracker />
          </div>
        )}

        {tab === 'analytics' && (
          <div className="space-y-6">
            <CarbonSavingsDashboard />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <DecisionConfidencePanel />
              <CarbonBudgetPanel />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ProviderHealthMonitor />
              <SystemHealth />
            </div>
            <PolicyEnforcementPanel />
          </div>
        )}

        {tab === 'dekes' && <DekesStats />}
      </div>
    </div>
  )
}
