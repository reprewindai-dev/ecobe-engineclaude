import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const repoRoot = process.cwd()
const baseUrl = (process.env.ECOBE_ENGINE_URL || process.env.DEFAULT_ECOBE_ENGINE_URL || '').trim().replace(/\/$/, '')
const internalKey = (process.env.ECOBE_INTERNAL_API_KEY || process.env.ECOBE_ENGINE_API_KEY || '').trim()
const signatureSecret = process.env.DECISION_API_SIGNATURE_SECRET?.trim() || ''
const outputPath = process.env.RELEASE_PROOF_OUTPUT_PATH?.trim()

if (!baseUrl) {
  console.error('Missing ECOBE_ENGINE_URL or DEFAULT_ECOBE_ENGINE_URL.')
  process.exit(1)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function internalHeaders() {
  if (!internalKey) {
    return {
      Accept: 'application/json',
    }
  }

  return {
    Accept: 'application/json',
    Authorization: `Bearer ${internalKey}`,
    'x-ecobe-internal-key': internalKey,
    'x-api-key': internalKey,
  }
}

async function fetchJson(pathname, headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers,
  })
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }

  if (!response.ok) {
    throw new Error(`${pathname} returned ${response.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`)
  }

  return {
    response,
    json,
  }
}

function signBody(body) {
  if (!signatureSecret) return null
  return crypto.createHmac('sha256', signatureSecret).update(body).digest('hex')
}

async function authorizeDecision() {
  const payload = {
    requestId: `release-proof-${Date.now()}`,
    idempotencyKey: `release-proof-${Date.now()}-idempotent`,
    timestamp: new Date().toISOString(),
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
  }

  const body = JSON.stringify(payload)
  const signature = signBody(body)
  const response = await fetch(`${baseUrl}/api/v1/ci/authorize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signature ? { 'x-ecobe-signature': `v1=${signature}` } : {}),
    },
    body,
  })

  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }

  if (!response.ok) {
    throw new Error(`authorize returned ${response.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`)
  }

  return {
    response,
    json,
  }
}

function findMetric(snapshot, name) {
  const metrics = snapshot?.metrics?.metrics
  if (!Array.isArray(metrics)) return null
  return metrics.find((metric) => metric?.name === name) ?? null
}

const health = await fetchJson('/health')
assert(['healthy', 'ok', 'degraded'].includes(String(health.json?.status)), '/health missing valid status')

const ciHealth = await fetchJson('/api/v1/ci/health')
assert(typeof ciHealth.json === 'object' && ciHealth.json !== null, '/api/v1/ci/health missing object payload')

const slo = await fetchJson('/api/v1/ci/slo')
const p95Total = Number(slo.json?.currentMs?.total?.p95 ?? NaN)
const p95Compute = Number(slo.json?.currentMs?.compute?.p95 ?? NaN)
assert(Number.isFinite(p95Total), '/api/v1/ci/slo missing p95 total')
assert(Number.isFinite(p95Compute), '/api/v1/ci/slo missing p95 compute')
assert(p95Total <= 100, `engine p95 total above gate: ${p95Total}`)
assert(p95Compute <= 50, `engine p95 compute above gate: ${p95Compute}`)

const provenance = await fetchJson('/api/v1/water/provenance')
const provenanceVerified = Number(
  provenance.json?.verified ??
    provenance.json?.summary?.verified ??
    provenance.json?.counts?.verified ??
    0,
)
const provenanceMismatch = Number(
  provenance.json?.mismatch ??
    provenance.json?.mismatched ??
    provenance.json?.summary?.mismatch ??
    provenance.json?.counts?.mismatch ??
    0,
)
assert(provenanceVerified >= 1, 'water provenance verification missing or empty')

const cache = await fetchJson('/api/v1/system/cache', internalHeaders())
const requiredWarmCoveragePct = Number(cache.json?.cache?.requiredWarmCoveragePct ?? NaN)
assert(Number.isFinite(requiredWarmCoveragePct), 'system/cache missing requiredWarmCoveragePct')
assert(requiredWarmCoveragePct >= 95, `required warm coverage below gate: ${requiredWarmCoveragePct}`)

const authorize = await authorizeDecision()
const decisionFrameId = authorize.json?.decisionFrameId
assert(typeof decisionFrameId === 'string' && decisionFrameId.length > 0, 'authorize response missing decisionFrameId')
assert(Boolean(authorize.response.headers.get('Replay-Trace-ID')), 'authorize response missing Replay-Trace-ID header')
assert(Boolean(authorize.response.headers.get('X-CO2Router-Trace-Hash')), 'authorize response missing X-CO2Router-Trace-Hash header')

const trace = await fetchJson(`/api/v1/ci/decisions/${decisionFrameId}/trace`, internalHeaders())
assert(trace.json?.decisionFrameId === decisionFrameId, 'trace response missing matching decisionFrameId')

const replay = await fetchJson(`/api/v1/ci/decisions/${decisionFrameId}/replay`, internalHeaders())
assert(replay.json?.decisionFrameId === decisionFrameId, 'replay response missing matching decisionFrameId')
assert(replay.json?.deterministicMatch === true, 'replay response is not deterministic')

const telemetry = await fetchJson('/api/v1/ci/telemetry')
const leakMetric = findMetric(telemetry.json, 'ecobe.routing.hot_path.provider_leak.count')
const leakSum = Number(leakMetric?.sum ?? 0)
assert(leakSum === 0, `hot-path provider leak count must be zero, got ${leakSum}`)

const result = {
  ok: true,
  checkedAt: new Date().toISOString(),
  baseUrl,
  smoke: {
    health: health.json?.status,
    ciHealth: ciHealth.json?.status ?? 'ok',
  },
  slo: {
    p95Total,
    p95Compute,
    counts: slo.json?.counts ?? null,
  },
  provenance: {
    verified: provenanceVerified,
    mismatch: provenanceMismatch,
  },
  cache: {
    requiredWarmCoveragePct,
    requiredLkgCoveragePct: cache.json?.cache?.requiredLkgCoveragePct ?? null,
    healthy: cache.json?.cache?.healthy ?? null,
  },
  authorize: {
    decisionFrameId,
    replayTraceId: authorize.response.headers.get('Replay-Trace-ID'),
    traceHash: authorize.response.headers.get('X-CO2Router-Trace-Hash'),
    governanceSource:
      authorize.json?.policyTrace?.sekedPolicy?.source ??
      authorize.json?.policyTrace?.governance?.source ??
      authorize.json?.governance?.source ??
      null,
  },
  replay: {
    deterministicMatch: replay.json?.deterministicMatch === true,
    mismatches: replay.json?.mismatches ?? [],
  },
  telemetry: {
    hotPathProviderLeakCount: leakSum,
    replayMismatchCount: Number(findMetric(telemetry.json, 'ecobe.replay.mismatch.count')?.sum ?? 0),
  },
}

if (outputPath) {
  const resolved = path.resolve(repoRoot, outputPath)
  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  fs.writeFileSync(resolved, JSON.stringify(result, null, 2))
}

console.log(JSON.stringify(result, null, 2))
