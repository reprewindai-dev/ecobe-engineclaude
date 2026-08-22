'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CiRouteResponse,
  CommandCenterSnapshot,
  ControlSurfaceOverview,
  DecisionTraceRawRecord,
  HallOGridDrillRun,
  HallOGridDoctrineSummary,
  HallOGridFrameDetail,
  HallOGridOverrideRecord,
  HallOGridProWorkspace,
  HallOGridSnapshot,
  LandingSnapshot,
  LiveSystemSnapshot,
  ReplayBundle,
  SimulationMode,
  SimulationRouteResponse,
} from '@/types/control-surface'
import {
  FALLBACK_COMMAND_CENTER_SNAPSHOT,
  FALLBACK_LANDING_SNAPSHOT,
  FALLBACK_LIVE_SYSTEM_SNAPSHOT,
} from '@/lib/control-surface/fallbacks'

const REFRESH_INTERVAL_MS = 30_000

async function getJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed with ${response.status}`)
  }

  return (await response.json()) as T
}

export function useControlSurfaceOverview() {
  return useQuery<ControlSurfaceOverview>({
    queryKey: ['control-surface-overview'],
    queryFn: () => getJson<ControlSurfaceOverview>('/api/control-surface/overview'),
    staleTime: REFRESH_INTERVAL_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
  })
}

export function useCommandCenterSnapshot() {
  return useQuery<CommandCenterSnapshot>({
    queryKey: ['control-surface-command-center'],
    queryFn: () => getJson<CommandCenterSnapshot>('/api/control-surface/command-center'),
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    placeholderData: FALLBACK_COMMAND_CENTER_SNAPSHOT,
  })
}

export function useDecisionTrace(
  decisionFrameId: string | null,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  return useQuery<DecisionTraceRawRecord>({
    queryKey: ['control-surface-trace', decisionFrameId],
    queryFn: () => getJson<DecisionTraceRawRecord>(`/api/control-surface/trace/${decisionFrameId}`),
    enabled: Boolean(decisionFrameId) && (options?.enabled ?? true),
    staleTime: REFRESH_INTERVAL_MS,
    refetchInterval: options?.refetchInterval,
  })
}

export function useReplayBundle(
  decisionFrameId: string | null,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  return useQuery<ReplayBundle>({
    queryKey: ['control-surface-replay', decisionFrameId],
    queryFn: () => getJson<ReplayBundle>(`/api/control-surface/replay/${decisionFrameId}`),
    enabled: Boolean(decisionFrameId) && (options?.enabled ?? true),
    staleTime: REFRESH_INTERVAL_MS,
    refetchInterval: options?.refetchInterval,
  })
}

export function useLiveSystemSnapshot() {
  return useQuery<LiveSystemSnapshot>({
    queryKey: ['control-surface-live-system'],
    queryFn: () => getJson<LiveSystemSnapshot>('/api/control-surface/live-system'),
    staleTime: REFRESH_INTERVAL_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
    placeholderData: FALLBACK_LIVE_SYSTEM_SNAPSHOT,
  })
}

export function useSimulation(mode: SimulationMode = 'fast') {
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      getJson<SimulationRouteResponse>(`/api/control-surface/simulate?mode=${mode}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  })
}

export function useHallOGridSnapshot() {
  return useQuery<HallOGridSnapshot>({
    queryKey: ['hallogrid-snapshot'],
    queryFn: () => getJson<HallOGridSnapshot>('/api/control-surface/hallogrid'),
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  })
}

export function useLandingSnapshot() {
  return useQuery<LandingSnapshot>({
    queryKey: ['landing-snapshot'],
    queryFn: () => getJson<LandingSnapshot>('/api/landing/snapshot'),
    staleTime: REFRESH_INTERVAL_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    placeholderData: FALLBACK_LANDING_SNAPSHOT,
  })
}

export function useHallOGridFrame(
  decisionFrameId: string | null,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  return useQuery<HallOGridFrameDetail>({
    queryKey: ['hallogrid-frame', decisionFrameId],
    queryFn: () =>
      getJson<HallOGridFrameDetail>(
        `/api/control-surface/hallogrid/frame/${encodeURIComponent(decisionFrameId!)}`
      ),
    enabled: Boolean(decisionFrameId) && (options?.enabled ?? true),
    staleTime: REFRESH_INTERVAL_MS,
    refetchInterval: options?.refetchInterval,
  })
}

export function useHallOGridProWorkspace(
  decisionFrameId: string | null,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  return useQuery<HallOGridProWorkspace>({
    queryKey: ['hallogrid-pro-workspace', decisionFrameId],
    queryFn: () =>
      getJson<HallOGridProWorkspace>(
        `/api/control-surface/hallogrid/pro/${encodeURIComponent(decisionFrameId!)}`
      ),
    enabled: Boolean(decisionFrameId) && (options?.enabled ?? true),
    staleTime: REFRESH_INTERVAL_MS,
    refetchInterval: options?.refetchInterval,
  })
}

export function useHallOGridDrill() {
  return useMutation({
    mutationFn: (payload: { frameId: string; scenario: string }) =>
      getJson<HallOGridDrillRun>('/api/control-surface/hallogrid/drills', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  })
}

export function useHallOGridDoctrineMutation(decisionFrameId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: {
      automationMode: HallOGridDoctrineSummary['automationMode']
      failMode: HallOGridDoctrineSummary['failMode']
      activePolicyLabel: string
    }) =>
      getJson<HallOGridDoctrineSummary>(
        `/api/control-surface/hallogrid/doctrine/${encodeURIComponent(decisionFrameId!)}`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['hallogrid-pro-workspace', decisionFrameId] })
    },
  })
}

export function useHallOGridCreateOverrideMutation(decisionFrameId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: {
      requestedAction: HallOGridOverrideRecord['requestedAction']
      reasonCode: string
      scope: string
      ticketRef: string
      expiresInHours?: number | null
    }) =>
      getJson<HallOGridOverrideRecord[]>(
        `/api/control-surface/hallogrid/overrides/${encodeURIComponent(decisionFrameId!)}`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['hallogrid-pro-workspace', decisionFrameId] })
    },
  })
}

export function useHallOGridOverrideStatusMutation(decisionFrameId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: {
      overrideId: string
      status: HallOGridOverrideRecord['status']
    }) =>
      getJson<HallOGridOverrideRecord[]>(
        `/api/control-surface/hallogrid/overrides/${encodeURIComponent(decisionFrameId!)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['hallogrid-pro-workspace', decisionFrameId] })
    },
  })
}
