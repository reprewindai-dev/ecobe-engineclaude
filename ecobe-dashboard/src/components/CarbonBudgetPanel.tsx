'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ecobeApi } from '@/lib/api'
import { AlertTriangle, CheckCircle, Settings } from 'lucide-react'

const DEFAULT_MONTHLY_BUDGET_KG = 12_000 // 12,000 kg default

export function CarbonBudgetPanel() {
  const [budget, setBudget] = useState(DEFAULT_MONTHLY_BUDGET_KG)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(DEFAULT_MONTHLY_BUDGET_KG))

  const { data } = useQuery({
    queryKey: ['dashboard-savings', '30d'],
    queryFn: () => ecobeApi.getDashboardSavings('30d'),
    refetchInterval: 5 * 60_000,
  })

  // Use actual CO2 produced (not saved) as usage
  const usedKg = data ? data.totalCO2ActualG / 1000 : null
  const usedPct = usedKg != null ? Math.min((usedKg / budget) * 100, 100) : 0
  const remainingKg = usedKg != null ? Math.max(budget - usedKg, 0) : null

  // Predict burn rate
  const burnPerDay = usedKg != null ? usedKg / 30 : null
  const daysLeft = burnPerDay && remainingKg != null ? Math.floor(remainingKg / burnPerDay) : null

  const status =
    usedPct > 90
      ? 'critical'
      : usedPct > 70
        ? 'warning'
        : 'ok'

  const statusConfig = {
    ok: {
      label: 'WITHIN LIMIT',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      bar: 'bg-emerald-500',
      icon: <CheckCircle className="w-4 h-4 text-emerald-400" />,
    },
    warning: {
      label: 'APPROACHING LIMIT',
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10 border-yellow-500/20',
      bar: 'bg-yellow-500',
      icon: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
    },
    critical: {
      label: 'NEAR LIMIT',
      color: 'text-red-400',
      bg: 'bg-red-500/10 border-red-500/20',
      bar: 'bg-red-500',
      icon: <AlertTriangle className="w-4 h-4 text-red-400" />,
    },
  }

  const cfg = statusConfig[status]

  const handleSave = () => {
    const parsed = parseFloat(draft)
    if (!isNaN(parsed) && parsed > 0) setBudget(parsed)
    setEditing(false)
  }

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Carbon Budget</h3>
          <p className="text-xs text-slate-500 mt-0.5">Monthly CO₂ envelope</p>
        </div>
        <button
          onClick={() => {
            setDraft(String(budget))
            setEditing(!editing)
          }}
          className="p-1.5 rounded-lg hover:bg-slate-800 transition"
        >
          <Settings className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {editing && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-slate-400 mb-1 block">Monthly budget (kg CO₂)</label>
            <input
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            onClick={handleSave}
            className="self-end px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600 transition"
          >
            Save
          </button>
        </div>
      )}

      {/* Status badge */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cfg.bg}`}>
        {cfg.icon}
        <span className={`text-xs font-semibold ${cfg.color}`}>Status: {cfg.label}</span>
      </div>

      {/* Budget numbers */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/40 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">Budget</p>
          <p className="text-base font-bold text-white">
            {budget.toLocaleString()}
            <span className="text-xs font-normal text-slate-500 ml-1">kg</span>
          </p>
        </div>
        <div className="bg-slate-800/40 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">Used</p>
          <p className={`text-base font-bold ${cfg.color}`}>
            {usedKg != null ? usedKg.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}
            <span className="text-xs font-normal text-slate-500 ml-1">kg</span>
          </p>
        </div>
        <div className="bg-slate-800/40 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">Remaining</p>
          <p className="text-base font-bold text-slate-300">
            {remainingKg != null
              ? remainingKg.toLocaleString(undefined, { maximumFractionDigits: 1 })
              : '—'}
            <span className="text-xs font-normal text-slate-500 ml-1">kg</span>
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>{usedPct.toFixed(1)}% used</span>
          <span>{(100 - usedPct).toFixed(1)}% remaining</span>
        </div>
        <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      {/* Forecast burn */}
      {daysLeft != null && (
        <div className="text-xs text-slate-400">
          At current rate:{' '}
          <span className={daysLeft < 5 ? 'text-red-400 font-medium' : 'text-slate-300'}>
            ~{daysLeft} days until budget exhausted
          </span>
          {burnPerDay != null && (
            <span className="text-slate-600 ml-2">
              ({burnPerDay.toFixed(1)} kg/day)
            </span>
          )}
        </div>
      )}
    </div>
  )
}
