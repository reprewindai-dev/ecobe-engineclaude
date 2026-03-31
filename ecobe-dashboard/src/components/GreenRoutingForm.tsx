'use client'

import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { formatDistanceToNow, isPast, parseISO } from 'date-fns'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
  Zap,
} from 'lucide-react'
import { OpportunityInsight } from '@/components/OpportunityInsight'
import { ecobeApi, type GreenRoutingRequest } from '@/lib/api'
import {
  getCarbonColor,
  getCarbonLevel,
  getQualityTierBadge,
  getQualityTierColor,
  getStabilityColor,
  type GreenRoutingResult,
  type PolicyDelayResponse,
  type PolicyMode,
  type RevalidateResponse,
  type RoutingMode,
} from '@/types'

const REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-northeast-1']

const MODES: Array<{ id: RoutingMode; label: string; detail: string }> = [
  { id: 'optimize', label: 'Optimize', detail: 'Best carbon, latency, and cost blend.' },
  { id: 'assurance', label: 'Assurance', detail: 'Conservative decisioning for audit and disclosure.' },
]

const POLICIES: Array<{ id: PolicyMode; label: string; detail: string }> = [
  { id: 'default', label: 'Default', detail: 'Balanced production routing.' },
  { id: 'sec_disclosure_strict', label: 'SEC Disclosure Strict', detail: 'Conservative, provenance-rich signal use.' },
  { id: 'eu_24x7_ready', label: 'EU 24x7 Ready', detail: 'Hourly-aligned and certificate-ready behavior.' },
]

function isPolicyDelay(result: GreenRoutingResult | PolicyDelayResponse): result is PolicyDelayResponse {
  return (result as PolicyDelayResponse).action === 'delay'
}

function useCountdown(isoTimestamp: string | undefined) {
  const [label, setLabel] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    if (!isoTimestamp) return
    const update = () => {
      const target = parseISO(isoTimestamp)
      if (isPast(target)) {
        setExpired(true)
        setLabel('expired')
      } else {
        setExpired(false)
        setLabel(formatDistanceToNow(target, { includeSeconds: true }))
      }
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [isoTimestamp])

  return { label, expired }
}

function Metric({
  label,
  value,
  note,
  className = 'text-white',
}: {
  label: string
  value: string
  note?: string
  className?: string
}) {
  return (
    <div className="rounded-lg bg-slate-800/50 p-3">
      <p className="mb-1 text-xs text-slate-400">{label}</p>
      <p className={`text-lg font-bold ${className}`}>{value}</p>
      {note ? <p className="text-xs text-slate-500">{note}</p> : null}
    </div>
  )
}

export function GreenRoutingForm() {
  const [formData, setFormData] = useState<GreenRoutingRequest>({
    preferredRegions: ['us-east-1', 'eu-west-1', 'eu-central-1'],
    maxCarbonGPerKwh: 400,
    carbonWeight: 0.5,
    latencyWeight: 0.2,
    costWeight: 0.3,
    mode: 'assurance',
    policyMode: 'sec_disclosure_strict',
  })

  const mutation = useMutation({
    mutationFn: (data: GreenRoutingRequest) => ecobeApi.routeGreen(data),
  })

  const revalidateMutation = useMutation({
    mutationFn: (leaseId: string) => ecobeApi.revalidateLease(leaseId),
  })

  const toggleRegion = (region: string) => {
    const current = formData.preferredRegions
    setFormData({
      ...formData,
      preferredRegions: current.includes(region)
        ? current.filter((item) => item !== region)
        : [...current, region],
    })
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    mutation.mutate(formData)
  }

  const result = mutation.data

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white">Green Routing Optimizer</h3>
        <p className="mt-1 text-sm text-slate-400">
          Live routing against real engine signals, assurance controls, and policy-aware scoring.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <form onSubmit={submit} className="space-y-6">
            <div>
              <label className="mb-3 block text-sm font-medium text-slate-300">
                Candidate Regions ({formData.preferredRegions.length} selected)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {REGIONS.map((region) => (
                  <button
                    key={region}
                    type="button"
                    onClick={() => toggleRegion(region)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      formData.preferredRegions.includes(region)
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {region}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Decision Mode</label>
                <div className="space-y-2">
                  {MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          mode: mode.id,
                          policyMode: mode.id === 'assurance' ? formData.policyMode ?? 'sec_disclosure_strict' : 'default',
                        })
                      }
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        formData.mode === mode.id
                          ? 'border-cyan-500 bg-cyan-500/10'
                          : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                      }`}
                    >
                      <p className="text-sm font-medium text-white">{mode.label}</p>
                      <p className="mt-1 text-xs text-slate-400">{mode.detail}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Policy Profile</label>
                <div className="space-y-2">
                  {POLICIES.map((policy) => (
                    <button
                      key={policy.id}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          policyMode: policy.id,
                          mode: policy.id === 'default' ? 'optimize' : 'assurance',
                        })
                      }
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        formData.policyMode === policy.id
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                      }`}
                    >
                      <p className="text-sm font-medium text-white">{policy.label}</p>
                      <p className="mt-1 text-xs text-slate-400">{policy.detail}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Max Carbon Intensity (gCO2/kWh)</label>
              <input
                type="number"
                value={formData.maxCarbonGPerKwh || ''}
                onChange={(event) => setFormData({ ...formData, maxCarbonGPerKwh: Number(event.target.value) })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                placeholder="400"
              />
            </div>

            <div className="space-y-4">
              <p className="text-sm font-medium text-slate-300">Optimization Weights</p>
              {([
                { key: 'carbonWeight', label: 'Carbon Priority' },
                { key: 'latencyWeight', label: 'Latency Priority' },
                { key: 'costWeight', label: 'Cost Priority' },
              ] as const).map(({ key, label }) => (
                <div key={key}>
                  <div className="mb-1.5 flex justify-between text-xs text-slate-400">
                    <span>{label}</span>
                    <span>{((formData[key] ?? 0) * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={formData[key]}
                    onChange={(event) => setFormData({ ...formData, [key]: Number(event.target.value) })}
                    className="w-full accent-emerald-500"
                  />
                </div>
              ))}
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-400">
                The engine normalizes the weights, stores them with the decision frame, and reuses them for replay and disclosure exports.
              </div>
            </div>

            <button
              type="submit"
              disabled={mutation.isPending || formData.preferredRegions.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-3 font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Routing...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Route Workload
                </>
              )}
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <h4 className="mb-5 text-lg font-semibold text-white">Routing Decision</h4>

          {mutation.isPending && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
          )}

          {mutation.isError && (
            <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
              <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-medium text-red-400">Optimization failed</p>
                <p className="mt-1 text-xs text-red-300/70">
                  {mutation.error instanceof Error ? mutation.error.message : 'Unknown error'}
                </p>
              </div>
            </div>
          )}

          {mutation.isSuccess && result && isPolicyDelay(result) && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
                <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-400" />
                <div>
                  <p className="text-sm font-medium text-yellow-400">Policy delay</p>
                  <p className="mt-1 text-xs text-yellow-300/70">{result.message}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Retry After" value={`${result.retryAfterMinutes} min`} className="text-yellow-400" />
                <Metric label="Best Available Now" value={result.currentBest.region} note={`${result.currentBest.carbonIntensity} gCO2/kWh`} />
              </div>
            </div>
          )}

          {mutation.isSuccess && result && !isPolicyDelay(result) && (
            <SuccessPanel
              result={result as GreenRoutingResult}
              onRevalidate={(leaseId) => revalidateMutation.mutate(leaseId)}
              revalidating={revalidateMutation.isPending}
              revalidateResult={revalidateMutation.data}
            />
          )}

          {!mutation.isPending && !mutation.isError && !mutation.isSuccess && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-600">
              <Zap className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm">Select regions and route your workload</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SuccessPanel({
  result,
  onRevalidate,
  revalidating,
  revalidateResult,
}: {
  result: GreenRoutingResult
  onRevalidate: (leaseId: string) => void
  revalidating: boolean
  revalidateResult?: RevalidateResponse
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
        <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
        <div className="flex-1">
          <p className="text-xs font-medium text-emerald-400">Selected Region</p>
          <p className="mt-1 text-2xl font-bold text-white">{result.selectedRegion}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getQualityTierBadge(result.qualityTier)}`}>
          {result.qualityTier.toUpperCase()}
        </span>
      </div>

      <LeaseBadge
        leaseId={result.lease_id}
        leaseExpiresAt={result.lease_expires_at}
        mustRevalidateAfter={result.must_revalidate_after}
        onRevalidate={onRevalidate}
        revalidating={revalidating}
        revalidateResult={revalidateResult}
      />

      <div className="grid grid-cols-2 gap-3">
        <Metric label="Carbon Intensity" value={String(result.carbonIntensity)} note="gCO2/kWh" className={getCarbonColor(getCarbonLevel(result.carbonIntensity))} />
        <Metric label="Carbon Delta" value={`+${result.carbon_delta_g_per_kwh ?? 0}`} note="vs worst candidate" className="text-sky-400" />
        <Metric label="Score" value={`${(result.score * 100).toFixed(1)}%`} className={getQualityTierColor(result.qualityTier)} />
        <Metric label="Forecast Stability" value={result.forecast_stability ?? '-'} className={`capitalize ${getStabilityColor(result.forecast_stability)}`} />
      </div>

      {result.weights && (
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(result.weights).map(([key, value]) => (
            <Metric key={key} label={`${key} weight`} value={`${(value * 100).toFixed(0)}%`} />
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Decision Mode</p>
          <p className="mt-2 text-sm text-slate-200">
            {(result.mode ?? 'optimize').toUpperCase()} / {(result.policyMode ?? 'default').replaceAll('_', ' ')}
          </p>
          <p className="mt-1 text-xs text-slate-500">Signal class: {result.signalTypeUsed ?? 'unknown'}</p>
        </div>
        {result.assurance && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Assurance Controls</p>
            <p className="mt-2 text-sm text-slate-200">
              Confidence {result.assurance.confidenceLabel} with a disagreement threshold of {result.assurance.disagreementThresholdPct}%.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Conservative accounting: {result.assurance.conservativeAccounting ? 'enabled' : 'disabled'}
            </p>
          </div>
        )}
      </div>

      {result.confidenceBand && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">Confidence Band</p>
          <p className="mt-2 text-sm text-slate-200">
            {result.confidenceBand.low} to {result.confidenceBand.high} gCO2/kWh around a midpoint of {result.confidenceBand.mid} gCO2/kWh.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {result.confidenceBand.empirical ? 'Band widened by observed provider disagreement.' : 'Band derived from signal confidence and freshness heuristics.'}
          </p>
        </div>
      )}

      {result.provider_disagreement?.flag && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-500/20 bg-orange-500/10 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-400" />
          <span className="text-orange-300">
            Provider disagreement detected
            {result.provider_disagreement.pct != null ? ` (${result.provider_disagreement.pct.toFixed(1)}% divergence)` : ''}
          </span>
        </div>
      )}

      {result.explanation && (
        <div className="rounded-lg border-l-2 border-emerald-500/40 bg-slate-800/30 p-3">
          <p className="mb-1 text-xs text-slate-400">Engine Explanation</p>
          <p className="text-sm text-slate-200">{result.explanation}</p>
        </div>
      )}

      {(result.doctrine || result.legalDisclaimer) && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          {result.doctrine ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Decision Doctrine</p>
              <p className="mt-2 text-sm text-slate-200">{result.doctrine}</p>
            </>
          ) : null}
          {result.legalDisclaimer ? <p className="mt-2 text-xs leading-6 text-amber-100/75">{result.legalDisclaimer}</p> : null}
        </div>
      )}

      {result.alternatives?.length ? (
        <div>
          <p className="mb-2 text-xs text-slate-400">All Candidates</p>
          <div className="space-y-1.5">
            {result.alternatives.slice(0, 4).map((alternative) => (
              <div key={alternative.region} className="flex items-center justify-between rounded-lg bg-slate-800/30 p-2.5 text-xs">
                <span className="font-mono text-slate-300">{alternative.region}</span>
                <div className="flex items-center gap-3">
                  <span className={getCarbonColor(getCarbonLevel(alternative.carbonIntensity))}>{alternative.carbonIntensity} gCO2/kWh</span>
                  <span className="text-slate-500">{(alternative.score * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <OpportunityInsight region={result.selectedRegion} />

      {result.decisionFrameId ? (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Info className="h-3.5 w-3.5" />
          <span>
            Frame ID <code className="font-mono text-slate-500">{result.decisionFrameId}</code>
          </span>
        </div>
      ) : null}
    </div>
  )
}

function LeaseBadge({
  leaseId,
  leaseExpiresAt,
  mustRevalidateAfter,
  onRevalidate,
  revalidating,
  revalidateResult,
}: {
  leaseId?: string
  leaseExpiresAt?: string
  mustRevalidateAfter?: string
  onRevalidate: (id: string) => void
  revalidating: boolean
  revalidateResult?: RevalidateResponse
}) {
  const expiry = useCountdown(leaseExpiresAt)
  const revalidateAt = useCountdown(mustRevalidateAfter)

  if (!leaseId && !leaseExpiresAt) return null

  return (
    <div className={`space-y-2.5 rounded-lg border p-3 ${expiry.expired ? 'border-red-500/30 bg-red-500/10' : 'border-slate-700 bg-slate-800/40'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`h-4 w-4 ${expiry.expired ? 'text-red-400' : 'text-emerald-400'}`} />
          <span className="text-xs font-medium text-slate-300">{expiry.expired ? 'Lease expired' : 'Lease valid'}</span>
        </div>
        {expiry.label && !expiry.expired ? <span className="font-mono text-xs text-emerald-400">{expiry.label} remaining</span> : null}
      </div>

      {mustRevalidateAfter && !revalidateAt.expired ? (
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            Revalidate checkpoint
          </span>
          <span className="font-mono text-yellow-400">{revalidateAt.label}</span>
        </div>
      ) : null}

      {leaseId && !expiry.expired ? (
        <button
          type="button"
          onClick={() => onRevalidate(leaseId)}
          disabled={revalidating}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {revalidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {revalidating ? 'Checking signal...' : 'Revalidate and execute'}
        </button>
      ) : null}

      {revalidateResult?.action === 'execute' ? (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle className="h-3.5 w-3.5" />
          Carbon signal confirmed and ready for execution
        </div>
      ) : null}
    </div>
  )
}
