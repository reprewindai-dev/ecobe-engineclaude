'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Loader2, TimerReset, Users } from 'lucide-react'

import { ecobeApi } from '@/lib/api'

export function OrgRiskTable() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dekes-integration-metrics'],
    queryFn: () => ecobeApi.getDekesIntegrationMetrics(),
    refetchInterval: 60_000,
    retry: 1,
  })

  const trend = data?.hourlyTrend ?? []

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-emerald-400" />
        <div>
          <h3 className="text-lg font-semibold text-white">DEKES Operating Rhythm</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Hour-by-hour cadence derived from routed DEKES decisions.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/8 p-5 text-sm text-red-300">
          Unable to load the DEKES operating rhythm feed.
        </div>
      )}

      {!isLoading && !isError && data && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Readout label="Engine status" value={data.status} accent={data.status === 'healthy' ? 'text-emerald-300' : 'text-yellow-300'} />
            <Readout label="Uptime" value={`${data.metrics.uptime}%`} />
            <Readout label="Last checked" value={format(new Date(data.lastChecked), 'MMM d, h:mm a')} />
          </div>

          {trend.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/65 p-6 text-sm text-slate-500">
              No hourly rhythm data is available yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                    <th className="pb-3 pr-4 font-medium">Hour</th>
                    <th className="pb-3 pr-4 font-medium text-right">Requests</th>
                    <th className="pb-3 pr-4 font-medium text-right">Avg CO2</th>
                    <th className="pb-3 font-medium text-right">Motion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {trend
                    .slice()
                    .reverse()
                    .map((point) => (
                      <tr key={point.hour} className="hover:bg-slate-800/20">
                        <td className="py-3 pr-4 text-slate-300">{format(new Date(`${point.hour}:00Z`), 'MMM d, h a')}</td>
                        <td className="py-3 pr-4 text-right font-mono text-white">{point.requestCount}</td>
                        <td className="py-3 pr-4 text-right font-mono text-cyan-200">{point.avgCO2.toFixed(2)} kg</td>
                        <td className="py-3 text-right">
                          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                            <TimerReset className="h-3.5 w-3.5" />
                            live
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Readout({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/65 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-3 text-lg font-semibold ${accent ?? 'text-white'}`}>{value}</p>
    </div>
  )
}
