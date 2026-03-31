type MetricKind = 'counter' | 'histogram' | 'gauge'

type MetricAttributes = Record<string, string | number | boolean | null | undefined>

type MetricRecord = {
  name: string
  kind: MetricKind
  value: number
  attributes: MetricAttributes
  recordedAt: string
}

type MetricSeries = {
  kind: MetricKind
  records: MetricRecord[]
}

const MAX_RECORDS_PER_METRIC = 500
const metricStore = new Map<string, MetricSeries>()

function ensureSeries(name: string, kind: MetricKind) {
  const existing = metricStore.get(name)
  if (existing) return existing

  const series: MetricSeries = {
    kind,
    records: [],
  }
  metricStore.set(name, series)
  return series
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)] ?? null
}

export function recordDashboardMetric(
  name: string,
  kind: MetricKind,
  value: number,
  attributes: MetricAttributes = {}
) {
  if (!Number.isFinite(value)) return

  const series = ensureSeries(name, kind)
  series.records.push({
    name,
    kind,
    value,
    attributes,
    recordedAt: new Date().toISOString(),
  })

  if (series.records.length > MAX_RECORDS_PER_METRIC) {
    series.records.splice(0, series.records.length - MAX_RECORDS_PER_METRIC)
  }
}

export function getDashboardTelemetrySnapshot() {
  const metrics = Array.from(metricStore.entries()).map(([name, series]) => {
    const values = series.records.map((record) => record.value)
    const last = series.records[series.records.length - 1] ?? null
    const total = values.reduce((sum, value) => sum + value, 0)

    return {
      name,
      kind: series.kind,
      samples: series.records.length,
      sum: Number(total.toFixed(3)),
      lastValue: last ? Number(last.value.toFixed(3)) : null,
      lastRecordedAt: last?.recordedAt ?? null,
      p50: percentile(values, 50),
      p95: percentile(values, 95),
      attributes: last?.attributes ?? {},
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    metrics,
  }
}

export const dashboardTelemetryMetricNames = {
  routeDurationMs: 'co2router.dashboard.route.duration.ms',
  routeResponseBytes: 'co2router.dashboard.route.response.bytes',
  routeCacheCount: 'co2router.dashboard.route.cache.count',
  routeErrorCount: 'co2router.dashboard.route.error.count',
  simulationEngineDurationMs: 'co2router.dashboard.simulation.engine.duration.ms',
  simulationSerializeDurationMs: 'co2router.dashboard.simulation.serialize.duration.ms',
} as const
