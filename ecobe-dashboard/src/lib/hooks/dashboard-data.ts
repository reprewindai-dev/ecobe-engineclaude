'use client'

import { useQuery } from '@tanstack/react-query'

import { ecobeApi } from '@/lib/api'
import type {
  DashboardMetrics,
  DashboardSavings,
  DashboardDecision,
  DekesAnalytics,
} from '@/types'

const DEFAULT_REFRESH_INTERVAL = 60_000

export function useDashboardMetrics(window: '24h' | '7d' = '24h') {
  return useQuery<DashboardMetrics>({
    queryKey: ['dashboard-metrics', window],
    queryFn: () => ecobeApi.getDashboardMetrics(window),
    staleTime: DEFAULT_REFRESH_INTERVAL,
    refetchInterval: DEFAULT_REFRESH_INTERVAL,
  })
}

export function useDashboardSavings(window: '24h' | '7d' | '30d' = '30d') {
  return useQuery<DashboardSavings>({
    queryKey: ['dashboard-savings', window],
    queryFn: () => ecobeApi.getDashboardSavings(window),
    staleTime: DEFAULT_REFRESH_INTERVAL,
    refetchInterval: DEFAULT_REFRESH_INTERVAL,
  })
}

export function useRecentDecisions(limit = 40) {
  return useQuery<{ decisions: DashboardDecision[] }>({
    queryKey: ['dashboard-decisions', limit],
    queryFn: () => ecobeApi.getDecisions(limit),
    staleTime: DEFAULT_REFRESH_INTERVAL,
    refetchInterval: DEFAULT_REFRESH_INTERVAL,
  })
}

export function useDekesAnalytics(params?: {
  dekesQueryId?: string
  startDate?: string
  endDate?: string
}) {
  return useQuery<DekesAnalytics>({
    queryKey: [
      'dekes-analytics',
      params?.dekesQueryId ?? 'all',
      params?.startDate ?? null,
      params?.endDate ?? null,
    ],
    queryFn: () => ecobeApi.getDekesAnalytics(params),
    staleTime: DEFAULT_REFRESH_INTERVAL,
    refetchInterval: DEFAULT_REFRESH_INTERVAL,
  })
}
