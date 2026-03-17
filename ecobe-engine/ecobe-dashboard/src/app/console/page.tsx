'use client'

import { useState } from 'react'
import { CarbonReductionMultiplier } from '@/components/CarbonReductionMultiplier'
import { DecisionEngineStatus } from '@/components/DecisionEngineStatus'
import { CarbonOpportunityTimeline } from '@/components/CarbonOpportunityTimeline'
import { DecisionStream } from '@/components/DecisionStream'
import { CarbonSavingsDashboard } from '@/components/CarbonSavingsDashboard'
import { CarbonBudgetPanel } from '@/components/CarbonBudgetPanel'
import { ProviderHealthMonitor } from '@/components/ProviderHealthMonitor'
import { PolicyEnforcementPanel } from '@/components/PolicyEnforcementPanel'
import { CarbonOpportunityMap } from '@/components/CarbonOpportunityMap'
import { ForecastAccuracyTracker } from '@/components/ForecastAccuracyTracker'
import { GridIntelligencePanel } from '@/components/GridIntelligencePanel'
import { EmberStructuralPanel } from '@/components/EmberStructuralPanel'
import { GreenRoutingForm } from '@/components/GreenRoutingForm'
import { DecisionReplay } from '@/components/DecisionReplay'
import { EnergyCalculator } from '@/components/EnergyCalculator'
import { DecisionConfidencePanel } from '@/components/DecisionConfidencePanel'
import { SystemHealth } from '@/components/SystemHealth'
import { ExecutionIntegrityPanel } from '@/components/ExecutionIntegrityPanel'
import { DekesStats } from '@/components/DekesStats'
import { CarbonHeatCalendar } from '@/components/CarbonHeatCalendar'
import { BestWindowPanel } from '@/components/BestWindowPanel'
import { IntegrationSourcesPanel } from '@/components/IntegrationSourcesPanel'
import { DekesImpactCard } from '@/components/DekesImpactCard'
import { WorkloadImpactGraph } from '@/components/WorkloadImpactGraph'
import { DekesHandoffPanel } from '@/components/DekesHandoffPanel'
import { OrgRiskTable } from '@/components/OrgRiskTable'

type Tab = 'console' | 'signals' | 'routing' | 'energy' | 'analytics' | 'dekes' | 'patterns' | 'integration'

const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: 'console', label: 'Console', sub: 'State · Events · Impact' },
  { id: 'signals', label: 'Signals', sub: 'Regions · Forecast accuracy' },
  { id: 'routing', label: 'Routing', sub: 'Route · Schedule · Replay' },
  { id: 'energy', label: 'Energy', sub: 'Carbon equation' },
  { id: 'analytics', label: 'Analytics', sub: 'Confidence · System · Sources' },
  { id: 'dekes', label: 'DEKES', sub: 'Workload optimization' },
  { id: 'patterns', label: 'Patterns', sub: 'Weekly heat calendar' },
  { id: 'integration', label: 'Integration', sub: 'DEKES · Handoffs · Business activation' },
]

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>('console')

  return (
    <div className="space-y-5">
      {/* Tab navigation */}
      <div className="border-b border-slate-800">
        <nav className="flex space-x-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 py-2.5 px-4 border-b-2 transition text-left ${
                tab === t.id
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="text-sm font-medium block">{t.label}</span>
              <span className="text-xs block mt-0.5 opacity-50">{t.sub}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* ── CONSOLE ── Control-plane layout (infrastructure pattern) */}
      {tab === 'console' && (
        <div className="space-y-5">
          {/* Layer 1 — System State */}
          <CarbonReductionMultiplier />
          <DecisionEngineStatus />

          {/* Layer 2 — Signature visualization */}
          <CarbonOpportunityTimeline />

          {/* Layer 3 — Live activity */}
          <DecisionStream />

          {/* Layer 4 — Impact + Budget */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <CarbonSavingsDashboard />
            <CarbonBudgetPanel />
          </div>

          {/* Layer 5 — Execution integrity */}
          <ExecutionIntegrityPanel />

          {/* Layer 6 — Governance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ProviderHealthMonitor />
            <PolicyEnforcementPanel />
          </div>
        </div>
      )}

      {/* ── SIGNALS ── Regional data + accuracy */}
      {tab === 'signals' && (
        <div className="space-y-5">
          <CarbonOpportunityMap />
          <GridIntelligencePanel />
          <EmberStructuralPanel />
          <ForecastAccuracyTracker />
        </div>
      )}

      {/* ── ROUTING ── Route workloads + scheduling + debug replay */}
      {tab === 'routing' && (
        <div className="space-y-10">
          <GreenRoutingForm />
          <div className="border-t border-slate-800 pt-8">
            <BestWindowPanel />
          </div>
          <div className="border-t border-slate-800 pt-8">
            <DecisionReplay />
          </div>
        </div>
      )}

      {/* ── ENERGY ── Carbon equation calculator */}
      {tab === 'energy' && <EnergyCalculator />}

      {/* ── ANALYTICS ── Confidence breakdown + system metrics + integration sources */}
      {tab === 'analytics' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <DecisionConfidencePanel />
            <SystemHealth />
          </div>
          <IntegrationSourcesPanel />
          <WorkloadImpactGraph />
        </div>
      )}

      {/* ── DEKES ── DEKES workload impact + analytics */}
      {tab === 'dekes' && (
        <div className="space-y-5">
          <DekesImpactCard />
          <DekesStats />
        </div>
      )}

      {/* ── PATTERNS ── Weekly heat calendar */}
      {tab === 'patterns' && <CarbonHeatCalendar />}

      {/* ── INTEGRATION ── DEKES handoff events + org risk */}
      {tab === 'integration' && (
        <div className="space-y-5">
          <DekesHandoffPanel />
          <OrgRiskTable />
        </div>
      )}
    </div>
  )
}
