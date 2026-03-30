import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { performance } from 'perf_hooks'
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true })

const DEFAULT_BASE_URL =
  process.env.LOAD_TEST_BASE_URL ??
  process.env.ECOBE_ENGINE_URL ??
  'https://ecobe-engineclaude-production.up.railway.app'

const OUTPUT_DIR = path.resolve(process.cwd(), 'data', 'perf', 'ci-load-tests')
const LATEST_PATH = path.join(OUTPUT_DIR, 'latest.json')

type ScenarioDefinition = {
  id: 'minimal' | 'medium' | 'hard'
  label: string
  simulatedUsers: number
  requests: number
  concurrency: number
  timeoutMs: number
}

type RequestTemplate = {
  preferredRegions: string[]
  jobType: 'standard' | 'heavy' | 'light'
  criticality: 'critical' | 'standard' | 'batch'
  waterPolicyProfile: 'default' | 'drought_sensitive' | 'eu_data_center_reporting' | 'high_water_sensitivity'
  allowDelay: boolean
  criticalPath: boolean
  signalPolicy: 'marginal_first' | 'average_fallback'
  carbonWeight: number
  waterWeight: number
  latencyWeight: number
  costWeight: number
}

type ScenarioResult = {
  id: ScenarioDefinition['id']
  label: string
  baseUrl: string
  simulatedUsers: number
  requests: number
  concurrency: number
  durationMs: number
  throughputRps: number
  successRate: number
  statusCounts: Record<string, number>
  actionCounts: Record<string, number>
  reasonCounts: Record<string, number>
  traceHeadersPresent: number
  traceHashHeadersPresent: number
  latency: {
    minMs: number
    p50Ms: number
    p95Ms: number
    p99Ms: number
    maxMs: number
    avgMs: number
  }
  errors: Array<{
    code: string
    message: string
    status?: number
  }>
  sloAfter: unknown
  telemetryAfter: unknown
  cacheAfter: unknown
  sampledFrames: Array<{
    decisionFrameId: string
    replayTraceId: string | null
    traceHash: string | null
  }>
  replaySamples: Array<{
    decisionFrameId: string
    traceOk: boolean
    replayOk: boolean
    deterministicMatch: boolean
    mismatches: string[]
  }>
  releaseSignals: {
    fallbackCount: number
    hotPathProviderLeakCount: number
    replayMismatchCount: number
    requiredWarmCoveragePct: number | null
  }
}

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'minimal',
    label: 'Minimal usage',
    simulatedUsers: 8,
    requests: 12,
    concurrency: 1,
    timeoutMs: 20_000,
  },
  {
    id: 'medium',
    label: 'Medium usage',
    simulatedUsers: 60,
    requests: 90,
    concurrency: 12,
    timeoutMs: 20_000,
  },
  {
    id: 'hard',
    label: 'Hard usage (200+ simulated users)',
    simulatedUsers: 240,
    requests: 240,
    concurrency: 48,
    timeoutMs: 25_000,
  },
]

const RELEASE_GATES_ENABLED = process.argv.includes('--release-gates')
const MAX_REPLAY_SAMPLES = 5

const REQUEST_TEMPLATES: RequestTemplate[] = [
  {
    preferredRegions: ['us-west-2', 'us-east-1', 'eu-west-1'],
    jobType: 'standard',
    criticality: 'standard',
    waterPolicyProfile: 'default',
    allowDelay: true,
    criticalPath: false,
    signalPolicy: 'marginal_first',
    carbonWeight: 0.7,
    waterWeight: 0.3,
    latencyWeight: 0.1,
    costWeight: 0.1,
  },
  {
    preferredRegions: ['us-east-1', 'us-west-2', 'eu-central-1'],
    jobType: 'standard',
    criticality: 'critical',
    waterPolicyProfile: 'default',
    allowDelay: true,
    criticalPath: true,
    signalPolicy: 'marginal_first',
    carbonWeight: 0.68,
    waterWeight: 0.22,
    latencyWeight: 0.15,
    costWeight: 0.08,
  },
  {
    preferredRegions: ['eu-west-1', 'eu-central-1', 'us-west-2'],
    jobType: 'standard',
    criticality: 'standard',
    waterPolicyProfile: 'eu_data_center_reporting',
    allowDelay: true,
    criticalPath: false,
    signalPolicy: 'average_fallback',
    carbonWeight: 0.65,
    waterWeight: 0.35,
    latencyWeight: 0.1,
    costWeight: 0.1,
  },
  {
    preferredRegions: ['ap-southeast-1', 'ap-northeast-1', 'eu-west-1'],
    jobType: 'light',
    criticality: 'batch',
    waterPolicyProfile: 'high_water_sensitivity',
    allowDelay: true,
    criticalPath: false,
    signalPolicy: 'average_fallback',
    carbonWeight: 0.6,
    waterWeight: 0.4,
    latencyWeight: 0.1,
    costWeight: 0.1,
  },
  {
    preferredRegions: ['us-west-1', 'us-west-2', 'us-east-2'],
    jobType: 'heavy',
    criticality: 'batch',
    waterPolicyProfile: 'drought_sensitive',
    allowDelay: true,
    criticalPath: false,
    signalPolicy: 'average_fallback',
    carbonWeight: 0.62,
    waterWeight: 0.38,
    latencyWeight: 0.1,
    costWeight: 0.1,
  },
]

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

function writeJson(filePath: string, value: unknown) {
  ensureOutputDir()
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return Number((sorted[Math.max(0, index)] ?? 0).toFixed(3))
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3))
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildPayload(scenarioId: ScenarioDefinition['id'], index: number) {
  const template = REQUEST_TEMPLATES[index % REQUEST_TEMPLATES.length]
  const requestId = `load-${scenarioId}-${index}-${Date.now()}`
  return {
    ...template,
    requestId,
    idempotencyKey: `${requestId}-idempotent`,
    decisionMode: 'runtime_authorization' as const,
    metadata: {
      testHarness: 'ci-load-test',
      scenarioId,
      requestOrdinal: index,
    },
    timestamp: new Date().toISOString(),
  }
}

function signBody(body: string) {
  const secret = process.env.DECISION_API_SIGNATURE_SECRET
  if (!secret) return null
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

async function fetchSlo(baseUrl: string) {
  const response = await axios.get(`${baseUrl}/api/v1/ci/slo`, {
    timeout: 20_000,
  })
  return response.data
}

function buildInternalHeaders() {
  const internalKey =
    process.env.ECOBE_INTERNAL_API_KEY?.trim() || process.env.ECOBE_ENGINE_API_KEY?.trim() || ''
  if (!internalKey) return {}
  return {
    Authorization: `Bearer ${internalKey}`,
    'x-ecobe-internal-key': internalKey,
    'x-api-key': internalKey,
  }
}

async function fetchTelemetry(baseUrl: string) {
  const response = await axios.get(`${baseUrl}/api/v1/ci/telemetry`, {
    timeout: 20_000,
  })
  return response.data
}

async function fetchCacheHealth(baseUrl: string) {
  const response = await axios.get(`${baseUrl}/api/v1/system/cache`, {
    timeout: 20_000,
    headers: buildInternalHeaders(),
  })
  return response.data
}

function findMetric(snapshot: any, name: string) {
  const metrics = snapshot?.metrics?.metrics
  if (!Array.isArray(metrics)) return null
  return metrics.find((metric) => metric?.name === name) ?? null
}

async function verifyReplaySamples(
  baseUrl: string,
  frames: ScenarioResult['sampledFrames']
): Promise<ScenarioResult['replaySamples']> {
  const headers = buildInternalHeaders()
  const replaySamples: ScenarioResult['replaySamples'] = []

  for (const frame of frames.slice(0, MAX_REPLAY_SAMPLES)) {
    try {
      const [traceResponse, replayResponse] = await Promise.all([
        axios.get(`${baseUrl}/api/v1/ci/decisions/${frame.decisionFrameId}/trace`, {
          timeout: 20_000,
          headers,
        }),
        axios.get(`${baseUrl}/api/v1/ci/decisions/${frame.decisionFrameId}/replay`, {
          timeout: 20_000,
          headers,
        }),
      ])

      replaySamples.push({
        decisionFrameId: frame.decisionFrameId,
        traceOk: traceResponse.status === 200,
        replayOk: replayResponse.status === 200,
        deterministicMatch: replayResponse.data?.deterministicMatch === true,
        mismatches: Array.isArray(replayResponse.data?.mismatches) ? replayResponse.data.mismatches : [],
      })
    } catch (error: any) {
      replaySamples.push({
        decisionFrameId: frame.decisionFrameId,
        traceOk: false,
        replayOk: false,
        deterministicMatch: false,
        mismatches: [error?.message ?? 'Replay verification failed'],
      })
    }
  }

  return replaySamples
}

async function runScenario(baseUrl: string, scenario: ScenarioDefinition): Promise<ScenarioResult> {
  const latencies: number[] = []
  const statusCounts: Record<string, number> = {}
  const actionCounts: Record<string, number> = {}
  const reasonCounts: Record<string, number> = {}
  const errors: ScenarioResult['errors'] = []
  let traceHeadersPresent = 0
  let traceHashHeadersPresent = 0
  const sampledFrames: ScenarioResult['sampledFrames'] = []
  let nextIndex = 0
  let completed = 0
  const startedAt = performance.now()

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1
      if (currentIndex >= scenario.requests) return

      const payload = buildPayload(scenario.id, currentIndex)
      const body = JSON.stringify(payload)
      const signature = signBody(body)
      const requestStartedAt = performance.now()

      try {
        const response = await axios.post(`${baseUrl}/api/v1/ci/authorize`, body, {
          timeout: scenario.timeoutMs,
          validateStatus: () => true,
          headers: {
            'Content-Type': 'application/json',
            ...(signature ? { 'x-ecobe-signature': `v1=${signature}` } : {}),
          },
        })

        const elapsedMs = Number((performance.now() - requestStartedAt).toFixed(3))
        latencies.push(elapsedMs)
        increment(statusCounts, String(response.status))

        const action =
          response.data?.decisionEnvelope?.action ??
          response.data?.decision ??
          response.data?.action ??
          'unknown'
        const reasonCode =
          response.data?.decisionEnvelope?.reasonCode ??
          response.data?.reasonCode ??
          response.data?.policyTrace?.reasonCodes?.[0] ??
          'unknown'

        increment(actionCounts, String(action))
        increment(reasonCounts, String(reasonCode))

        if (response.headers['replay-trace-id']) {
          traceHeadersPresent += 1
        }
        if (response.headers['x-co2router-trace-hash']) {
          traceHashHeadersPresent += 1
        }
        if (
          response.status >= 200 &&
          response.status < 300 &&
          typeof response.data?.decisionFrameId === 'string' &&
          sampledFrames.length < MAX_REPLAY_SAMPLES
        ) {
          sampledFrames.push({
            decisionFrameId: response.data.decisionFrameId,
            replayTraceId: response.headers['replay-trace-id'] ?? null,
            traceHash: response.headers['x-co2router-trace-hash'] ?? null,
          })
        }

        if (response.status >= 400 && errors.length < 10) {
          errors.push({
            code: 'HTTP_ERROR',
            status: response.status,
            message:
              typeof response.data?.error === 'string'
                ? response.data.error
                : `Unexpected status ${response.status}`,
          })
        }
      } catch (error: any) {
        const elapsedMs = Number((performance.now() - requestStartedAt).toFixed(3))
        latencies.push(elapsedMs)
        increment(statusCounts, 'network_error')
        if (errors.length < 10) {
          errors.push({
            code: error?.code ?? 'REQUEST_FAILED',
            status: error?.response?.status,
            message: error?.message ?? 'Request failed',
          })
        }
      }

      completed += 1
      if (completed % 25 === 0 || completed === scenario.requests) {
        console.log(`  ${scenario.label}: ${completed}/${scenario.requests}`)
      }
    }
  }

  await Promise.all(
    Array.from({ length: scenario.concurrency }, () => worker())
  )

  const durationMs = Number((performance.now() - startedAt).toFixed(3))
  const successCount = Object.entries(statusCounts)
    .filter(([status]) => /^\d+$/.test(status) && Number(status) >= 200 && Number(status) < 300)
    .reduce((sum, [, count]) => sum + count, 0)
  const [sloAfter, telemetryAfter, cacheAfter] = await Promise.all([
    fetchSlo(baseUrl),
    fetchTelemetry(baseUrl),
    fetchCacheHealth(baseUrl),
  ])
  const replaySamples = await verifyReplaySamples(baseUrl, sampledFrames)
  const fallbackCount = Number(
    findMetric(telemetryAfter, 'ecobe.authorization.fallback.count')?.sum ?? 0
  )
  const hotPathProviderLeakCount = Number(
    findMetric(telemetryAfter, 'ecobe.routing.hot_path.provider_leak.count')?.sum ?? 0
  )
  const replayMismatchCount = Number(
    findMetric(telemetryAfter, 'ecobe.replay.mismatch.count')?.sum ?? 0
  )
  const requiredWarmCoveragePct = Number(
    cacheAfter?.cache?.requiredWarmCoveragePct ?? NaN
  )

  return {
    id: scenario.id,
    label: scenario.label,
    baseUrl,
    simulatedUsers: scenario.simulatedUsers,
    requests: scenario.requests,
    concurrency: scenario.concurrency,
    durationMs,
    throughputRps: Number((scenario.requests / (durationMs / 1000)).toFixed(3)),
    successRate: Number((successCount / scenario.requests).toFixed(4)),
    statusCounts,
    actionCounts,
    reasonCounts,
    traceHeadersPresent,
    traceHashHeadersPresent,
    latency: {
      minMs: Number((Math.min(...latencies) || 0).toFixed(3)),
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      p99Ms: percentile(latencies, 99),
      maxMs: Number((Math.max(...latencies) || 0).toFixed(3)),
      avgMs: average(latencies),
    },
    errors,
    sloAfter,
    telemetryAfter,
    cacheAfter,
    sampledFrames,
    replaySamples,
    releaseSignals: {
      fallbackCount,
      hotPathProviderLeakCount,
      replayMismatchCount,
      requiredWarmCoveragePct: Number.isFinite(requiredWarmCoveragePct)
        ? Number(requiredWarmCoveragePct.toFixed(3))
        : null,
    },
  }
}

function assertReleaseGates(results: ScenarioResult[]) {
  const failures: string[] = []

  for (const result of results) {
    const p95Total = Number((result.sloAfter as any)?.currentMs?.total?.p95 ?? NaN)
    const p95Compute = Number((result.sloAfter as any)?.currentMs?.compute?.p95 ?? NaN)

    if (!Number.isFinite(p95Total) || p95Total > 100) {
      failures.push(`${result.id}: engine p95 total above gate (${p95Total})`)
    }

    if (!Number.isFinite(p95Compute) || p95Compute > 50) {
      failures.push(`${result.id}: engine p95 compute above gate (${p95Compute})`)
    }

    if (result.releaseSignals.hotPathProviderLeakCount !== 0) {
      failures.push(
        `${result.id}: hot-path provider leak count must be zero (${result.releaseSignals.hotPathProviderLeakCount})`
      )
    }

    if (result.releaseSignals.replayMismatchCount !== 0) {
      failures.push(
        `${result.id}: replay mismatch count must be zero (${result.releaseSignals.replayMismatchCount})`
      )
    }

    if (
      result.releaseSignals.requiredWarmCoveragePct == null ||
      result.releaseSignals.requiredWarmCoveragePct < 95
    ) {
      failures.push(
        `${result.id}: required warm coverage below gate (${result.releaseSignals.requiredWarmCoveragePct})`
      )
    }

    const failedReplaySample = result.replaySamples.find(
      (sample) => !sample.traceOk || !sample.replayOk || !sample.deterministicMatch
    )
    if (failedReplaySample) {
      failures.push(
        `${result.id}: replay sample failed for ${failedReplaySample.decisionFrameId}`
      )
    }
  }

  if (failures.length > 0) {
    console.error('Release-gate failures detected:')
    for (const failure of failures) {
      console.error(` - ${failure}`)
    }
    process.exitCode = 1
  }
}

async function main() {
  const baseUrl = DEFAULT_BASE_URL.replace(/\/$/, '')
  console.log(`Running CI load simulations against ${baseUrl}`)

  const results: ScenarioResult[] = []
  for (const scenario of SCENARIOS) {
    console.log(`Starting ${scenario.label} (${scenario.requests} requests @ concurrency ${scenario.concurrency})`)
    const result = await runScenario(baseUrl, scenario)
    results.push(result)
    await wait(1_500)
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    scenarios: results,
  }

  writeJson(LATEST_PATH, report)
  console.log(`Wrote ${LATEST_PATH}`)

  for (const result of results) {
    console.log(
      `${result.label}: success ${(result.successRate * 100).toFixed(1)}% | p95 ${result.latency.p95Ms} ms | throughput ${result.throughputRps} rps`
    )
    console.log(
      `  release signals: fallback ${result.releaseSignals.fallbackCount} | leak ${result.releaseSignals.hotPathProviderLeakCount} | replay mismatch ${result.releaseSignals.replayMismatchCount} | warm coverage ${result.releaseSignals.requiredWarmCoveragePct}`
    )
  }

  if (RELEASE_GATES_ENABLED) {
    assertReleaseGates(results)
  }
}

main().catch((error) => {
  console.error('CI load test failed:', error)
  process.exitCode = 1
})
