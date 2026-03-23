'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Copy, CheckCheck, ArrowUpRight, ShieldCheck, AlertTriangle, Leaf } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { getQualityTierBadge, getStabilityColor } from '@/types'
import type {
  DekesHandoff,
  HandoffSeverity,
  HandoffStatus,
  HandoffClassification,
  DekesHandoffEventType,
} from '@/types'

// ── Badge helpers ──────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<HandoffSeverity, string> = {
  critical: 'bg-red-500/15 text-red-400 border border-red-500/30',
  high: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  medium: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  low: 'bg-slate-700/60 text-slate-400 border border-slate-600/30',
}

const STATUS_STYLES: Record<HandoffStatus, string> = {
  queued: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
  processing: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
  processed: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  ignored: 'bg-slate-700/60 text-slate-500 border border-slate-600/30',
  failed: 'bg-red-500/15 text-red-400 border border-red-500/30',
}

const CLASSIFICATION_STYLES: Record<HandoffClassification, string> = {
  opportunity: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  risk: 'bg-red-500/15 text-red-400 border border-red-500/30',
  informational: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
  no_action: 'bg-slate-700/60 text-slate-500 border border-slate-600/30',
}

const EVENT_LABELS: Partial<Record<DekesHandoffEventType, string>> = {
  BUDGET_WARNING: 'Budget Warning',
  BUDGET_EXCEEDED: 'Budget Exceeded',
  POLICY_DELAY: 'Policy Delay',
  POLICY_BLOCK: 'Policy Block',
  HIGH_CARBON_PATTERN: 'High Carbon Pattern',
  LOW_CONFIDENCE_REGION: 'Low Confidence Region',
  CLEAN_WINDOW_OPPORTUNITY: 'Clean Window Opportunity',
  PROVIDER_DISAGREEMENT_ALERT: 'Provider Disagreement',
  EXECUTION_DRIFT_RISK: 'Execution Drift Risk',
  ROUTING_POLICY_INSIGHT: 'Policy Insight',
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-800/60 last:border-0">
      <span className="text-xs text-slate-500 flex-shrink-0 w-36">{label}</span>
      <span className="text-xs text-slate-200 text-right">{children}</span>
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-700/60 hover:bg-slate-700 text-slate-400 hover:text-white text-[11px] transition ml-1"
    >
      {copied ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

interface HandoffDetailDrawerProps {
  handoff: DekesHandoff | null
  onClose: () => void
}

export function HandoffDetailDrawer({ handoff, onClose }: HandoffDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Close on backdrop click
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) onClose()
  }

  const isOpen = handoff !== null

  if (!isOpen) return null

  const h = handoff

  function fmt(iso: string) {
    try { return format(parseISO(iso), 'MMM d yyyy HH:mm:ss') + ' UTC' }
    catch { return iso }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className="absolute right-0 top-0 h-full w-full max-w-[560px] bg-slate-950 border-l border-slate-800 overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-950 border-b border-slate-800 px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={SEVERITY_STYLES[h.severity]}>
                {h.severity.toUpperCase()}
              </Badge>
              <span className="text-white font-semibold text-sm">
                {EVENT_LABELS[h.eventType] ?? h.eventType}
              </span>
              <Badge className={STATUS_STYLES[h.status]}>{h.status}</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-1">{fmt(h.timestamp)}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* IDs */}
          <section className="space-y-0">
            <Row label="Handoff ID">
              <code className="font-mono text-[11px] text-slate-300">{h.handoffId}</code>
              <CopyButton value={h.handoffId} />
            </Row>
            <Row label="Organization">
              <span className="font-mono text-slate-300">{h.organizationId}</span>
            </Row>
            {h.decisionId && (
              <Row label="Decision ID">
                <code className="font-mono text-[11px] text-slate-300">{h.decisionId}</code>
              </Row>
            )}
          </section>

          {/* Routing block */}
          {h.routing && (
            <section>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                Routing Decision
              </h4>
              <div className="bg-slate-900/60 rounded-lg border border-slate-800 divide-y divide-slate-800/60">
                <Row label="Route">
                  <span className="font-mono">
                    {h.routing.baselineRegion}
                    <span className="text-slate-600 mx-1">→</span>
                    <span className="text-emerald-400 font-semibold">{h.routing.selectedRegion}</span>
                  </span>
                </Row>
                <Row label="Carbon intensity">
                  <span className="text-white">{h.routing.carbonIntensity} gCO₂/kWh</span>
                </Row>
                <Row label="Carbon delta">
                  <span className="text-sky-400 font-semibold">
                    +{h.routing.carbonDeltaGPerKwh} gCO₂/kWh saved
                  </span>
                </Row>
                <Row label="Quality tier">
                  <Badge className={getQualityTierBadge(h.routing.qualityTier)}>
                    {h.routing.qualityTier.toUpperCase()}
                  </Badge>
                </Row>
                <Row label="Score">
                  {(h.routing.score * 100).toFixed(1)}%
                </Row>
                {h.routing.forecastStability && (
                  <Row label="Forecast stability">
                    <span className={`capitalize ${getStabilityColor(h.routing.forecastStability)}`}>
                      {h.routing.forecastStability}
                    </span>
                  </Row>
                )}
              </div>

              {/* Replay deep-link */}
              {h.decisionFrameId && (
                <div className="mt-3 flex items-center gap-3 p-3 bg-slate-800/40 rounded-lg border border-slate-700/50">
                  <ArrowUpRight className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 mb-0.5">Replay this decision in the Routing tab</p>
                    <code className="text-[11px] text-slate-300 font-mono break-all">
                      {h.decisionFrameId}
                    </code>
                  </div>
                  <CopyButton value={h.decisionFrameId} />
                </div>
              )}
            </section>
          )}

          {/* Budget block */}
          {h.budget && (
            <section>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Leaf className="w-3.5 h-3.5 text-emerald-400" />
                Budget State at Event
              </h4>
              <div className="bg-slate-900/60 rounded-lg border border-slate-800 divide-y divide-slate-800/60">
                <Row label="Status">
                  <Badge
                    className={
                      h.budget.status === 'exceeded'
                        ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                        : h.budget.status === 'warning'
                          ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    }
                  >
                    {h.budget.status.toUpperCase()}
                  </Badge>
                </Row>
                <Row label="CO₂ used">
                  {(h.budget.usedCO2Grams / 1_000_000).toFixed(2)} kg
                </Row>
                <Row label="CO₂ remaining">
                  {(h.budget.remainingCO2Grams / 1_000_000).toFixed(2)} kg
                </Row>
              </div>
            </section>
          )}

          {/* Policy block */}
          {h.policy && (h.policy.policyName || h.policy.actionTaken) && (
            <section>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-yellow-400" />
                Policy State
              </h4>
              <div className="bg-slate-900/60 rounded-lg border border-slate-800 divide-y divide-slate-800/60">
                {h.policy.policyName && (
                  <Row label="Policy">{h.policy.policyName}</Row>
                )}
                {h.policy.actionTaken && (
                  <Row label="Action taken">
                    <span className="capitalize text-orange-300">{h.policy.actionTaken}</span>
                  </Row>
                )}
              </div>
            </section>
          )}

          {/* DEKES outcome */}
          {(h.dekesClassification || h.dekesActionType || h.processedAt) && (
            <section>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-sky-400" />
                DEKES Outcome
              </h4>
              <div className="bg-slate-900/60 rounded-lg border border-slate-800 divide-y divide-slate-800/60">
                {h.dekesClassification && (
                  <Row label="Classification">
                    <Badge className={CLASSIFICATION_STYLES[h.dekesClassification]}>
                      {h.dekesClassification.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </Row>
                )}
                {h.dekesActionType && (
                  <Row label="Action type">
                    <span className="capitalize">{h.dekesActionType.replace(/_/g, ' ')}</span>
                  </Row>
                )}
                {h.dekesActionId && (
                  <Row label="Action ID">
                    <code className="font-mono text-[11px]">{h.dekesActionId}</code>
                  </Row>
                )}
                {h.processedAt && (
                  <Row label="Processed at">{fmt(h.processedAt)}</Row>
                )}
              </div>
            </section>
          )}

          {/* Explanation */}
          {h.explanation && (
            <section>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Engine Explanation
              </h4>
              <p className="text-sm text-slate-300 bg-slate-900/60 rounded-lg border border-slate-800 p-3 leading-relaxed">
                {h.explanation}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
