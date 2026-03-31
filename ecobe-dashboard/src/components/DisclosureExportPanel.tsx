'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileCheck, RefreshCw, ShieldCheck } from 'lucide-react'
import { ecobeApi } from '@/lib/api'
import type { PolicyMode } from '@/types'

type ExportMode = 'assurance' | 'optimize' | 'all'

function buildWindow(days: number) {
  const to = new Date()
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  }
}

export function DisclosureExportPanel() {
  const [mode, setMode] = useState<ExportMode>('assurance')
  const [policyMode, setPolicyMode] = useState<PolicyMode>('sec_disclosure_strict')
  const [windowDays, setWindowDays] = useState(30)

  const windowRange = buildWindow(windowDays)

  const exportQuery = useQuery({
    queryKey: ['disclosure-export', mode, policyMode, windowDays],
    queryFn: () =>
      ecobeApi.getDisclosureExport({
        ...windowRange,
        mode,
        policyMode,
      }),
  })

  const batchesQuery = useQuery({
    queryKey: ['disclosure-batches'],
    queryFn: () => ecobeApi.getDisclosureBatches(10),
  })

  const csvHref = useMemo(() => {
    const params = new URLSearchParams({
      format: 'csv',
      from: windowRange.from,
      to: windowRange.to,
      mode,
      policyMode,
    })
    return `/api/ecobe/disclosure/export?${params.toString()}`
  }, [mode, policyMode, windowRange.from, windowRange.to])

  const records = exportQuery.data?.records ?? []
  const totalEmissions = records.reduce((sum, record) => sum + (record.emissions_gco2 ?? 0), 0)
  const assuranceRate = records.length
    ? (records.filter((record) => record.assurance_mode).length / records.length) * 100
    : 0

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-400">
            Disclosure Export
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Audit-ready hourly emissions records
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
            This panel pulls live disclosure batches from the engine. Assurance mode keeps routing
            on conservative, provenance-rich signals and emits tamper-evident export metadata for
            compliance and investor review.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs text-slate-400">
            Export mode
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as ExportMode)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="assurance">Assurance only</option>
              <option value="optimize">Optimize only</option>
              <option value="all">All decisions</option>
            </select>
          </label>

          <label className="text-xs text-slate-400">
            Policy mode
            <select
              value={policyMode}
              onChange={(event) => setPolicyMode(event.target.value as PolicyMode)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="sec_disclosure_strict">SEC disclosure strict</option>
              <option value="eu_24x7_ready">EU 24x7 ready</option>
              <option value="default">Default routing</option>
            </select>
          </label>

          <label className="text-xs text-slate-400">
            Window
            <select
              value={windowDays}
              onChange={(event) => setWindowDays(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            void exportQuery.refetch()
            void batchesQuery.refetch()
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:text-white"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh live export
        </button>
        <a
          href={csvHref}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
        >
          <Download className="h-4 w-4" />
          Download CSV
        </a>
      </div>

      {exportQuery.isLoading ? (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-6 text-sm text-slate-400">
          Loading disclosure export from the live engine.
        </div>
      ) : exportQuery.isError ? (
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-300">
          {exportQuery.error instanceof Error
            ? exportQuery.error.message
            : 'Disclosure export is unavailable.'}
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Records</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {exportQuery.data?.record_count ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Assurance Rate</p>
              <p className="mt-2 text-2xl font-semibold text-cyan-400">
                {assuranceRate.toFixed(0)}%
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Emissions</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-400">
                {(totalEmissions / 1000).toFixed(2)} kg
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Integrity Hash</p>
              <p className="mt-2 truncate font-mono text-sm text-slate-200">
                {exportQuery.data?.hash ?? 'Unavailable'}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
                <p className="text-sm font-medium text-white">Standards-aligned export fields</p>
              </div>
              <div className="mt-4 space-y-3">
                {exportQuery.data?.standards_mapping.slice(0, 6).map((row) => (
                  <div
                    key={`${row.framework}-${row.ecobeField}-${row.standardField}`}
                    className="rounded-lg border border-slate-800 bg-slate-900/80 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-200">{row.framework}</p>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        {row.ecobeField}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-cyan-300">{row.standardField}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.note}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
                <div className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-emerald-400" />
                  <p className="text-sm font-medium text-white">Recent export batches</p>
                </div>
                <div className="mt-4 space-y-3">
                  {(batchesQuery.data?.batches ?? []).slice(0, 5).map((batch) => (
                    <div
                      key={`${batch.batchId}-${batch.generatedAt}`}
                      className="rounded-lg border border-slate-800 bg-slate-900/80 p-3"
                    >
                      <p className="truncate font-mono text-xs text-slate-300">
                        {batch.batchId ?? 'unknown_batch'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{batch.generatedAt}</p>
                    </div>
                  ))}
                  {!batchesQuery.data?.batches?.length && (
                    <p className="text-sm text-slate-500">No batches recorded yet.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
                <p className="text-sm font-medium text-white">Latest records</p>
                <div className="mt-4 space-y-3">
                  {records.slice(-3).reverse().map((record) => (
                    <div
                      key={record.decision_id}
                      className="rounded-lg border border-slate-800 bg-slate-900/80 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-mono text-xs text-slate-300">{record.region}</p>
                        <p className="text-xs text-slate-500">{record.mode}</p>
                      </div>
                      <p className="mt-1 text-sm text-white">
                        {record.intensity_gco2_per_kwh ?? '--'} gCO2/kWh
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {record.source ?? 'unknown source'} · confidence {record.confidence_label ?? 'n/a'}
                      </p>
                    </div>
                  ))}
                  {!records.length && (
                    <p className="text-sm text-slate-500">
                      No decision records exist for the selected window.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
