'use client'

import { useState, useRef, useEffect } from 'react'
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

const TABS: { id: Tab; label: string; icon: string; sub: string }[] = [
  { id: 'console', label: 'Console', icon: '⚡', sub: 'State · Events · Impact' },
  { id: 'signals', label: 'Signals', icon: '📡', sub: 'Regions · Forecast' },
  { id: 'routing', label: 'Routing', icon: '🔀', sub: 'Route · Schedule · Replay' },
  { id: 'energy', label: 'Energy', icon: '⚛', sub: 'Carbon equation' },
  { id: 'analytics', label: 'Analytics', icon: '📊', sub: 'Confidence · System' },
  { id: 'dekes', label: 'DEKES', icon: '🎯', sub: 'Workload optimization' },
  { id: 'patterns', label: 'Patterns', icon: '🗓', sub: 'Weekly heat calendar' },
  { id: 'integration', label: 'Integration', icon: '🔗', sub: 'Handoffs · Business' },
]

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>('console')
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const navRef = useRef<HTMLDivElement>(null)

  // Animate tab indicator
  useEffect(() => {
    const el = tabRefs.current.get(tab)
    if (el && navRef.current) {
      const navRect = navRef.current.getBoundingClientRect()
      const tabRect = el.getBoundingClientRect()
      setIndicatorStyle({
        left: tabRect.left - navRect.left,
        width: tabRect.width,
      })
    }
  }, [tab])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Tab navigation — futuristic pill style */}
      <div className="relative" ref={navRef}>
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => { if (el) tabRefs.current.set(t.id, el) }}
              onClick={() => setTab(t.id)}
              className={`relative flex-shrink-0 py-2 px-4 rounded-lg transition-all duration-300 text-left group ${
                tab === t.id
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{t.icon}</span>
                <span className="text-sm font-semibold">{t.label}</span>
              </div>
              <span className={`text-[10px] block mt-0.5 transition-opacity ${
                tab === t.id ? 'opacity-60' : 'opacity-0 group-hover:opacity-40'
              }`}>
                {t.sub}
              </span>
              {tab === t.id && (
                <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
        {/* Gradient fade edges for horizontal scroll */}
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-slate-950 to-transparent pointer-events-none" />
      </div>

      {/* Tab content with entrance animation */}
      <div key={tab} className="animate-slide-up">
        {/* ── CONSOLE ── */}
        {tab === 'console' && (
          <div className="space-y-5 stagger-children">
            <CarbonReductionMultiplier />
            <DecisionEngineStatus />
            <CarbonOpportunityTimeline />
            <DecisionStream />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <CarbonSavingsDashboard />
              <CarbonBudgetPanel />
            </div>
            <ExecutionIntegrityPanel />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ProviderHealthMonitor />
              <PolicyEnforcementPanel />
            </div>
          </div>
        )}

        {/* ── SIGNALS ── */}
        {tab === 'signals' && (
          <div className="space-y-5 stagger-children">
            <CarbonOpportunityMap />
            <GridIntelligencePanel />
            <EmberStructuralPanel />
            <ForecastAccuracyTracker />
          </div>
        )}

        {/* ── ROUTING ── */}
        {tab === 'routing' && (
          <div className="space-y-8 stagger-children">
            <GreenRoutingForm />
            <div className="border-t border-slate-800/50 pt-6">
              <BestWindowPanel />
            </div>
            <div className="border-t border-slate-800/50 pt-6">
              <DecisionReplay />
            </div>
          </div>
        )}

        {/* ── ENERGY ── */}
        {tab === 'energy' && <EnergyCalculator />}

        {/* ── ANALYTICS ── */}
        {tab === 'analytics' && (
          <div className="space-y-5 stagger-children">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <DecisionConfidencePanel />
              <SystemHealth />
            </div>
            <IntegrationSourcesPanel />
            <WorkloadImpactGraph />
          </div>
        )}

        {/* ── DEKES ── */}
        {tab === 'dekes' && (
          <div className="space-y-5 stagger-children">
            <DekesImpactCard />
            <DekesStats />
          </div>
        )}

        {/* ── PATTERNS ── */}
        {tab === 'patterns' && <CarbonHeatCalendar />}

        {/* ── INTEGRATION ── */}
        {tab === 'integration' && (
          <div className="space-y-5 stagger-children">
            <DekesHandoffPanel />
            <OrgRiskTable />
          </div>
        )}
      </div>
    </div>
  )
}
