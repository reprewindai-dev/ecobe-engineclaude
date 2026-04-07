'use client'

import { formatDistanceStrict } from 'date-fns'
import { Activity, AlertTriangle, Globe2, Lock, Radar, RefreshCw, Shield, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import { ACTION_META } from '@/components/control-surface/action-styles'
import {
  useHallOGridCreateOverrideMutation,
  useHallOGridDoctrineMutation,
  useHallOGridDrill,
  useHallOGridFrame,
  useHallOGridOverrideStatusMutation,
  useHallOGridProWorkspace,
  useHallOGridSnapshot,
} from '@/lib/hooks/control-surface'
import type {
  ControlSurfaceProviderNode,
  HallOGridBusinessImpact,
  HallOGridConsoleAccess,
  HallOGridCounterfactual,
  HallOGridDoctrineSummary,
  HallOGridDrillRun,
  HallOGridFrame,
  HallOGridFrameDetail,
  HallOGridHazardEvent,
  HallOGridMirrorPosture,
  HallOGridOverrideRecord,
  HallOGridProWorkspace,
  WorldRegionState,
  WorldRoutingFlow,
} from '@/types/control-surface'

type Panel = 'trace' | 'replay' | 'proof'

const DESKTOP_HEADER_HEIGHT = 58
const DESKTOP_STRIP_HEIGHT = 34
const MOBILE_HEADER_HEIGHT = 48
const MOBILE_STRIP_HEIGHT = 30

function shellHeaderHeight(mobile: boolean) {
  return mobile ? MOBILE_HEADER_HEIGHT : DESKTOP_HEADER_HEIGHT
}

function shellStripHeight(mobile: boolean) {
  return mobile ? MOBILE_STRIP_HEIGHT : DESKTOP_STRIP_HEIGHT
}

function shellSceneTop(mobile: boolean) {
  return shellHeaderHeight(mobile) + shellStripHeight(mobile) + 12
}

const PRO_SURFACES = [
  'Counterfactual analysis',
  'Replay workspace',
  'Doctrine manager',
  'Override queue',
  'Safety envelope',
  'Hazard and near-miss registry',
  'Compliance cockpit',
  'Drill simulator',
  'Business impact analytics',
] as const

const P = {
  bg0: '#050608',
  bg1: '#0b0d14',
  bg2: '#10131c',
  glass: 'rgba(12,14,22,0.68)',
  glass2: 'rgba(20,23,34,0.82)',
  border: 'rgba(255,255,255,0.08)',
  borderLit: 'rgba(255,255,255,0.14)',
  t0: '#eef0fa',
  t1: '#b4bad0',
  t2: '#687294',
  t3: '#3a4168',
  accent: '#4d8dff',
}

const A: Record<HallOGridFrame['action'], string> = {
  run_now: '#00e68a',
  reroute: '#ffb833',
  delay: '#a78bfa',
  throttle: '#7c9dff',
  deny: '#ff4d6a',
}

const TABS = [
  ['trace', 'Trace', Activity],
  ['replay', 'Replay', RefreshCw],
  ['proof', 'Proof', Lock],
] as const

const WORLD_STATE_META: Record<
  WorldRegionState['state'],
  { label: string; color: string; rhythm: string; detail: string }
> = {
  active: {
    label: 'Live',
    color: A.run_now,
    rhythm: 'Fast pulse',
    detail: 'Region is healthy and ready for governed execution now.',
  },
  marginal: {
    label: 'Guarded',
    color: A.reroute,
    rhythm: 'Slow pulse',
    detail: 'Region remains usable, but the mirror is signaling caution.',
  },
  blocked: {
    label: 'Blocked',
    color: A.deny,
    rhythm: 'Static hold',
    detail: 'Region is constrained or denied by the current policy envelope.',
  },
}

const hex = (c: string, o: number) => `${c}${Math.round(o * 255).toString(16).padStart(2, '0')}`

const ago = (v: string, now = Date.now()) => {
  try {
    return formatDistanceStrict(new Date(v), now, { addSuffix: true })
  } catch {
    return v
  }
}

function useRelativeClock(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(interval)
  }, [intervalMs])

  return now
}

function RelativeTime({ value, style }: { value: string; style?: CSSProperties }) {
  const now = useRelativeClock()
  return <span style={style}>{ago(value, now)}</span>
}

const ms = (v: number | null | undefined) => (v == null ? 'Unavailable' : `${v.toFixed(0)}ms`)
const liters = (v: number | null | undefined) =>
  v == null ? 'Unavailable' : `${v > 0 ? '+' : ''}${Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1)} L`
const shortHash = (v: string | null | undefined, len = 20) =>
  !v ? 'Unavailable' : v.length <= len ? v : `${v.slice(0, len)}...`
const confidenceGrade = (v: number | null | undefined) =>
  v == null ? '--' : v >= 90 ? 'A' : v >= 80 ? 'B' : v >= 70 ? 'C' : 'D'

const shortFreshness = (label: string) =>
  label
    .replace(/Carbon /gi, 'C ')
    .replace(/Water /gi, 'W ')
    .replace(/\s*\|\s*/g, ' | ')

const compactDecisionRead = (frame: HallOGridFrame | null) => {
  if (!frame) return 'Select a region to read decision posture.'
  const action = ACTION_META[frame.action].label
  const constraint = frame.explanation.dominantConstraint || frame.reasonLabel
  return `${action}: ${constraint}`.replace(/\s+/g, ' ').trim()
}

function regionRingDash(node: WorldRegionState) {
  if (node.confidenceTier === 'low') return '4 6'
  if (node.confidenceTier === 'medium') return '10 6'
  return undefined
}

function regionRingOpacity(node: WorldRegionState) {
  if (node.confidenceTier === 'high') return 0.9
  if (node.confidenceTier === 'medium') return 0.65
  return 0.45
}

function regionPulse(node: WorldRegionState, reducedMotion: boolean) {
  if (reducedMotion) return 'none'
  if (node.freshnessState === 'stale' || node.confidenceTier === 'low') {
    return 'hallogrid-beacon-irregular 2.4s steps(5, end) infinite'
  }
  if (node.state === 'active') return 'hallogrid-beacon-fast 1.4s ease-in-out infinite'
  if (node.state === 'marginal') return 'hallogrid-beacon-slow 2.8s ease-in-out infinite'
  return 'none'
}

function pressureGlow(node: WorldRegionState) {
  if (node.pressureLevel === 'high') return 0.24
  if (node.pressureLevel === 'medium') return 0.16
  return 0.1
}

function worldStateColor(node: WorldRegionState) {
  if (node.action && node.action in A) return A[node.action as HallOGridFrame['action']]
  if (node.state === 'active') return A.run_now
  if (node.state === 'marginal') return A.reroute
  return A.deny
}

function confidenceColor(value: number | null | undefined) {
  if (value == null) return P.t2
  if (value >= 85) return A.run_now
  if (value >= 68) return A.reroute
  return A.deny
}

function providerStatusColor(status: ControlSurfaceProviderNode['status']) {
  if (status === 'healthy') return A.run_now
  if (status === 'degraded') return A.reroute
  return A.deny
}

function BackgroundGrid({ active, color, mousePos }: { active: boolean; color: string; mousePos?: { x: number; y: number } }) {
  const mx = mousePos?.x ?? 0
  const my = mousePos?.y ?? 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          top: '30%',
          left: '-25%',
          width: '150%',
          height: '150%',
          backgroundSize: '50px 50px',
          backgroundImage:
            'linear-gradient(to right, rgba(100,140,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,140,255,0.04) 1px, transparent 1px)',
          transform: `rotateX(65deg) scale(2) translate(${mx * -30}px, ${my * -30}px)`,
          transformOrigin: 'top center',
          opacity: active ? 0.9 : 0.35,
          transition: 'opacity 1s ease, filter 1s ease, transform 0.4s cubic-bezier(0.16,1,0.3,1)',
          filter: active ? `drop-shadow(0 0 30px ${hex(color, 0.15)})` : 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 70% 40% at 50% 0%, ${hex(P.accent, 0.07)} 0%, transparent 70%), radial-gradient(ellipse 50% 50% at 80% 90%, ${hex(A.run_now, 0.04)} 0%, transparent 50%), radial-gradient(ellipse 40% 40% at 15% 70%, ${hex(A.delay, 0.03)} 0%, transparent 50%)`,
          opacity: active ? 1.1 : 0.72,
        }}
      />
      {active ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse 60% 40% at 50% 50%, ${hex(color, 0.06)} 0%, transparent 60%)`,
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          width: '180vw',
          height: '180vh',
          top: '-40%',
          left: '-40%',
          background: `radial-gradient(circle at 50% 50%, ${hex(P.accent, 0.03)} 0%, transparent 35%)`,
          animation: 'hallogrid-breathe 14s ease-in-out infinite',
        }}
      />
    </div>
  )
}

function HeaderBar({
  title,
  subtitle,
  streamHealthy,
  generatedAt,
  mobile,
  access,
  mirror,
}: {
  title: string
  subtitle: string
  streamHealthy: boolean
  generatedAt: string
  mobile: boolean
  access: HallOGridConsoleAccess
  mirror: HallOGridMirrorPosture
}) {
  const headerHeight = shellHeaderHeight(mobile)

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 120,
        height: headerHeight,
        padding: mobile ? '0 12px' : '0 20px',
        background: `linear-gradient(180deg, ${P.bg1}f2 0%, ${P.bg1}cf 100%)`,
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderBottom: `1px solid ${P.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        marginLeft: mobile ? -12 : 0,
        marginRight: mobile ? -12 : 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 10 : 12, minWidth: 0 }}>
        <div style={{ position: 'relative' }}>
          <div style={{ width: 8, height: 8, borderRadius: '999px', background: A.run_now }} />
          <div
            style={{
              position: 'absolute',
              inset: -4,
              borderRadius: '999px',
              background: hex(A.run_now, 0.35),
              animation: 'hallogrid-pulse 2.5s ease-in-out infinite',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--m)', fontSize: mobile ? 10 : 11, letterSpacing: '0.12em', flexWrap: mobile ? 'wrap' : 'nowrap' }}>
            <span style={{ color: P.t0, fontWeight: 700 }}>CO2 ROUTER</span>
            <span style={{ padding: '3px 9px', borderRadius: 999, border: `1px solid ${hex(P.accent, 0.28)}`, background: hex(P.accent, 0.08), color: '#dbeafe' }}>
              {access.isReadOnlyPreview ? 'PREVIEW CONSOLE' : 'OPERATOR CONSOLE'}
            </span>
            {!mobile ? <span style={{ color: P.accent }}>HALLOGRID</span> : null}
          </div>
          <div style={{ color: P.t1, fontSize: mobile ? 11 : 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title} | {subtitle}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 8 : 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, border: `1px solid ${streamHealthy ? hex(A.run_now, 0.24) : hex(A.reroute, 0.28)}`, background: streamHealthy ? hex(A.run_now, 0.08) : hex(A.reroute, 0.1), color: streamHealthy ? '#d1fae5' : '#fde68a', fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em' }}>
          <Radar size={12} />
          {streamHealthy ? access.label.toUpperCase() : 'FALLBACK PATH'}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, border: `1px solid ${mirror.degraded ? hex(A.reroute, 0.28) : hex(P.accent, 0.2)}`, background: mirror.degraded ? hex(A.reroute, 0.1) : hex(P.accent, 0.08), color: mirror.degraded ? '#fde68a' : '#dbeafe', fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em' }}>
          {mirror.mirrorMode.toUpperCase()} MIRROR | {mirror.sourceFreshnessSec == null ? 'FRESHNESS N/A' : `${mirror.sourceFreshnessSec}s`}
        </div>
        {!mobile && !access.isReadOnlyPreview ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, border: `1px solid ${hex(A.run_now, 0.18)}`, background: hex(A.run_now, 0.08), color: '#d1fae5', fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em' }}>
            <Shield size={12} />
            {access.mode === 'pro_production' ? 'PRODUCTION AUTHORITY' : 'EVAL AUTHORITY'}
          </div>
        ) : null}
        {!mobile ? (
          <div style={{ color: P.t2, fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.06em' }}>
            REFRESHED <RelativeTime value={generatedAt} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function UpgradeStrip({ access }: { access: HallOGridConsoleAccess }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 16px',
        borderRadius: 18,
        border: `1px solid ${hex(P.accent, 0.18)}`,
        background: `linear-gradient(135deg, ${hex(P.accent, 0.08)} 0%, ${hex('#020309', 0.94)} 72%)`,
        boxShadow: `0 16px 32px ${hex('#000000', 0.2)}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.12em', color: '#dbeafe' }}>
          <Sparkles size={12} />
          {access.isReadOnlyPreview ? 'LIVE MIRROR | PRO UNLOCKS THE OPERATOR SURFACE' : 'PRO SURFACE | TENANT-AWARE AUTHORITY ACTIVE'}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: P.t1, lineHeight: 1.6 }}>
          {access.isReadOnlyPreview
            ? `This public mirror stays delayed and redacted. HallOGrid Pro unlocks ${access.proHighlights.join(', ')}.`
            : `Entitlements active: ${access.entitlements.join(', ')}. Role: ${access.role.replace(/_/g, ' ')}.`}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {access.upgradePrompts.map((prompt) => (
          <a
            key={prompt}
            href={access.upgradeUrl}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 11px',
              borderRadius: 999,
              border: `1px solid ${hex(P.accent, 0.22)}`,
              background: hex('#ffffff', 0.04),
              color: '#dbeafe',
              fontFamily: 'var(--m)',
              fontSize: 10,
              letterSpacing: '0.08em',
              textDecoration: 'none',
            }}
          >
            {prompt}
          </a>
        ))}
      </div>
    </div>
  )
}

function LockedSurfacePanel({
  access,
  selectedFrame,
}: {
  access: HallOGridConsoleAccess
  selectedFrame: HallOGridFrame | null
}) {
  return (
    <div
      style={{
        minHeight: '100%',
        padding: '24px',
        borderRadius: 24,
        border: `1px solid ${P.border}`,
        background: `linear-gradient(180deg, ${P.glass2} 0%, ${P.glass} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 999, border: `1px solid ${hex(P.accent, 0.24)}`, background: hex(P.accent, 0.1), color: '#dbeafe', fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em' }}>
          <Lock size={12} />
          PRO SURFACE
        </div>
        <div style={{ marginTop: 14, fontSize: 20, fontWeight: 700, color: P.t0 }}>
          {selectedFrame ? 'Operator detail stays inside HallOGrid Pro.' : 'Select a governed record to see what Pro unlocks.'}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: P.t1, lineHeight: 1.7 }}>
          {selectedFrame
            ? `This preview lets you inspect the live mirror. Full trace, replay, proof export, counterfactuals, override controls, and doctrine actions require Pro access for tenant-safe routing.`
            : 'The public preview proves live credibility. The paid surface is where Platform/SRE teams inspect proof, manage doctrine, and govern real workloads.'}
        </div>
      </div>

      {selectedFrame ? (
        <div style={{ padding: '14px 16px', borderRadius: 16, background: hex('#ffffff', 0.035), border: `1px solid ${P.border}` }}>
          <div style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3, letterSpacing: '0.1em' }}>PREVIEWED FRAME</div>
          <div style={{ marginTop: 8, fontSize: 17, fontWeight: 700, color: P.t0 }}>{selectedFrame.explanation.headline}</div>
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 10, fontFamily: 'var(--m)', fontSize: 10, color: P.t2 }}>
            <span>{selectedFrame.region}</span>
            <span>{ACTION_META[selectedFrame.action].label.toUpperCase()}</span>
            <span>{ms(selectedFrame.metrics.totalLatencyMs)}</span>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        {PRO_SURFACES.map((surface) => (
          <div key={surface} style={{ padding: '12px 14px', borderRadius: 16, background: hex('#ffffff', 0.03), border: `1px solid ${P.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dbeafe' }}>
              <Lock size={13} />
              <span style={{ fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em' }}>PRO</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: P.t1 }}>{surface}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {access.upgradePrompts.map((prompt) => (
          <a
            key={prompt}
            href={access.upgradeUrl}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 14px',
              borderRadius: 999,
              border: `1px solid ${hex(P.accent, 0.24)}`,
              background: hex(P.accent, 0.12),
              color: '#dbeafe',
              textDecoration: 'none',
              fontFamily: 'var(--m)',
              fontSize: 10,
              letterSpacing: '0.08em',
            }}
          >
            {prompt}
          </a>
        ))}
      </div>
    </div>
  )
}

function ProMetric({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: string
}) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 14,
        border: `1px solid ${hex(accent, 0.2)}`,
        background: `linear-gradient(180deg, ${hex(accent, 0.08)} 0%, ${hex('#ffffff', 0.025)} 100%)`,
      }}
    >
      <div style={{ fontFamily: 'var(--m)', fontSize: 9, letterSpacing: '0.1em', color: P.t3 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: P.t0 }}>{value}</div>
    </div>
  )
}

function CounterfactualCard({ item }: { item: HallOGridCounterfactual }) {
  const statusColor =
    item.status === 'selected' ? A.run_now : item.status === 'blocked' ? A.deny : A.reroute

  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 16,
        border: `1px solid ${hex(statusColor, 0.2)}`,
        background: `linear-gradient(180deg, ${hex(statusColor, 0.08)} 0%, ${hex('#ffffff', 0.025)} 100%)`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: 'var(--m)', fontSize: 9, letterSpacing: '0.1em', color: P.t3 }}>{item.label.toUpperCase()}</div>
          <div style={{ marginTop: 6, fontSize: 16, fontWeight: 700, color: P.t0 }}>{item.region}</div>
        </div>
        <div style={{ padding: '5px 8px', borderRadius: 999, border: `1px solid ${hex(statusColor, 0.28)}`, background: hex(statusColor, 0.12), color: statusColor, fontFamily: 'var(--m)', fontSize: 9, letterSpacing: '0.08em' }}>
          {item.status.toUpperCase()}
        </div>
      </div>
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <ProMetric label="CARBON DELTA" value={`${item.carbonDeltaPct > 0 ? '+' : ''}${item.carbonDeltaPct.toFixed(1)}%`} accent={A.run_now} />
        <ProMetric label="COST DELTA" value={`${item.costDeltaPct > 0 ? '+' : ''}${item.costDeltaPct.toFixed(1)}%`} accent={A.reroute} />
        <ProMetric label="LATENCY DELTA" value={`${item.latencyDeltaMs} ms`} accent={A.delay} />
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: P.t1, lineHeight: 1.7 }}>{item.rationale}</div>
      <div style={{ marginTop: 8, fontFamily: 'var(--m)', fontSize: 10, color: P.t2 }}>
        {ACTION_META[item.action].label.toUpperCase()} | RISK {item.riskLevel.toUpperCase()}
      </div>
    </div>
  )
}

function OverrideCard({ item }: { item: HallOGridOverrideRecord }) {
  const accent = item.status === 'active' ? A.run_now : item.status === 'expired' ? A.deny : A.reroute

  return (
    <div style={{ padding: '12px 14px', borderRadius: 14, border: `1px solid ${hex(accent, 0.18)}`, background: hex('#ffffff', 0.03) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: P.t0 }}>{item.requestedAction.replace(/_/g, ' ')}</div>
          <div style={{ marginTop: 4, fontFamily: 'var(--m)', fontSize: 10, color: P.t2 }}>{item.scope}</div>
        </div>
        <div style={{ padding: '5px 8px', borderRadius: 999, border: `1px solid ${hex(accent, 0.22)}`, background: hex(accent, 0.1), color: accent, fontFamily: 'var(--m)', fontSize: 9, letterSpacing: '0.08em' }}>
          {item.status.toUpperCase()}
        </div>
      </div>
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, fontSize: 11, color: P.t1 }}>
        <div>
          <div style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3 }}>REASON</div>
          <div style={{ marginTop: 4 }}>{item.reasonCode}</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3 }}>REQUESTED BY</div>
          <div style={{ marginTop: 4 }}>{item.requestedBy}</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3 }}>TICKET</div>
          <div style={{ marginTop: 4 }}>{item.ticketRef}</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3 }}>EXPIRES</div>
            <div style={{ marginTop: 4 }}>{item.expiresAt ? <RelativeTime value={item.expiresAt} /> : 'No expiry'}</div>
        </div>
      </div>
    </div>
  )
}

function HazardCard({ item }: { item: HallOGridHazardEvent }) {
  const accent = item.severity === 'critical' ? A.deny : item.severity === 'warning' ? A.reroute : P.accent

  return (
    <div style={{ padding: '12px 14px', borderRadius: 14, border: `1px solid ${hex(accent, 0.18)}`, background: hex(accent, 0.05) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: P.t0 }}>{item.summary}</div>
          <div style={{ marginTop: 6, fontFamily: 'var(--m)', fontSize: 10, color: P.t2 }}>
            {(item.region ?? 'Global').toUpperCase()} | {item.type.replace(/_/g, ' ').toUpperCase()}
          </div>
        </div>
        <div style={{ padding: '5px 8px', borderRadius: 999, border: `1px solid ${hex(accent, 0.22)}`, background: hex(accent, 0.1), color: accent, fontFamily: 'var(--m)', fontSize: 9, letterSpacing: '0.08em' }}>
          {item.status.toUpperCase()}
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: P.t1 }}>
        Detected <RelativeTime value={item.detectedAt} />
      </div>
    </div>
  )
}

function BusinessImpactGrid({ impact }: { impact: HallOGridBusinessImpact }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
      <ProMetric label="AVOIDED CO2" value={`${impact.avoidedCo2Kg.toFixed(1)} kg`} accent={A.run_now} />
      <ProMetric label="AVOIDED COST" value={`$${impact.avoidedCostUsd.toFixed(0)}`} accent={P.accent} />
      <ProMetric label="SLO BREACHES" value={String(impact.avoidedSloBreaches)} accent={A.reroute} />
      <ProMetric label="ALERTS ABSORBED" value={String(impact.alertsAbsorbed)} accent={A.delay} />
      <ProMetric label="OPERATOR RELIEF" value={`${impact.operatorHoursRecovered.toFixed(1)} hrs`} accent={A.run_now} />
    </div>
  )
}

function TelemetryStrip({ frames, mobile }: { frames: HallOGridFrame[]; mobile: boolean }) {
  const s = useMemo(() => {
    const counts = { run_now: 0, deny: 0, reroute: 0, delay: 0, throttle: 0 }
    let lat = 0
    let latN = 0
    let conf = 0
    let confN = 0
    frames.forEach((f) => {
      counts[f.action] += 1
      if (f.metrics.totalLatencyMs != null) {
        lat += f.metrics.totalLatencyMs
        latN += 1
      }
      if (f.metrics.signalConfidence != null) {
        conf += f.metrics.signalConfidence
        confN += 1
      }
    })
    return { ...counts, latency: latN ? Math.round(lat / latN) : null, confidence: confN ? conf / confN : null }
  }, [frames])

  const items = [
    { key: 'run_now', label: 'RUN NOW', value: s.run_now, color: A.run_now, pulse: s.run_now > 0 },
    { key: 'deny', label: 'DENY', value: s.deny, color: A.deny, pulse: false },
    { key: 'reroute', label: 'REROUTE', value: s.reroute, color: A.reroute, pulse: false },
    { key: 'delay', label: 'DELAY', value: s.delay, color: A.delay, pulse: false },
    { key: 'throttle', label: 'THROTTLE', value: s.throttle, color: A.throttle, pulse: false },
  ] as const

  const stripHeight = shellStripHeight(mobile)
  const top = shellHeaderHeight(mobile)

  return (
    <div
      style={{
        position: 'sticky',
        top,
        zIndex: 118,
        height: stripHeight,
        padding: mobile ? '0 12px' : '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: mobile ? 10 : 16,
        borderBottom: `1px solid ${P.border}`,
        background: `linear-gradient(180deg, ${P.bg2}ed 0%, ${P.bg1}cf 100%)`,
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        marginLeft: mobile ? -12 : 0,
        marginRight: mobile ? -12 : 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 12 : 16, overflowX: 'auto', scrollbarWidth: 'none', fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.1em', whiteSpace: 'nowrap', minWidth: 0 }}>
        {items.map((item) => {
          const active = item.value > 0
          return (
            <div key={item.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: active ? item.color : hex(item.color, 0.56), textShadow: item.pulse ? `0 0 12px ${hex(item.color, 0.42)}` : 'none' }}>
              <span style={{ fontWeight: 700, animation: item.pulse ? 'hallogrid-pulse-soft 2.6s ease-in-out infinite' : 'none' }}>{item.value}</span>
              <span style={{ color: active ? P.t1 : P.t3 }}>{item.label}</span>
            </div>
          )
        })}
      </div>
      {!mobile ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, color: P.t2, fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em' }}>
          <span style={{ color: '#dbeafe' }}>{s.latency != null ? `${s.latency}MS` : 'LAT N/A'}</span>
          <span style={{ color: confidenceColor(s.confidence), fontWeight: 700 }}>
            CONF {s.confidence != null ? s.confidence.toFixed(1) : '--'}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function FeedCard({
  f,
  active,
  anyActive,
  onTap,
  priority,
}: {
  f: HallOGridFrame
  active: boolean
  anyActive: boolean
  onTap: (id: string) => void
  priority: boolean
}) {
  const c = A[f.action]
  const meta = ACTION_META[f.action]
  const conf = f.metrics.signalConfidence
  const confColor = confidenceColor(conf)

  return (
    <button
      type="button"
      onClick={() => onTap(f.id)}
      style={{
        cursor: 'pointer',
        width: '100%',
        padding: '16px 18px',
        position: 'relative',
        overflow: 'hidden',
        textAlign: 'left',
        background: active ? `linear-gradient(145deg, ${hex(c, 0.14)} 0%, ${P.glass2} 100%)` : P.glass,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: `1px solid ${active ? hex(c, 0.42) : priority ? hex(c, 0.18) : P.border}`,
        borderRadius: 14,
        boxShadow: active ? `0 0 18px ${hex(c, 0.16)}, 0 10px 28px rgba(0,0,0,0.48), inset 0 1px 0 ${hex(c, 0.12)}` : priority ? `0 4px 16px ${hex(c, 0.08)}` : '0 4px 16px rgba(0,0,0,0.34)',
        transform: active ? 'scale(1.018) translateZ(34px)' : anyActive ? 'scale(0.985)' : priority ? 'scale(1.004)' : 'scale(1)',
        opacity: anyActive && !active ? 0.56 : priority || active ? 1 : 0.86,
        transition: 'all 0.35s cubic-bezier(0.16,1,0.3,1)',
      }}
      aria-expanded={active}
    >
      <div style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 999, background: c, boxShadow: active ? `0 0 10px ${hex(c, 0.55)}` : priority ? `0 0 6px ${hex(c, 0.24)}` : 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--m)', fontSize: 10, color: P.t2, letterSpacing: '0.05em' }}>{f.id}</span>
        <div style={{ fontFamily: 'var(--m)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: c, padding: '3px 12px', borderRadius: 999, background: hex(c, 0.12), border: `1px solid ${hex(c, 0.25)}` }}>{meta.label.toUpperCase()}</div>
      </div>
      <div style={{ paddingLeft: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: P.t0, letterSpacing: '-0.01em' }}>{f.explanation.headline}</div>
        <div style={{ fontSize: 11, color: P.t2, marginTop: 3 }}>
          {f.region} | {f.workloadClass}
          {f.trust.degraded ? <span style={{ color: A.reroute, marginLeft: 8 }}>guarded</span> : null}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingLeft: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at 30% 30%, ${hex(confColor, 0.24)} 0%, ${hex(confColor, 0.08)} 100%)`, border: `1.5px solid ${hex(confColor, 0.45)}`, boxShadow: `0 0 12px ${hex(confColor, 0.2)}` }}>
            <span style={{ fontFamily: 'var(--m)', fontSize: 10, fontWeight: 700, color: confColor }}>{confidenceGrade(conf)}</span>
          </div>
          <div>
            <span style={{ fontFamily: 'var(--m)', fontSize: 13, fontWeight: 700, color: confColor }}>{conf != null ? conf.toFixed(1) : '--'}</span>
            <span style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3, marginLeft: 4 }}>CONF</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {[f.traceState === 'locked', f.proofState === 'available', f.replayState === 'verified'].map((ok, index) => (
              <div key={index} style={{ width: 5, height: 5, borderRadius: '50%', background: ok ? A.run_now : A.deny, boxShadow: `0 0 5px ${hex(ok ? A.run_now : A.deny, 0.5)}` }} />
            ))}
            <span style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3, marginLeft: 2 }}>proof</span>
          </div>
          <span style={{ fontFamily: 'var(--m)', fontSize: 10, color: P.t3 }}>{ms(f.metrics.totalLatencyMs)}</span>
          <RelativeTime value={f.createdAt} style={{ fontFamily: 'var(--m)', fontSize: 10, color: P.t3 }} />
        </div>
      </div>
    </button>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: hex('#ffffff', 0.04), border: `1px solid ${P.border}` }}><div style={{ fontFamily: 'var(--m)', fontSize: 10, color: P.t3, letterSpacing: '0.08em', marginBottom: 8 }}>{title}</div>{children}</div>
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '5px 0' }}><span style={{ fontSize: 11, color: P.t2 }}>{label}</span><span style={{ fontSize: 11, color: color ?? P.t1, fontFamily: 'var(--m)', fontWeight: 500, textAlign: 'right' }}>{value}</span></div>
}

function Bar({ label, value }: { label: string; value: number | null | undefined }) {
  const amount = value ?? 0
  const width = Math.min(amount, 100)
  const color = amount >= 85 ? A.run_now : amount >= 70 ? A.reroute : A.deny

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: P.t2, textTransform: 'capitalize' }}>{label}</span>
        <span style={{ fontSize: 10, color: P.t2, fontFamily: 'var(--m)' }}>{value == null ? 'Unavailable' : value.toFixed(1)}</span>
      </div>
      <div style={{ height: 4, borderRadius: 3, background: hex('#ffffff', 0.04) }}>
        <div style={{ height: '100%', borderRadius: 3, width: `${width}%`, background: `linear-gradient(90deg, ${color}, ${hex(color, 0.6)})`, boxShadow: `0 0 10px ${hex(color, 0.35)}` }} />
      </div>
    </div>
  )
}

type ProjectedNode = {
  node: WorldRegionState
  screenX: number
  screenY: number
  depth: number
  opacity: number
  scale: number
  color: string
}

function spreadProjectedNodes(items: ProjectedNode[], center: number, radius: number, minDistance: number): ProjectedNode[] {
  if (items.length <= 1) return items

  const next = items.map((item) => ({ ...item }))
  const limit = radius * 0.86

  for (let pass = 0; pass < 8; pass += 1) {
    for (let i = 0; i < next.length; i += 1) {
      for (let j = i + 1; j < next.length; j += 1) {
        const a = next[i]
        const b = next[j]
        const dx = b.screenX - a.screenX
        const dy = b.screenY - a.screenY
        const distance = Math.hypot(dx, dy) || 0.001

        if (distance >= minDistance) continue

        const overlap = (minDistance - distance) / 2
        const ux = dx / distance
        const uy = dy / distance

        a.screenX -= ux * overlap
        a.screenY -= uy * overlap
        b.screenX += ux * overlap
        b.screenY += uy * overlap
      }
    }

    for (const item of next) {
      const offsetX = item.screenX - center
      const offsetY = item.screenY - center
      const distance = Math.hypot(offsetX, offsetY) || 0.001

      if (distance > limit) {
        const scale = limit / distance
        item.screenX = center + offsetX * scale
        item.screenY = center + offsetY * scale
      }
    }
  }

  return next
}

interface HallOGridTheaterProps {
  nodes: WorldRegionState[]
  flows: WorldRoutingFlow[]
  providers: ControlSurfaceProviderNode[]
  selectedRegion: string | null
  selectedFrame: HallOGridFrame | null
  projectionLagSec: number | null
  streamHealthy: boolean
  expanded: boolean
  mobile: boolean
  onSelectRegion: (node: WorldRegionState) => void
}

function HallOGridTheater({
  nodes,
  flows,
  providers,
  selectedRegion,
  selectedFrame,
  projectionLagSec,
  streamHealthy,
  expanded,
  mobile,
  onSelectRegion,
}: HallOGridTheaterProps) {
  const [rotation, setRotation] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [showDesktopGuide, setShowDesktopGuide] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [focusPulse, setFocusPulse] = useState(0)
  const focusActive = selectedRegion != null

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || reducedMotion) return
    const interval = window.setInterval(() => {
      setRotation((current) => (current + (mobile ? 0.1 : expanded ? 0.18 : 0.12) + focusPulse * 0.05) % 360)
    }, 80)
    return () => window.clearInterval(interval)
  }, [expanded, focusPulse, mobile, reducedMotion])

  useEffect(() => {
    if ((!selectedRegion && !selectedFrame?.id) || reducedMotion) {
      setFocusPulse(0)
      return
    }

    setFocusPulse(1)
    const settleTimer = window.setTimeout(() => setFocusPulse(0.28), 300)
    const clearTimer = window.setTimeout(() => setFocusPulse(0), 1400)

    return () => {
      window.clearTimeout(settleTimer)
      window.clearTimeout(clearTimer)
    }
  }, [reducedMotion, selectedFrame?.id, selectedRegion])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mobile || reducedMotion) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    setMousePos({ x, y })
  }

  const handleMouseLeave = () => setMousePos({ x: 0, y: 0 })

  const globeSize = mobile ? 510 : 720
  const radiusBoost = Math.round(focusPulse * (mobile ? 16 : 30))
  const radius = mobile ? 210 + radiusBoost : (expanded ? 298 : 236) + radiusBoost
  const center = globeSize / 2
  const glowRadius = radius + (expanded ? 16 : 12) + Math.round(focusPulse * 8)

  const projected = useMemo<ProjectedNode[]>(() => {
    const raw = nodes
      .map((node) => {
        const lon = (node.x / 100) * 360 - 180
        const lat = 90 - (node.y / 100) * 180
        const lonRad = ((lon + rotation) * Math.PI) / 180
        const latRad = (lat * Math.PI) / 180
        const x = Math.cos(latRad) * Math.sin(lonRad)
        const y = Math.sin(latRad)
        const z = Math.cos(latRad) * Math.cos(lonRad)

        return {
          node,
          screenX: center + radius * x,
          screenY: center - radius * y,
          depth: z,
          opacity: Math.max(0.16, 0.32 + ((z + 1) / 2) * 0.88),
          scale: 0.58 + ((z + 1) / 2) * 0.72,
          color: worldStateColor(node),
        }
      })
      .sort((a, b) => a.depth - b.depth)

    if (raw.length <= 1) return raw

    const xs = raw.map((item) => item.screenX)
    const ys = raw.map((item) => item.screenY)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const spanX = Math.max(maxX - minX, 1)
    const spanY = Math.max(maxY - minY, 1)
    const spreadX = mobile ? 0.86 : 0.8
    const spreadY = mobile ? 0.82 : 0.72
    const vBias = mobile ? radius * 0.1 : 0
    const targetMinX = center - radius * spreadX
    const targetMaxX = center + radius * spreadX
    const targetMinY = center - radius * spreadY + vBias
    const targetMaxY = center + radius * spreadY + vBias

    const normalized = raw.map((item) => ({
      ...item,
      screenX:
        targetMinX + ((item.screenX - minX) / spanX) * (targetMaxX - targetMinX),
      screenY:
        targetMinY + ((item.screenY - minY) / spanY) * (targetMaxY - targetMinY),
    }))

    return spreadProjectedNodes(normalized, center, radius, mobile ? 72 : 48)
  }, [center, mobile, nodes, radius, rotation])

  const visibleByRegion = useMemo(() => new Map(projected.map((item) => [item.node.region, item])), [projected])

  const flowPaths = useMemo(() => {
    return flows
      .map((flow) => {
        const from = visibleByRegion.get(flow.fromRegion)
        const to = visibleByRegion.get(flow.toRegion)
        if (!from || !to) return null
        if (from.depth < 0.02 || to.depth < 0.02) return null

        const connectedToSelection =
          selectedRegion != null && (flow.fromRegion === selectedRegion || flow.toRegion === selectedRegion)

        const controlX = (from.screenX + to.screenX) / 2
        const controlY =
          Math.min(from.screenY, to.screenY) -
          24 -
          Math.abs(from.screenX - to.screenX) * 0.08 -
          Math.abs(from.screenY - to.screenY) * 0.06

        return {
          id: flow.id,
          d: `M ${from.screenX} ${from.screenY} Q ${controlX} ${controlY} ${to.screenX} ${to.screenY}`,
          color: flow.mode === 'blocked' ? A.deny : connectedToSelection ? '#dbeafe' : hex(P.accent, 0.72),
          opacity:
            Math.min(from.opacity, to.opacity) *
            (flow.mode === 'blocked' ? 0.82 : connectedToSelection ? 0.95 : 0.34),
          width: connectedToSelection ? 2.35 : 1.1,
          mode: flow.mode,
          dashSpeed: flow.mode === 'blocked' ? 0 : connectedToSelection ? 1.6 : 3.8,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item != null)
  }, [flows, selectedRegion, visibleByRegion])

  const activeCount = nodes.filter((node) => node.state === 'active').length
  const guardedCount = nodes.filter((node) => node.state === 'marginal').length
  const blockedCount = nodes.filter((node) => node.state === 'blocked').length
  const selectedNode = selectedRegion ? nodes.find((node) => node.region === selectedRegion) ?? null : null
  const selectedState = selectedNode ? WORLD_STATE_META[selectedNode.state] : null
  const connectedFlows = selectedRegion
    ? flows.filter((flow) => flow.fromRegion === selectedRegion || flow.toRegion === selectedRegion)
    : []
  const blockedFocusFlowCount = connectedFlows.filter((flow) => flow.mode === 'blocked').length
  const actionableNodes = projected.filter((item) => item.depth >= 0.02).sort((a, b) => b.depth - a.depth)
  const frontLineNodes = actionableNodes.slice(0, 5)
  const regionRailNodes = mobile ? nodes : frontLineNodes.map((item) => item.node)
  const providerMesh = providers.slice(0, 6).map((provider, index, list) => {
    const angle = (-110 + (220 / Math.max(list.length - 1, 1)) * index) * (Math.PI / 180)
    const orbitX = center + Math.cos(angle) * (radius + 54)
    const orbitY = center + Math.sin(angle) * (radius * 0.76 + 44)
    return { provider, x: orbitX, y: orbitY, color: providerStatusColor(provider.status) }
  })
  const healthyProviders = providers.filter((provider) => provider.status === 'healthy').length
  const degradedProviders = providers.filter((provider) => provider.status === 'degraded').length
  const offlineProviders = Math.max(0, providers.length - healthyProviders - degradedProviders)
  const providerNodes = mobile ? [] : selectedNode ? providerMesh.slice(0, Math.min(providerMesh.length, 4)) : []
  const selectedDecisionRead = compactDecisionRead(selectedFrame)
  const selectedFreshness = selectedFrame ? shortFreshness(selectedFrame.trust.freshnessLabel) : 'Awaiting focus'
  const selectedConfidence = selectedFrame?.metrics.signalConfidence ?? selectedNode?.signalConfidence ?? null
  const selectedConfidenceLabel =
    selectedNode?.confidenceTier != null
      ? selectedNode.confidenceTier.toUpperCase()
      : selectedConfidence != null
        ? selectedConfidence >= 85
          ? 'HIGH'
          : selectedConfidence >= 68
            ? 'MEDIUM'
            : 'LOW'
        : 'UNKNOWN'
  const selectedPressure = selectedNode?.pressureLevel ?? null
  const selectedRoutePressureLabel =
    selectedPressure != null ? `${selectedPressure.toUpperCase()} PRESSURE` : 'NO PRESSURE READ'
  const selectedStatusRead = selectedNode
    ? `${selectedNode.label} ${selectedState?.label.toLowerCase() ?? 'live'} | ${selectedConfidenceLabel.toLowerCase()} confidence | ${selectedFreshness.toLowerCase()}`
    : 'Select a region to inspect execution posture.'
  const supportTelemetry = [
    { label: 'Routes', value: String(flowPaths.length), color: '#dbeafe' },
    { label: 'Blocked', value: String(blockedFocusFlowCount), color: blockedFocusFlowCount > 0 ? A.deny : P.t2 },
    { label: 'Healthy', value: String(healthyProviders), color: healthyProviders > 0 ? A.run_now : P.t2 },
    { label: 'Degraded', value: String(degradedProviders), color: degradedProviders > 0 ? A.reroute : P.t2 },
    { label: 'Offline', value: String(offlineProviders), color: offlineProviders > 0 ? A.deny : P.t2 },
    {
      label: 'Lag',
      value: projectionLagSec == null ? 'N/A' : `${projectionLagSec}s`,
      color: projectionLagSec != null && projectionLagSec > 60 ? A.reroute : P.t1,
    },
  ]

  return (
    <div
      style={{
        padding: mobile ? '14px 14px 14px' : '18px 18px 16px',
        borderRadius: 24,
        background: `linear-gradient(180deg, ${hex('#0a1220', 0.22)} 0%, ${hex('#07101a', 0.12)} 18%, ${hex('#020309', 0.94)} 66%, ${hex('#000000', 0.98)} 100%)`,
        border: `1px solid ${hex(P.accent, 0.12)}`,
        boxShadow: `0 24px 60px ${hex('#000000', 0.36)}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: mobile ? 'flex-start' : 'center', gap: 12, flexWrap: mobile ? 'wrap' : 'nowrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.12em', color: '#dbeafe' }}>
            <Globe2 size={13} />
            LIVE GRID THEATER
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: mobile ? 'flex-start' : 'flex-end' }}>
          <div style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 999, border: `1px solid ${streamHealthy ? hex(A.run_now, 0.18) : hex(A.reroute, 0.2)}`, background: streamHealthy ? hex(A.run_now, 0.06) : hex(A.reroute, 0.08), color: streamHealthy ? '#d1fae5' : '#fde68a', fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em' }}>
            {streamHealthy ? 'STREAM HEALTHY' : 'STREAM GUARDED'}
          </div>
          {!mobile ? (
            <>
              <button
                type="button"
                onClick={() => setShowDesktopGuide((current) => !current)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, border: `1px solid ${P.borderLit}`, background: showDesktopGuide ? hex(P.accent, 0.1) : hex('#ffffff', 0.02), color: showDesktopGuide ? '#dbeafe' : P.t1, cursor: 'pointer', fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em' }}
              >
                {showDesktopGuide ? 'HIDE GUIDE' : 'GUIDE'}
              </button>
              <button
                type="button"
                onClick={() => setShowLegend((current) => !current)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, border: `1px solid ${P.borderLit}`, background: showLegend ? hex(P.accent, 0.1) : hex('#ffffff', 0.02), color: showLegend ? '#dbeafe' : P.t1, cursor: 'pointer', fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em' }}
              >
                {showLegend ? 'HIDE LEGEND' : 'LEGEND'}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!mobile && (showDesktopGuide || showLegend) ? (
          <div style={{ display: 'grid', gridTemplateColumns: showDesktopGuide && showLegend ? 'minmax(0, 1.1fr) minmax(0, 0.9fr)' : '1fr', gap: 10 }}>
            {showDesktopGuide ? (
              <div style={{ padding: '12px 14px', borderRadius: 16, background: hex('#ffffff', 0.025), border: `1px solid ${P.border}` }}>
                <div style={{ fontFamily: 'var(--m)', fontSize: 9, letterSpacing: '0.12em', color: P.t3 }}>CONTROL GUIDE</div>
                <div style={{ marginTop: 6, fontSize: 12, color: P.t1, lineHeight: 1.6 }}>{selectedStatusRead}</div>
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  <div style={{ padding: '8px 10px', borderRadius: 12, background: hex('#ffffff', 0.02), border: `1px solid ${P.border}` }}>
                    <div style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3 }}>REGION</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: P.t1 }}>{selectedNode?.label ?? 'Select region'}</div>
                  </div>
                  <div style={{ padding: '8px 10px', borderRadius: 12, background: hex('#ffffff', 0.02), border: `1px solid ${P.border}` }}>
                    <div style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3 }}>POSTURE</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: selectedState?.color ?? '#dbeafe' }}>{selectedState?.label ?? 'Awaiting focus'}</div>
                  </div>
                  <div style={{ padding: '8px 10px', borderRadius: 12, background: hex('#ffffff', 0.02), border: `1px solid ${P.border}` }}>
                    <div style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3 }}>ROUTE</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: P.t1 }}>{selectedRoutePressureLabel}</div>
                  </div>
                </div>
              </div>
            ) : null}
            {showLegend ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                {(['active', 'marginal', 'blocked'] as const).map((state) => {
                  const meta = WORLD_STATE_META[state]
                  return (
                    <div key={state} style={{ padding: '10px 12px', borderRadius: 12, background: hex('#ffffff', 0.025), border: `1px solid ${P.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 9, height: 9, borderRadius: '999px', background: meta.color, boxShadow: `0 0 10px ${hex(meta.color, 0.34)}` }} />
                        <div style={{ fontSize: 11, color: P.t1 }}>{meta.label}</div>
                        <div style={{ marginLeft: 'auto', fontFamily: 'var(--m)', fontSize: 9, color: meta.color }}>{meta.rhythm}</div>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 10, color: P.t2, lineHeight: 1.55 }}>{meta.detail}</div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : null}
        <div onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} style={{ position: 'relative', minHeight: mobile ? 468 + Math.round(focusPulse * 18) : (expanded ? 580 : 462) + Math.round(focusPulse * 44), borderRadius: 22, overflow: 'hidden', border: `1px solid ${P.borderLit}`, background: `radial-gradient(circle at 50% 22%, ${hex(P.accent, 0.04)} 0%, ${hex('#04060b', 0.1)} 28%, ${hex('#020309', 0.88)} 54%, ${hex('#000000', 0.98)} 100%)`, perspective: '1200px', transition: 'min-height 0.9s cubic-bezier(0.16,1,0.3,1)' }}>
          <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `rotateX(${-mousePos.y * 12}deg) rotateY(${mousePos.x * 12}deg) scale(${(1 + focusPulse * 0.12).toFixed(3)})`, transition: 'transform 0.9s cubic-bezier(0.16,1,0.3,1)' }}>
          <div style={{ position: 'absolute', inset: mobile ? 4 : expanded ? 12 : 10, borderRadius: '50%', background: `radial-gradient(circle at 50% 48%, ${hex('#ffffff', 0.02)} 0%, ${hex('#7db7ff', 0.02)} 16%, ${hex('#0c1624', 0.08)} 38%, ${hex('#030507', 0.82)} 68%, ${hex('#000000', 0.98)} 100%)`, boxShadow: `inset 0 0 44px ${hex('#61a3ff', 0.05)}, 0 0 18px ${hex('#8ec5ff', 0.06)}` }} />
          {selectedNode ? (
            <div style={{ position: 'absolute', inset: 0, borderRadius: 22, background: `radial-gradient(ellipse 52% 52% at 50% 50%, ${hex(worldStateColor(selectedNode), 0.08)} 0%, transparent 68%)`, pointerEvents: 'none', zIndex: 1, transition: 'background 0.5s ease' }} />
          ) : null}
          <svg viewBox={`0 0 ${globeSize} ${globeSize}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <defs>
              <filter id="hallogrid-flow-glow-next">
                <feGaussianBlur stdDeviation="2.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id="hallogrid-globe-core-next" cx="50%" cy="50%" r="58%">
                <stop offset="0%" stopColor="rgba(18,26,42,0.015)" />
                <stop offset="36%" stopColor="rgba(8,12,20,0.04)" />
                <stop offset="68%" stopColor="rgba(2,4,10,0.38)" />
                <stop offset="100%" stopColor="rgba(0,1,4,0.94)" />
              </radialGradient>
              <radialGradient id="hallogrid-atmosphere-next" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="rgba(120,170,255,0.006)" />
                <stop offset="55%" stopColor="rgba(80,120,220,0.022)" />
                <stop offset="100%" stopColor="rgba(30,50,120,0.055)" />
              </radialGradient>
              <radialGradient id="hallogrid-weather-aura" cx="30%" cy="30%" r="50%">
                <stop offset="0%" stopColor={hex(A.run_now, 0.055)} />
                <stop offset="60%" stopColor={hex(P.accent, 0.02)} />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
            </defs>
            <circle cx={center} cy={center} r={glowRadius} fill="url(#hallogrid-atmosphere-next)" />
            <circle cx={center} cy={center} r={radius} fill="url(#hallogrid-globe-core-next)" />
            <circle cx={center} cy={center} r={radius} fill="url(#hallogrid-weather-aura)" transform={`rotate(${-rotation * 0.4} ${center} ${center})`} />
            <circle cx={center} cy={center} r={radius} fill="transparent" stroke={hex('#dbeafe', 0.14)} strokeWidth="1" />
            {[0.14, 0.24, 0.34, 0.44, 0.54, 0.64, 0.74, 0.84].map((ratio, index) => (
              <ellipse key={`lat-next-${ratio}`} cx={center} cy={center} rx={radius} ry={radius * ratio} fill="transparent" stroke={hex('#8fb8ff', Math.max(0.06, 0.18 - index * 0.014))} strokeWidth="0.75" />
            ))}
            {[0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84].map((ratio, index) => (
              <ellipse key={`lon-next-${ratio}`} cx={center} cy={center} rx={radius * ratio} ry={radius} fill="transparent" stroke={hex('#8fb8ff', Math.max(0.05, 0.16 - index * 0.015))} strokeWidth="0.7" transform={`rotate(${rotation * (0.12 + index * 0.03)} ${center} ${center})`} />
            ))}
            {flowPaths.map((flow) => (
              <g key={flow.id}>
                <path d={flow.d} fill="none" stroke={flow.color} strokeOpacity={flow.opacity} strokeWidth={flow.width} filter="url(#hallogrid-flow-glow-next)" strokeDasharray={flow.dashSpeed > 0 ? '10 6' : undefined} style={flow.dashSpeed > 0 ? { animation: `hallogrid-flow-travel ${flow.dashSpeed}s linear infinite` } : undefined} />
                {!reducedMotion ? (
                  <path
                    d={flow.d}
                    fill="none"
                    stroke={flow.mode === 'blocked' ? A.deny : '#ffffff'}
                    strokeOpacity={flow.opacity * 1.8}
                    strokeWidth={flow.width * 1.4}
                    pathLength="100"
                    strokeDasharray="15 85"
                    style={{
                      animation: `hallogrid-flow-comet ${flow.mode === 'blocked' ? '3.5s' : flow.dashSpeed && flow.dashSpeed < 2 ? '1.5s' : '2.8s'} linear infinite`,
                    }}
                  />
                ) : null}
              </g>
            ))}
            {actionableNodes.map((item) => {
              const isSelected = item.node.region === selectedRegion
              return (
                <g key={item.node.region} opacity={Math.min(1, item.opacity + (isSelected ? 0.2 : 0))}>
                  <circle cx={item.screenX} cy={item.screenY} r={(item.node.pressureLevel === 'high' ? 17 : item.node.pressureLevel === 'medium' ? 14 : 11) * item.scale} fill={hex(item.color, isSelected ? 0.24 : pressureGlow(item.node))} stroke="none" filter="url(#hallogrid-flow-glow-next)" />
                  <circle cx={item.screenX} cy={item.screenY} r={7 * item.scale} fill={item.color} stroke={isSelected ? '#ffffff' : hex(item.color, 0.62)} strokeWidth={isSelected ? 2 : 1} filter="url(#hallogrid-flow-glow-next)" />
                  <circle cx={item.screenX} cy={item.screenY} r={(item.node.pressureLevel === 'high' ? 28 : item.node.pressureLevel === 'medium' ? 22 : 18) * item.scale} fill="transparent" stroke={hex(item.color, regionRingOpacity(item.node))} strokeDasharray={regionRingDash(item.node)} strokeWidth={isSelected ? 2.4 : item.node.pressureLevel === 'high' ? 2 : 1.3} />
                  {isSelected ? (
                    <g>
                      <circle cx={item.screenX} cy={item.screenY} r={30 * item.scale} fill="transparent" stroke={hex('#dbeafe', 0.45)} strokeDasharray="5 7" strokeWidth="1.2" />
                      <circle cx={item.screenX} cy={item.screenY} r={10 * item.scale} fill="transparent" stroke={hex(item.color, 0.8)} strokeWidth="2" style={{ animation: 'hallogrid-shockwave 2.5s ease-out infinite' }} />
                    </g>
                  ) : null}
                </g>
              )
            })}
          {!mobile && actionableNodes.filter((item) => item.depth > 0.15).map((item) => (
            <text
              key={`lbl-${item.node.region}`}
              x={item.screenX}
              y={item.screenY - Math.max(13, 15 * item.scale) - 2}
              textAnchor="middle"
              fill={item.color}
              fillOpacity={Math.min(0.82, item.opacity * 0.9)}
              fontSize={Math.max(7.5, 8.5 * item.scale)}
              fontFamily="'JetBrains Mono', monospace"
              letterSpacing="0.06em"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {item.node.label}
            </text>
          ))}
          </svg>
          {actionableNodes.map((item) => {
            const stateMeta = WORLD_STATE_META[item.node.state]
            const isSelected = item.node.region === selectedRegion
            return mobile ? (
              <div
                key={item.node.region}
                style={{
                  position: 'absolute',
                  left: item.screenX,
                  top: item.screenY,
                  transform: 'translate(-50%, -50%)',
                  width: 34,
                  height: 34,
                  borderRadius: '999px',
                  border: isSelected ? `1px solid ${hex('#dbeafe', 0.62)}` : `1px solid ${hex(stateMeta.color, 0.24)}`,
                  background: isSelected ? hex('#dbeafe', 0.08) : 'transparent',
                  boxShadow: isSelected ? `0 0 18px ${hex('#dbeafe', 0.16)}` : 'none',
                  zIndex: Math.round((item.depth + 1) * 100),
                  opacity: selectedRegion && !isSelected ? 0.55 : 1,
                  pointerEvents: 'none',
                }}
                aria-hidden="true"
              >
                <span
                  style={{
                    display: 'block',
                    width: 10,
                    height: 10,
                    margin: '0 auto',
                    marginTop: 11,
                    borderRadius: '999px',
                    background: stateMeta.color,
                    boxShadow: `0 0 18px ${hex(stateMeta.color, 0.55)}`,
                    animation: regionPulse(item.node, reducedMotion),
                  }}
                />
              </div>
            ) : (
              <button
                key={item.node.region}
                type="button"
                onClick={() => onSelectRegion(item.node)}
                style={{
                  position: 'absolute',
                  left: item.screenX,
                  top: item.screenY,
                  transform: 'translate(-50%, -50%)',
                  width: 34,
                  height: 34,
                  borderRadius: '999px',
                  border: isSelected ? `1px solid ${hex('#dbeafe', 0.62)}` : `1px solid ${hex(stateMeta.color, 0.24)}`,
                  background: isSelected ? hex('#dbeafe', 0.08) : 'transparent',
                  boxShadow: isSelected ? `0 0 18px ${hex('#dbeafe', 0.16)}` : 'none',
                  cursor: 'pointer',
                  zIndex: Math.round((item.depth + 1) * 100),
                  opacity: selectedRegion && !isSelected ? 0.55 : 1,
                  pointerEvents: 'auto',
                }}
                aria-label={`Focus ${item.node.label}`}
                title={`${item.node.label}: ${stateMeta.label}`}
              >
                <span style={{ display: 'block', width: 10, height: 10, margin: '0 auto', borderRadius: '999px', background: stateMeta.color, boxShadow: `0 0 18px ${hex(stateMeta.color, 0.55)}`, animation: regionPulse(item.node, reducedMotion) }} />
              </button>
            )
          })}
          {providerNodes.map(({ provider, x, y, color }) => (
            <div key={provider.id} style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 6, padding: selectedNode ? '5px 8px' : '0', borderRadius: 999, background: selectedNode ? hex('#000000', 0.44) : 'transparent', border: selectedNode ? `1px solid ${hex(color, 0.28)}` : 'none', boxShadow: selectedNode ? `0 0 16px ${hex(color, 0.08)}` : 'none', pointerEvents: 'none', zIndex: 220 }} title={`${provider.label}: ${provider.status}`}>
              <span style={{ width: 7, height: 7, borderRadius: '999px', background: color, boxShadow: `0 0 12px ${hex(color, 0.48)}`, animation: reducedMotion || provider.status !== 'healthy' ? 'none' : 'hallogrid-beacon-fast 1.8s ease-in-out infinite' }} />
              {selectedNode ? <span style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t1, letterSpacing: '0.04em' }}>{provider.label}</span> : null}
            </div>
          ))}
          </div>

          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', transform: mobile ? 'none' : 'translateZ(40px)' }}>
          <div style={{ pointerEvents: 'auto', position: 'absolute', left: 16, top: 16, display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: mobile ? '68%' : '40%' }}>
            {([
              ['RUN', activeCount, A.run_now],
              ['GUARDED', guardedCount, A.reroute],
              ['BLOCKED', blockedCount, A.deny],
            ] as const).map(([label, value, color]) => (
              <div key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 999, background: hex('#000000', 0.48), border: `1px solid ${hex(color, 0.28)}`, color: P.t1, boxShadow: `0 0 16px ${hex(color, 0.08)}` }}>
                <span style={{ width: 8, height: 8, borderRadius: '999px', background: color, boxShadow: `0 0 12px ${hex(color, 0.45)}`, animation: label === 'RUN' && !reducedMotion ? 'hallogrid-beacon-fast 1.8s ease-in-out infinite' : label === 'GUARDED' && !reducedMotion ? 'hallogrid-beacon-slow 2.8s ease-in-out infinite' : 'none' }} />
                <span style={{ fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em', color: label === 'BLOCKED' && value > 0 ? '#fecdd3' : P.t1 }}>{label}</span>
                <span style={{ fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.06em', color }}>{value}</span>
              </div>
            ))}
          </div>
          {!mobile && selectedNode ? (
            <div style={{ pointerEvents: 'auto', position: 'absolute', top: 16, right: 16, width: expanded ? 208 : 184, maxWidth: '32%', padding: '10px 11px', borderRadius: 16, background: hex('#010308', 0.76), border: `1px solid ${selectedNode ? hex(worldStateColor(selectedNode), 0.26) : P.borderLit}`, boxShadow: selectedNode ? `0 0 24px ${hex(worldStateColor(selectedNode), 0.1)}` : 'none', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
            <div style={{ fontFamily: 'var(--m)', fontSize: 9, letterSpacing: '0.12em', color: P.t3 }}>REGION LOCK</div>
            <div style={{ marginTop: 5, display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: P.t0 }}>{selectedNode.label}</span>
              {selectedState ? <span style={{ fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em', color: selectedState.color }}>{selectedState.label.toUpperCase()}</span> : null}
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: P.t1, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {selectedDecisionRead}
            </div>
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 5 }}>
              <div style={{ padding: '6px 8px', borderRadius: 10, background: hex('#ffffff', 0.035), border: `1px solid ${P.border}` }}>
                <div style={{ fontFamily: 'var(--m)', fontSize: 8, color: P.t3 }}>CONF</div>
                <div style={{ marginTop: 3, fontSize: 10, color: confidenceColor(selectedConfidence) }}>{selectedConfidenceLabel}</div>
              </div>
              <div style={{ padding: '6px 8px', borderRadius: 10, background: hex('#ffffff', 0.035), border: `1px solid ${P.border}` }}>
                <div style={{ fontFamily: 'var(--m)', fontSize: 8, color: P.t3 }}>FRESHNESS</div>
                <div style={{ marginTop: 3, fontSize: 10, color: P.t1 }}>{selectedFreshness}</div>
              </div>
              <div style={{ padding: '6px 8px', borderRadius: 10, background: hex('#ffffff', 0.035), border: `1px solid ${P.border}` }}>
                <div style={{ fontFamily: 'var(--m)', fontSize: 8, color: P.t3 }}>ROUTE</div>
                <div style={{ marginTop: 3, fontSize: 10, color: P.t1 }}>{selectedRoutePressureLabel}</div>
              </div>
              <div style={{ padding: '6px 8px', borderRadius: 10, background: hex('#ffffff', 0.035), border: `1px solid ${P.border}` }}>
                <div style={{ fontFamily: 'var(--m)', fontSize: 8, color: P.t3 }}>LANES</div>
                <div style={{ marginTop: 3, fontSize: 10, color: blockedFocusFlowCount > 0 ? A.deny : '#dbeafe' }}>{selectedNode ? `${connectedFlows.length}/${blockedFocusFlowCount}` : `${flowPaths.length}`}</div>
              </div>
            </div>
            </div>
          ) : null}
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 46, height: 3, borderRadius: 2, display: 'flex', overflow: 'hidden', background: hex('#ffffff', 0.05), pointerEvents: 'none' }}>
            <div style={{ flex: activeCount || 0, background: A.run_now, opacity: 0.78 }} />
            <div style={{ flex: guardedCount || 0, background: A.reroute, opacity: 0.78 }} />
            <div style={{ flex: blockedCount || 0, background: A.deny, opacity: 0.78 }} />
          </div>
          <div style={{ pointerEvents: 'auto', position: 'absolute', left: 16, bottom: 14, display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 999, background: hex('#000000', 0.42), border: `1px solid ${P.borderLit}`, fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em', color: selectedNode ? worldStateColor(selectedNode) : '#dbeafe' }}>
            <span>{selectedNode ? `FOCUS ${selectedNode.label.toUpperCase()}` : 'WORLD STATE LIVE'}</span>
            {selectedState ? <span style={{ color: selectedState.color }}>{selectedState.label.toUpperCase()}</span> : null}
          </div>
          <div style={{ pointerEvents: 'auto', position: 'absolute', right: 16, bottom: 14, display: mobile ? 'none' : 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 999, background: hex('#000000', 0.42), border: `1px solid ${P.borderLit}`, fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em', color: '#dbeafe' }}>
            <span>{reducedMotion ? 'LOW MOTION' : 'LIVE ROTATION'}</span>
            <span style={{ color: P.t2 }}>{Math.round(rotation)}deg</span>
          </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : expanded ? 'minmax(0, 1.3fr) minmax(0, 0.7fr)' : '1fr', gap: 10 }}>
            <div style={{ padding: '12px 14px', borderRadius: 16, background: hex('#ffffff', 0.03), border: `1px solid ${P.border}` }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {regionRailNodes.map((node) => {
                  const meta = WORLD_STATE_META[node.state]
                  const isSelected = node.region === selectedRegion
                  return (
                    <button
                      key={node.region}
                      type="button"
                      onClick={() => onSelectRegion(node)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 999, border: `1px solid ${hex(meta.color, isSelected ? 0.44 : 0.22)}`, background: isSelected ? hex(meta.color, 0.12) : hex('#ffffff', 0.02), color: P.t1, cursor: 'pointer', fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.06em' }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '999px', background: meta.color, boxShadow: `0 0 10px ${hex(meta.color, 0.45)}` }} />
                      {node.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {supportTelemetry.map((item) => (
                <div key={item.label} style={{ padding: '10px 11px', borderRadius: 14, background: hex('#ffffff', 0.03), border: `1px solid ${P.border}` }}>
                  <div style={{ fontFamily: 'var(--m)', fontSize: 9, letterSpacing: '0.08em', color: P.t3 }}>{item.label}</div>
                  <div style={{ marginTop: 5, fontSize: 12, color: item.color, fontFamily: 'var(--m)' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

function Inspector({
  f,
  detail,
  workspace,
  panel,
  setPanel,
  close,
  mobile,
  loading,
  workspaceLoading,
  latestDrill,
  canAccessControls,
  canManageDoctrine,
  onRunDrill,
  drillLoading,
}: {
  f: HallOGridFrame
  detail: HallOGridFrameDetail | null
  workspace: HallOGridProWorkspace | null
  panel: Panel
  setPanel: (p: Panel) => void
  close: () => void
  mobile: boolean
  loading: boolean
  workspaceLoading: boolean
  latestDrill: HallOGridDrillRun | null
  canAccessControls: boolean
  canManageDoctrine: boolean
  onRunDrill: (scenario: string) => void
  drillLoading: boolean
}) {
  const color = A[f.action]
  const conf = f.metrics.signalConfidence
  const confColor = confidenceColor(conf)
  const trace = detail?.evidence.trace
  const replay = detail?.evidence.replay
  const proof = detail?.evidence.proof
  const doctrineMutation = useHallOGridDoctrineMutation(f.id)
  const createOverrideMutation = useHallOGridCreateOverrideMutation(f.id)
  const overrideStatusMutation = useHallOGridOverrideStatusMutation(f.id)
  const [doctrineDraft, setDoctrineDraft] = useState<{
    automationMode: HallOGridDoctrineSummary['automationMode']
    failMode: HallOGridDoctrineSummary['failMode']
    activePolicyLabel: string
  } | null>(null)
  const [overrideDraft, setOverrideDraft] = useState<{
    requestedAction: HallOGridOverrideRecord['requestedAction']
    reasonCode: string
    scope: string
    ticketRef: string
    expiresInHours: string
  }>({
    requestedAction: 'force_delay',
    reasonCode: '',
    scope: f.region,
    ticketRef: '',
    expiresInHours: '2',
  })

  useEffect(() => {
    if (!workspace) return
    setDoctrineDraft({
      automationMode: workspace.doctrine.automationMode,
      failMode: workspace.doctrine.failMode,
      activePolicyLabel: workspace.doctrine.activePolicyLabel,
    })
    setOverrideDraft((current) => ({
      ...current,
      scope: workspace.overrides[0]?.scope || f.region,
    }))
  }, [f.region, workspace])

  return (
    <div style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: `linear-gradient(180deg, ${P.bg1}fa 0%, ${P.bg0}fa 100%)`, backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}>
      <div style={{ padding: mobile ? '16px 18px 14px' : '20px 24px 16px', position: 'sticky', top: 0, zIndex: 10, background: `linear-gradient(180deg, ${P.bg1}f5 0%, ${P.bg1}d0 100%)`, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: `1px solid ${P.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--m)', fontSize: 10, color: P.t3, letterSpacing: '0.08em', marginBottom: 4 }}>
              {f.id} | RECORDED <RelativeTime value={f.createdAt} /> | {new Date(f.createdAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </div>
            <div style={{ fontSize: 21, fontWeight: 700, color: P.t0, letterSpacing: '-0.02em' }}>{f.explanation.headline}</div>
            <div style={{ fontSize: 12, color: P.t2, marginTop: 3 }}>{f.reasonLabel}</div>
          </div>
          <button type="button" onClick={close} style={{ background: hex('#ffffff', 0.05), border: `1px solid ${P.border}`, borderRadius: 8, color: P.t2, cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'var(--m)', fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', color, padding: '7px 20px', borderRadius: 999, background: `linear-gradient(135deg, ${hex(color, 0.18)} 0%, ${hex(color, 0.06)} 100%)`, border: `1px solid ${hex(color, 0.35)}`, boxShadow: `0 0 20px ${hex(color, 0.25)}, inset 0 1px 0 ${hex(color, 0.15)}` }}>
            {ACTION_META[f.action].label.toUpperCase()}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at 35% 35%, ${hex(confColor, 0.3)} 0%, ${hex(confColor, 0.08)} 100%)`, border: `2px solid ${hex(confColor, 0.5)}`, boxShadow: `0 0 18px ${hex(confColor, 0.25)}` }}>
              <span style={{ fontFamily: 'var(--m)', fontSize: 14, fontWeight: 700, color: confColor }}>{confidenceGrade(conf)}</span>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--m)', fontSize: 24, fontWeight: 700, color: confColor, lineHeight: 1 }}>{conf != null ? conf.toFixed(1) : '--'}</div>
              <div style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3, letterSpacing: '0.08em' }}>CONF | {f.trust.tier}</div>
            </div>
          </div>

          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--m)', fontSize: 18, fontWeight: 600, color: P.t1 }}>{f.metrics.totalLatencyMs != null ? f.metrics.totalLatencyMs.toFixed(0) : '--'}<span style={{ fontSize: 10, color: P.t3 }}>ms</span></div>
            <div style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3 }}>LATENCY</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {TABS.map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setPanel(id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, border: `1px solid ${panel === id ? hex(P.accent, 0.32) : P.border}`, background: panel === id ? hex(P.accent, 0.12) : hex('#ffffff', 0.04), color: panel === id ? '#dbeafe' : P.t1, fontFamily: 'var(--m)', fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: mobile ? '0 18px' : '0 24px' }}>
        {loading ? (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: `linear-gradient(135deg, ${hex(P.accent, 0.08)} 0%, ${hex(P.accent, 0.03)} 100%)`, border: `1px solid ${hex(P.accent, 0.15)}`, fontSize: 11, color: '#dbeafe' }}>
            Loading trace-backed detail...
          </div>
        ) : null}

        {workspaceLoading ? (
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: `linear-gradient(135deg, ${hex(A.run_now, 0.08)} 0%, ${hex(A.run_now, 0.03)} 100%)`, border: `1px solid ${hex(A.run_now, 0.15)}`, fontSize: 11, color: '#d1fae5' }}>
            Loading Pro workspace modules...
          </div>
        ) : null}

        {panel === 'trace' ? (
          <>
            <Block title="DECISION CORE">
              <Row label="Frame" value={f.id} />
              <Row label="Region" value={f.region} />
              <Row label="Workload class" value={f.workloadClass} />
              <Row label="Action" value={ACTION_META[f.action].label} color={color} />
              <Row label="Signal mode" value={f.runtime.signalMode ?? 'Unavailable'} />
              <Row label="Accounting" value={f.runtime.accountingMethod ?? 'Unavailable'} />
              <Row label="Water delta" value={liters(f.metrics.waterImpactDeltaLiters)} />
            </Block>
            <Block title="CONFIDENCE BREAKDOWN">
              <Bar label="signal confidence" value={f.metrics.signalConfidence} />
              <Bar label="carbon reduction" value={f.metrics.carbonReductionPct} />
              <Bar label="replay readiness" value={f.replayState === 'verified' ? 100 : f.replayState === 'pending' ? 55 : 18} />
              <Bar label="proof posture" value={f.proofState === 'available' ? 100 : 20} />
            </Block>
            <Block title="GOVERNANCE / TRACE">
              <Row label="Governance source" value={trace?.governanceSource ?? f.governanceSource ?? 'Unavailable'} />
              <Row label="Trace hash" value={shortHash(trace?.hash)} />
              <Row label="Input hash" value={shortHash(trace?.inputHash)} />
              <Row label="Sequence" value={trace?.sequenceNumber != null ? String(trace.sequenceNumber) : 'Unavailable'} />
              <Row label="Constraints" value={trace?.constraintsApplied.length ? trace.constraintsApplied.join(', ') : 'none'} />
            </Block>
          </>
        ) : null}

        {panel === 'replay' ? (
          <>
            <Block title="REPLAY STATE">
              <Row label="Deterministic match" value={replay?.deterministicMatch == null ? 'Unavailable' : replay.deterministicMatch ? 'YES' : 'NO'} color={replay?.deterministicMatch == null ? P.t1 : replay.deterministicMatch ? A.run_now : A.deny} />
              <Row label="Trace backed" value={replay?.available ? (replay.traceBacked ? 'YES' : 'NO') : 'Unavailable'} />
              <Row label="Selected action" value={replay?.selectedAction ?? 'Unavailable'} />
              <Row label="Selected region" value={replay?.selectedRegion ?? 'Unavailable'} />
              <Row label="Reason code" value={replay?.reasonCode ?? f.reasonCode} />
            </Block>
            <Block title="REPLAY NOTES">
              {replay?.mismatches.length ? replay.mismatches.map((mismatch) => (
                <div key={mismatch} style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: hex(A.deny, 0.08), border: `1px solid ${hex(A.deny, 0.16)}`, color: '#fecdd3', fontSize: 11 }}>
                  {mismatch}
                </div>
              )) : <div style={{ fontSize: 11, color: P.t2, lineHeight: 1.7 }}>{f.trust.replayability}</div>}
            </Block>
          </>
        ) : null}

        {panel === 'proof' ? (
          <>
            <Block title="TRACE ENVELOPE">
              <Row label="Proof hash" value={shortHash(proof?.hash, 24)} />
              <Row label="Not before" value={proof?.notBefore ?? 'Immediate'} />
              <Row label="Trace state" value={f.traceState} />
              <Row label="Proof state" value={f.proofState} color={f.proofState === 'available' ? A.run_now : A.reroute} />
            </Block>
            <Block title="EVIDENCE REFS">
              {proof?.providerSnapshotRefs.length ? proof.providerSnapshotRefs.slice(0, 3).map((ref) => (
                <div key={ref} style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: hex(P.accent, 0.06), border: `1px solid ${hex(P.accent, 0.14)}`, color: P.t1, fontFamily: 'var(--m)', fontSize: 10, overflowWrap: 'anywhere' }}>
                  {ref}
                </div>
              )) : null}
              {proof?.evidenceRefs.length ? proof.evidenceRefs.slice(0, 3).map((ref) => (
                <div key={ref} style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: hex(A.run_now, 0.06), border: `1px solid ${hex(A.run_now, 0.14)}`, color: P.t1, fontFamily: 'var(--m)', fontSize: 10, overflowWrap: 'anywhere' }}>
                  {ref}
                </div>
              )) : null}
              {!proof?.providerSnapshotRefs.length && !proof?.evidenceRefs.length ? (
                <div style={{ fontSize: 11, color: P.t3, fontStyle: 'italic' }}>No linked evidence refs returned.</div>
              ) : null}
            </Block>
          </>
        ) : null}

        {workspace ? (
          <>
            <Block title="COUNTERFACTUAL ANALYSIS">
              <div style={{ display: 'grid', gap: 10 }}>
                {workspace.counterfactuals.map((item) => (
                  <CounterfactualCard key={item.id} item={item} />
                ))}
              </div>
            </Block>

            <Block title="DOCTRINE MANAGER">
              <Row label="Doctrine" value={workspace.doctrine.doctrineLabel} />
              <Row label="Version" value={workspace.doctrine.version} />
              <Row label="Status" value={workspace.doctrine.status} color={workspace.doctrine.status === 'certified' ? A.run_now : A.reroute} />
              <Row label="Automation mode" value={workspace.doctrine.automationMode.replace(/_/g, ' ')} />
              <Row label="Fail mode" value={workspace.doctrine.failMode.replace(/_/g, ' ')} />
              <Row label="Signed by" value={workspace.doctrine.signedBy} />
              <Row label="Signed at" value={new Date(workspace.doctrine.signedAt).toLocaleString()} />
              <Row label="Policy" value={workspace.doctrine.activePolicyLabel} />
              <Row label="Control points" value={workspace.doctrine.controlPoints.join(', ')} />
              <Row label="Certification scope" value={workspace.doctrine.certificationScope.join(', ')} />
              {doctrineDraft ? (
                <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontFamily: 'var(--m)', fontSize: 9, letterSpacing: '0.08em', color: P.t3 }}>AUTOMATION MODE</span>
                      <select
                        value={doctrineDraft.automationMode}
                        disabled={!canManageDoctrine || doctrineMutation.isPending}
                        onChange={(event) =>
                          setDoctrineDraft((current) =>
                            current
                              ? { ...current, automationMode: event.target.value as HallOGridDoctrineSummary['automationMode'] }
                              : current
                          )
                        }
                        style={{ background: hex('#ffffff', 0.05), border: `1px solid ${P.border}`, borderRadius: 10, color: P.t1, padding: '10px 12px', fontSize: 11 }}
                      >
                        <option value="advisory_only">Advisory only</option>
                        <option value="supervised_automatic">Supervised automatic</option>
                        <option value="full_authority">Full authority</option>
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontFamily: 'var(--m)', fontSize: 9, letterSpacing: '0.08em', color: P.t3 }}>FAIL MODE</span>
                      <select
                        value={doctrineDraft.failMode}
                        disabled={!canManageDoctrine || doctrineMutation.isPending}
                        onChange={(event) =>
                          setDoctrineDraft((current) =>
                            current
                              ? { ...current, failMode: event.target.value as HallOGridDoctrineSummary['failMode'] }
                              : current
                          )
                        }
                        style={{ background: hex('#ffffff', 0.05), border: `1px solid ${P.border}`, borderRadius: 10, color: P.t1, padding: '10px 12px', fontSize: 11 }}
                      >
                        <option value="fail_safe_deny">Fail safe deny</option>
                        <option value="fail_guarded_delay">Fail guarded delay</option>
                        <option value="fail_open_last_safe_doctrine">Fail open last safe doctrine</option>
                      </select>
                    </label>
                  </div>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--m)', fontSize: 9, letterSpacing: '0.08em', color: P.t3 }}>ACTIVE POLICY LABEL</span>
                    <input
                      value={doctrineDraft.activePolicyLabel}
                      disabled={!canManageDoctrine || doctrineMutation.isPending}
                      onChange={(event) =>
                        setDoctrineDraft((current) =>
                          current ? { ...current, activePolicyLabel: event.target.value } : current
                        )
                      }
                      style={{ background: hex('#ffffff', 0.05), border: `1px solid ${P.border}`, borderRadius: 10, color: P.t1, padding: '10px 12px', fontSize: 11 }}
                    />
                  </label>
                  {canManageDoctrine ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        disabled={doctrineMutation.isPending || !doctrineDraft.activePolicyLabel.trim()}
                        onClick={() =>
                          doctrineMutation.mutate({
                            automationMode: doctrineDraft.automationMode,
                            failMode: doctrineDraft.failMode,
                            activePolicyLabel: doctrineDraft.activePolicyLabel.trim(),
                          })
                        }
                        style={{ padding: '10px 14px', borderRadius: 999, border: `1px solid ${hex(A.run_now, 0.22)}`, background: hex(A.run_now, 0.12), color: '#d1fae5', fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em', cursor: doctrineMutation.isPending ? 'wait' : 'pointer', opacity: doctrineMutation.isPending ? 0.7 : 1 }}
                      >
                        {doctrineMutation.isPending ? 'SAVING...' : 'SIGN DOCTRINE UPDATE'}
                      </button>
                    </div>
                  ) : null}
                  {doctrineMutation.error instanceof Error ? (
                    <div style={{ fontSize: 11, color: '#fecdd3' }}>{doctrineMutation.error.message}</div>
                  ) : null}
                </div>
              ) : null}
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, border: `1px solid ${canManageDoctrine ? hex(A.run_now, 0.16) : hex(A.reroute, 0.16)}`, background: canManageDoctrine ? hex(A.run_now, 0.06) : hex(A.reroute, 0.06), fontSize: 11, color: canManageDoctrine ? '#d1fae5' : '#fde68a' }}>
                {canManageDoctrine
                  ? 'Doctrine controls are active for this role. Signed policy swaps and scoped governance changes can be issued from this surface.'
                  : 'Doctrine is visible but locked. Governance admin role is required for signed policy changes.'}
              </div>
            </Block>

            <Block title="OVERRIDE QUEUE">
              <div style={{ display: 'grid', gap: 10 }}>
                {workspace.overrides.map((item) => (
                  <div key={item.id} style={{ display: 'grid', gap: 8 }}>
                    <OverrideCard item={item} />
                    {canAccessControls && item.status !== 'expired' ? (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          disabled={overrideStatusMutation.isPending}
                          onClick={() =>
                            overrideStatusMutation.mutate({
                              overrideId: item.id,
                              status: 'expired',
                            })
                          }
                          style={{ padding: '8px 12px', borderRadius: 999, border: `1px solid ${hex(A.deny, 0.2)}`, background: hex(A.deny, 0.1), color: '#fecdd3', fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em', cursor: overrideStatusMutation.isPending ? 'wait' : 'pointer', opacity: overrideStatusMutation.isPending ? 0.7 : 1 }}
                        >
                          EXPIRE OVERRIDE
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              {canAccessControls ? (
                <div style={{ marginTop: 12, display: 'grid', gap: 10, paddingTop: 12, borderTop: `1px solid ${P.border}` }}>
                  <div style={{ fontFamily: 'var(--m)', fontSize: 9, letterSpacing: '0.08em', color: P.t3 }}>CREATE OVERRIDE</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3 }}>ACTION</span>
                      <select
                        value={overrideDraft.requestedAction}
                        disabled={createOverrideMutation.isPending}
                        onChange={(event) =>
                          setOverrideDraft((current) => ({
                            ...current,
                            requestedAction: event.target.value as HallOGridOverrideRecord['requestedAction'],
                          }))
                        }
                        style={{ background: hex('#ffffff', 0.05), border: `1px solid ${P.border}`, borderRadius: 10, color: P.t1, padding: '10px 12px', fontSize: 11 }}
                      >
                        <option value="approve_anyway">Approve anyway</option>
                        <option value="force_reroute">Force reroute</option>
                        <option value="force_delay">Force delay</option>
                        <option value="force_deny">Force deny</option>
                        <option value="switch_to_advisory">Switch to advisory</option>
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3 }}>EXPIRES IN HOURS</span>
                      <input
                        value={overrideDraft.expiresInHours}
                        disabled={createOverrideMutation.isPending}
                        onChange={(event) => setOverrideDraft((current) => ({ ...current, expiresInHours: event.target.value }))}
                        style={{ background: hex('#ffffff', 0.05), border: `1px solid ${P.border}`, borderRadius: 10, color: P.t1, padding: '10px 12px', fontSize: 11 }}
                      />
                    </label>
                  </div>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3 }}>REASON CODE</span>
                    <input
                      value={overrideDraft.reasonCode}
                      disabled={createOverrideMutation.isPending}
                      onChange={(event) => setOverrideDraft((current) => ({ ...current, reasonCode: event.target.value }))}
                      style={{ background: hex('#ffffff', 0.05), border: `1px solid ${P.border}`, borderRadius: 10, color: P.t1, padding: '10px 12px', fontSize: 11 }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3 }}>SCOPE</span>
                    <input
                      value={overrideDraft.scope}
                      disabled={createOverrideMutation.isPending}
                      onChange={(event) => setOverrideDraft((current) => ({ ...current, scope: event.target.value }))}
                      style={{ background: hex('#ffffff', 0.05), border: `1px solid ${P.border}`, borderRadius: 10, color: P.t1, padding: '10px 12px', fontSize: 11 }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--m)', fontSize: 9, color: P.t3 }}>TICKET REF</span>
                    <input
                      value={overrideDraft.ticketRef}
                      disabled={createOverrideMutation.isPending}
                      onChange={(event) => setOverrideDraft((current) => ({ ...current, ticketRef: event.target.value }))}
                      style={{ background: hex('#ffffff', 0.05), border: `1px solid ${P.border}`, borderRadius: 10, color: P.t1, padding: '10px 12px', fontSize: 11 }}
                    />
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      disabled={createOverrideMutation.isPending || !overrideDraft.reasonCode.trim() || !overrideDraft.scope.trim() || !overrideDraft.ticketRef.trim()}
                      onClick={() =>
                        createOverrideMutation.mutate(
                          {
                            requestedAction: overrideDraft.requestedAction,
                            reasonCode: overrideDraft.reasonCode.trim(),
                            scope: overrideDraft.scope.trim(),
                            ticketRef: overrideDraft.ticketRef.trim(),
                            expiresInHours: overrideDraft.expiresInHours ? Number(overrideDraft.expiresInHours) : null,
                          },
                          {
                            onSuccess: () => {
                              setOverrideDraft((current) => ({
                                ...current,
                                reasonCode: '',
                                ticketRef: '',
                              }))
                            },
                          }
                        )
                      }
                      style={{ padding: '10px 14px', borderRadius: 999, border: `1px solid ${hex(P.accent, 0.22)}`, background: hex(P.accent, 0.12), color: '#dbeafe', fontFamily: 'var(--m)', fontSize: 10, letterSpacing: '0.08em', cursor: createOverrideMutation.isPending ? 'wait' : 'pointer', opacity: createOverrideMutation.isPending ? 0.7 : 1 }}
                    >
                      {createOverrideMutation.isPending ? 'CREATING...' : 'ISSUE OVERRIDE'}
                    </button>
                  </div>
                  {createOverrideMutation.error instanceof Error ? (
                    <div style={{ fontSize: 11, color: '#fecdd3' }}>{createOverrideMutation.error.message}</div>
                  ) : null}
                  {overrideStatusMutation.error instanceof Error ? (
                    <div style={{ fontSize: 11, color: '#fecdd3' }}>{overrideStatusMutation.error.message}</div>
                  ) : null}
                </div>
              ) : null}
            </Block>

            <Block title="HAZARD REGISTRY">
              <div style={{ display: 'grid', gap: 10 }}>
                {workspace.hazards.map((item) => (
                  <HazardCard key={item.id} item={item} />
                ))}
              </div>
            </Block>

            <Block title="BUSINESS IMPACT">
              <BusinessImpactGrid impact={workspace.businessImpact} />
            </Block>

            <Block title="DRILL SIMULATOR">
              {canAccessControls ? (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {['provider_outage', 'stale_signal', 'policy_adapter_timeout'].map((scenario) => (
                      <button
                        key={scenario}
                        type="button"
                        onClick={() => onRunDrill(scenario)}
                        disabled={drillLoading}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '9px 12px',
                          borderRadius: 999,
                          border: `1px solid ${hex(P.accent, 0.22)}`,
                          background: hex(P.accent, 0.1),
                          color: '#dbeafe',
                          fontFamily: 'var(--m)',
                          fontSize: 10,
                          letterSpacing: '0.08em',
                          cursor: drillLoading ? 'wait' : 'pointer',
                          opacity: drillLoading ? 0.7 : 1,
                        }}
                      >
                        <AlertTriangle size={12} />
                        {scenario.replace(/_/g, ' ').toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, fontSize: 11, color: P.t2, lineHeight: 1.7 }}>
                    Simulated drills exercise the current fail posture without changing tenant runtime state.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: P.t2, lineHeight: 1.7 }}>
                  Operator role required to run HallOGrid drills from this surface.
                </div>
              )}

              {latestDrill ? (
                <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, border: `1px solid ${hex(P.accent, 0.16)}`, background: hex(P.accent, 0.05) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: P.t0 }}>{latestDrill.scenario.replace(/_/g, ' ')}</div>
                      <div style={{ marginTop: 4, fontSize: 11, color: P.t1, lineHeight: 1.7 }}>{latestDrill.summary}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--m)', fontSize: 9, color: latestDrill.riskDelta === 'high' ? A.deny : latestDrill.riskDelta === 'guarded' ? A.reroute : A.run_now, letterSpacing: '0.08em' }}>
                      {latestDrill.riskDelta.toUpperCase()}
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontFamily: 'var(--m)', fontSize: 10, color: P.t2 }}>
                    {latestDrill.failMode.replace(/_/g, ' ').toUpperCase()} | <RelativeTime value={latestDrill.runAt} />
                  </div>
                </div>
              ) : null}
            </Block>
          </>
        ) : null}

        <div style={{ height: 60 }} />
      </div>
    </div>
  )
}

export function CommandCenterShell() {
  const snapshotQuery = useHallOGridSnapshot()
  const snapshot = snapshotQuery.data

  const [sel, setSel] = useState<string | null>(null)
  const [seededSelection, setSeededSelection] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [panel, setPanel] = useState<Panel>('trace')
  const [focusedRegion, setFocusedRegion] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [latestDrill, setLatestDrill] = useState<HallOGridDrillRun | null>(null)

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 960)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!snapshot || seededSelection) return
    const initial = snapshot.selectedFrameId ?? snapshot.frames[0]?.id ?? null
    if (initial) setSel(initial)
    setSeededSelection(true)
  }, [seededSelection, snapshot])

  useEffect(() => {
    if (!snapshot || !sel) return
    if (!snapshot.frames.some((frame) => frame.id === sel)) setSel(null)
  }, [sel, snapshot])

  const frame = useMemo(() => {
    if (!snapshot || !sel) return null
    return snapshot.frames.find((item) => item.id === sel) ?? null
  }, [snapshot, sel])

  useEffect(() => {
    if (frame?.region) {
      setFocusedRegion(frame.region)
    }
  }, [frame?.region])

  useEffect(() => {
    setLatestDrill(null)
  }, [sel])

  const handleGlobalMouseMove = (e: React.MouseEvent) => {
    if (mobile) return
    const x = e.clientX / window.innerWidth - 0.5
    const y = e.clientY / window.innerHeight - 0.5
    setMousePos({ x, y })
  }

  const isPrimary = Boolean(snapshot?.selectedFrameId && sel === snapshot.selectedFrameId)
  const detailQuery = useHallOGridFrame(sel, {
    enabled: Boolean(sel) && !isPrimary && Boolean(snapshot?.access.canViewOperatorConsole),
    refetchInterval: false,
  })
  const detail = isPrimary ? snapshot?.selectedFrame ?? null : detailQuery.data ?? null
  const proWorkspaceQuery = useHallOGridProWorkspace(sel, {
    enabled: Boolean(sel) && Boolean(snapshot?.access.canViewOperatorConsole),
    refetchInterval: false,
  })
  const drillMutation = useHallOGridDrill()

  const runDrill = (scenario: string) => {
    if (!sel) return
    drillMutation.mutate(
      { frameId: sel, scenario },
      {
        onSuccess: (result) => {
          setLatestDrill(result)
        },
      }
    )
  }

  const selectFrame = (id: string) => {
    setSel((current) => {
      const next = current === id ? null : id
      if (next) {
        setPanel('trace')
        setFocusedRegion(snapshot?.frames.find((item) => item.id === next)?.region ?? null)
      }
      if (!next) setFocusedRegion(null)
      return next
    })
  }

  const selectRegion = (node: WorldRegionState) => {
    setFocusedRegion(node.region)

    const directFrameId =
      node.decisionFrameId != null && snapshot?.frames.some((item) => item.id === node.decisionFrameId)
        ? node.decisionFrameId
        : null

    const regionFrameId =
      snapshot?.frames.find((item) => item.region === node.region)?.id ??
      null

    const targetFrameId = directFrameId ?? regionFrameId

    if (targetFrameId) {
      setPanel('trace')
      setSel(targetFrameId)
    }
  }

  const clearSelection = () => {
    setSel(null)
    setFocusedRegion(null)
  }

  if (snapshotQuery.isLoading) {
    return <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-6 py-8 text-sm text-slate-300">Loading HallOGrid...</div>
  }

  if (snapshotQuery.error || !snapshot) {
    return <div className="rounded-[28px] border border-rose-400/20 bg-rose-400/10 px-6 py-8 text-sm text-rose-100">{snapshotQuery.error instanceof Error ? snapshotQuery.error.message : 'Failed to load HallOGrid.'}</div>
  }

  const activeColor = frame ? A[frame.action] : P.accent
  const sceneTop = shellSceneTop(mobile)

  return (
    <div onMouseMove={handleGlobalMouseMove} style={{ background: P.bg0, color: P.t1, minHeight: '100vh', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", position: 'relative', overflow: 'hidden' }}>
      <style jsx global>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');:root{--m:'JetBrains Mono',monospace;}@keyframes hallogrid-breathe{0%,100%{transform:translate(0,0) scale(1);opacity:.5;}50%{transform:translate(-2%,1.5%) scale(1.04);opacity:.75;}}@keyframes hallogrid-pulse{0%,100%{opacity:.35;transform:scale(1);}50%{opacity:0;transform:scale(2.5);}}@keyframes hallogrid-pulse-soft{0%,100%{opacity:1;}50%{opacity:.65;}}@keyframes hallogrid-beacon-fast{0%,100%{opacity:.15;transform:scale(.85);}50%{opacity:1;transform:scale(1.2);}}@keyframes hallogrid-beacon-slow{0%,100%{opacity:.2;transform:scale(.9);}50%{opacity:.75;transform:scale(1.08);}}@keyframes hallogrid-beacon-irregular{0%,20%,60%,100%{opacity:.18;transform:scale(.88);}10%,32%,74%{opacity:.95;transform:scale(1.12);}45%{opacity:.38;transform:scale(.96);}}@keyframes hallogrid-inspector-in{from{opacity:0;transform:translateX(28px);}to{opacity:1;transform:translateX(0);}}@keyframes hallogrid-sheet-up{from{transform:translateY(100%);}to{transform:translateY(0);}}@keyframes hallogrid-flow-travel{to{stroke-dashoffset:-80;}}@keyframes hallogrid-flow-comet{0%{stroke-dashoffset:100;opacity:0;}15%{opacity:1;}85%{opacity:1;}100%{stroke-dashoffset:0;opacity:0;}}@keyframes hallogrid-shockwave{0%{r:0;opacity:1;stroke-width:3;}100%{r:50px;opacity:0;stroke-width:0;}}::-webkit-scrollbar{width:3px;height:3px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:${P.borderLit};border-radius:2px;}button{font-family:inherit;}button:focus-visible{outline:2px solid ${P.accent};outline-offset:2px;}`}</style>
      <BackgroundGrid active={Boolean(sel)} color={activeColor} mousePos={mousePos} />
      <HeaderBar title={snapshot.title} subtitle={snapshot.subtitle} streamHealthy={snapshot.transport.streamHealthy} generatedAt={snapshot.generatedAt} mobile={mobile} access={snapshot.access} mirror={snapshot.mirror} />
      <TelemetryStrip frames={snapshot.frames} mobile={mobile} />

      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', paddingTop: 12, paddingBottom: 18, paddingLeft: mobile ? 12 : 18, paddingRight: mobile ? 12 : 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'stretch', width: '100%', maxWidth: mobile ? '100%' : 1180, margin: '0 auto' }}>
          <UpgradeStrip access={snapshot.access} />

          <HallOGridTheater
            nodes={snapshot.world.nodes}
            flows={snapshot.world.flows}
            providers={snapshot.health.providers}
            selectedRegion={focusedRegion ?? frame?.region ?? null}
            selectedFrame={frame}
            projectionLagSec={snapshot.projection.projectionLagSec}
            streamHealthy={snapshot.transport.streamHealthy}
            expanded={!mobile}
            mobile={mobile}
            onSelectRegion={selectRegion}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '1fr' : 'minmax(0, 0.98fr) minmax(400px, 0.92fr)',
              gap: mobile ? 16 : 18,
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: `calc(100vh - ${sceneTop + 18}px)`, transformStyle: 'preserve-3d', minWidth: 0 }}>
              <div style={{ padding: '0 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${P.border}`, paddingBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--m)', fontSize: 10, color: P.t3, letterSpacing: '0.12em' }}>DECISION FEED</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: P.t1 }}>
                    {snapshot.access.isReadOnlyPreview
                      ? 'Select a governed record to inspect the delayed public mirror. Full trace, replay, and proof stay inside HallOGrid Pro.'
                      : 'Lock a governed record. Trace, replay, and proof open on the right.'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--m)', fontSize: 10, color: P.t3 }}>{snapshot.frames.length} FRAMES</span>
                  <span style={{ fontFamily: 'var(--m)', fontSize: 10, color: snapshot.access.isReadOnlyPreview ? A.reroute : A.run_now, letterSpacing: '0.1em', fontWeight: 700 }}>
                    {snapshot.access.isReadOnlyPreview ? 'PREVIEW' : 'LIVE'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {snapshot.frames.map((item) => (
                  <FeedCard key={item.id} f={item} active={sel === item.id} anyActive={Boolean(sel)} onTap={selectFrame} priority={item.id === snapshot.selectedFrameId || (!snapshot.selectedFrameId && item.id === snapshot.frames[0]?.id)} />
                ))}
              </div>
            </div>

            {!mobile && frame && snapshot.access.canViewOperatorConsole ? (
              <div style={{ minHeight: `calc(100vh - ${sceneTop + 18}px)`, position: 'sticky', top: sceneTop, borderLeft: `1px solid ${P.border}`, boxShadow: `-6px 0 22px ${hex('#000000', 0.18)}`, animation: 'hallogrid-inspector-in 0.35s cubic-bezier(0.16,1,0.3,1)', overflow: 'hidden', borderRadius: 24, minWidth: 0 }}>
                <Inspector
                  f={frame}
                  detail={detail}
                  workspace={proWorkspaceQuery.data ?? null}
                  panel={panel}
                  setPanel={setPanel}
                  close={clearSelection}
                  mobile={false}
                  loading={Boolean(frame) && !detail && detailQuery.isLoading}
                  workspaceLoading={Boolean(frame) && !proWorkspaceQuery.data && proWorkspaceQuery.isLoading}
                  latestDrill={latestDrill}
                  canAccessControls={snapshot.access.canAccessControls}
                  canManageDoctrine={snapshot.access.canManageDoctrine}
                  onRunDrill={runDrill}
                  drillLoading={drillMutation.isPending}
                />
              </div>
            ) : !mobile && snapshot.access.isReadOnlyPreview ? (
              <LockedSurfacePanel access={snapshot.access} selectedFrame={frame} />
            ) : !mobile ? (
              <div style={{ minHeight: `calc(100vh - ${sceneTop + 18}px)`, position: 'sticky', top: sceneTop, padding: '24px', borderRadius: 24, border: `1px solid ${P.border}`, background: `linear-gradient(180deg, ${P.glass2} 0%, ${P.glass} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: P.t2, minWidth: 0 }}>
                <div>
                  <div style={{ fontFamily: 'var(--m)', fontSize: 11, letterSpacing: '0.12em', color: '#dbeafe' }}>SELECT A FRAME</div>
                  <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.7 }}>
                    {snapshot.access.canViewOperatorConsole
                      ? 'The governed record will lock on the right with direct trace, replay, and proof sections.'
                      : 'The public mirror stays read-only. Upgrade to HallOGrid Pro for trace-backed operator detail.'}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {mobile && frame ? (
        <div onClick={(event) => { if (event.target === event.currentTarget) clearSelection() }} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ borderRadius: '18px 18px 0 0', maxHeight: '90vh', overflow: 'hidden', animation: 'hallogrid-sheet-up 0.3s cubic-bezier(0.16,1,0.3,1)', boxShadow: `0 -12px 50px ${hex('#000000', 0.6)}` }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px', background: `${P.bg1}f8` }}><div style={{ width: 40, height: 4, borderRadius: 2, background: P.borderLit }} /></div>
            {snapshot.access.canViewOperatorConsole ? (
              <Inspector
                f={frame}
                detail={detail}
                workspace={proWorkspaceQuery.data ?? null}
                panel={panel}
                setPanel={setPanel}
                close={clearSelection}
                mobile
                loading={Boolean(frame) && !detail && detailQuery.isLoading}
                workspaceLoading={Boolean(frame) && !proWorkspaceQuery.data && proWorkspaceQuery.isLoading}
                latestDrill={latestDrill}
                canAccessControls={snapshot.access.canAccessControls}
                canManageDoctrine={snapshot.access.canManageDoctrine}
                onRunDrill={runDrill}
                drillLoading={drillMutation.isPending}
              />
            ) : (
              <LockedSurfacePanel access={snapshot.access} selectedFrame={frame} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}



















