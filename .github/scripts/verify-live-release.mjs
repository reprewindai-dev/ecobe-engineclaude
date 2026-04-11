import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const repoRoot = process.cwd()
function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/$/, '')
  if (!trimmed) return ''

  try {
    const url = new URL(trimmed)
    return url.origin
  } catch {
    // Best-effort cleanup for non-URL inputs.
    return trimmed.replace(/\/api\/v1$/, '').replace(/\/api$/, '').replace(/\/$/, '')
  }
}

const configuredBaseUrl = normalizeBaseUrl(process.env.ECOBE_ENGINE_URL || process.env.DEFAULT_ECOBE_ENGINE_URL || '')
const FALLBACK_ENGINE_URL = 'https://ecobe-engineclaude-co2router.onrender.com'
let baseUrl = configuredBaseUrl
const dashboardUrl = (process.env.DASHBOARD_URL || process.env.DEFAULT_DASHBOARD_URL || '').trim().replace(/\/$/, '')
const internalKey = (process.env.ECOBE_INTERNAL_API_KEY || process.env.ECOBE_ENGINE_API_KEY || '').trim()
const signatureSecret = process.env.DECISION_API_SIGNATURE_SECRET?.trim() || ''
const outputPath = process.env.RELEASE_PROOF_OUTPUT_PATH?.trim()
const checkpoint = {
  ok: false,
  checkedAt: new Date().toISOString(),
  baseUrl,
  dashboardUrl: dashboardUrl || null,
  stages: {},
}

if (!baseUrl) {
  console.error('Missing ECOBE_ENGINE_URL or DEFAULT_ECOBE_ENGINE_URL.')
  process.exit(1)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function stage(name, details = {}) {
  checkpoint.stages[name] = {
    ok: true,
    checkedAt: new Date().toISOString(),
    ...details,
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
    const error = new Error(
      `${pathname} returned ${response.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`
    )
    error.status = response.status
    error.payload = json
    throw error
  }

  return {
    response,
    json,
  }
}

async function fetchJsonAllowDegraded(pathname, headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers,
  })
  const parsed = await parseJsonResponse(response)

  if (!parsed.response.ok) {
    const statusText = String(parsed.json?.status ?? '').toLowerCase()
    const isDegradedHealth = pathname === '/health' && parsed.response.status === 503 && statusText === 'degraded'
    if (!isDegradedHealth) {
      const error = new Error(
        `${pathname} returned ${parsed.response.status}: ${
          typeof parsed.json === 'string' ? parsed.json : JSON.stringify(parsed.json)
        }`
      )
      error.status = parsed.response.status
      error.payload = parsed.json
      throw error
    }
  }

  return parsed
}

async function resolveBaseUrl() {
  const candidates = Array.from(
    new Set(
      [configuredBaseUrl, process.env.DEFAULT_ECOBE_ENGINE_URL, FALLBACK_ENGINE_URL]
        .map((value) => normalizeBaseUrl(value))
        .filter(Boolean)
    )
  )

  const errors = []

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/health`, {
        headers: { Accept: 'application/json' },
      })
      const parsed = await parseJsonResponse(response)

      // We accept a 503 if the payload indicates the engine is up but degraded.
      // (e.g. Redis disabled in free environments). The follow-on stages will
      // still fail if required APIs are unavailable.
      if (!parsed.response.ok && parsed.response.status !== 503) {
        errors.push(`${candidate}/health returned ${parsed.response.status}`)
        continue
      }

      const status = String(parsed.json?.status ?? '').toLowerCase()
      if (!status || status === 'error' || status === 'unhealthy') {
        errors.push(`${candidate}/health returned invalid status: ${status || 'missing'}`)
        continue
      }

      baseUrl = candidate
      checkpoint.baseUrl = baseUrl
      stage('engineBaseUrl', { baseUrl })
      return
    } catch (error) {
      errors.push(`${candidate}/health probe failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(`Unable to resolve a live engine base URL. Probes: ${errors.join(' | ')}`)
}

async function fetchDashboardProxyJson(pathname) {
  if (!dashboardUrl) {
    throw new Error('Dashboard signer bridge is not configured.')
  }

  const proxiedPath = pathname.replace(/^\/api\/v1\//, '')
  const response = await fetch(`${dashboardUrl}/api/ecobe/${proxiedPath}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  const parsed = await parseJsonResponse(response)
  if (!parsed.response.ok) {
    const error = new Error(
      `dashboard proxy ${pathname} returned ${parsed.response.status}: ${
        typeof parsed.json === 'string' ? parsed.json : JSON.stringify(parsed.json)
      }`
    )
    error.status = parsed.response.status
    error.payload = parsed.json
    throw error
  }

  assert(
    parsed.response.headers.get('x-ecobe-proxy-mode') === 'internal',
    `dashboard proxy ${pathname} missing internal proxy marker`
  )

  return parsed
}

async function waitForWarmCoverage() {
  const attempts = 7
  const delayMs = 5_000
  let lastCache = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const cache = await fetchJson('/api/v1/system/cache', internalHeaders())
    lastCache = cache
    const requiredWarmCoveragePct = Number(cache.json?.cache?.requiredWarmCoveragePct ?? NaN)
    const requiredLkgCoveragePct = Number(cache.json?.cache?.requiredLkgCoveragePct ?? NaN)
    if (
      Number.isFinite(requiredWarmCoveragePct) &&
      Number.isFinite(requiredLkgCoveragePct) &&
      requiredWarmCoveragePct === 0 &&
      requiredLkgCoveragePct === 0
    ) {
      return cache
    }
    if (Number.isFinite(requiredWarmCoveragePct) && requiredWarmCoveragePct >= 95) {
      return cache
    }

    if (attempt < attempts) {
      await sleep(delayMs)
    }
  }

  return lastCache
}

async function waitForDecisionArtifact(pathname, headers = {}, retryStatuses = [404], attempts = 6, delayMs = 2_000) {
  let lastError = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchJson(pathname, headers)
    } catch (error) {
      if (error?.status === 401 && dashboardUrl) {
        return fetchDashboardProxyJson(pathname)
      }
      lastError = error
      if (!retryStatuses.includes(error?.status) || attempt === attempts) {
        throw error
      }
      await sleep(delayMs)
    }
  }

  throw lastError
}

function signBody(body) {
  if (!signatureSecret) return null
  return crypto.createHmac('sha256', signatureSecret).update(body).digest('hex')
}

async function parseJsonResponse(response) {
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }

  return {
    response,
    json,
  }
}

async function tryDirectAuthorize(body) {
  const signature = signBody(body)
  const response = await fetch(`${baseUrl}/api/v1/ci/authorize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signature ? { 'x-ecobe-signature': `v1=${signature}` } : {}),
    },
    body,
  })

  const parsed = await parseJsonResponse(response)
  if (!parsed.response.ok) {
    const error = new Error(
      `authorize returned ${parsed.response.status}: ${
        typeof parsed.json === 'string' ? parsed.json : JSON.stringify(parsed.json)
      }`
    )
    error.status = parsed.response.status
    error.payload = parsed.json
    throw error
  }

  return {
    ...parsed,
    mode: 'direct',
  }
}

async function tryDashboardProxyAuthorize(body) {
  if (!dashboardUrl) {
    throw new Error('Dashboard signer bridge is not configured.')
  }

  const response = await fetch(`${dashboardUrl}/api/ecobe/ci/authorize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  })

  const parsed = await parseJsonResponse(response)
  if (!parsed.response.ok) {
    throw new Error(
      `dashboard proxy authorize returned ${parsed.response.status}: ${
        typeof parsed.json === 'string' ? parsed.json : JSON.stringify(parsed.json)
      }`
    )
  }

  assert(
    parsed.response.headers.get('x-ecobe-proxy-mode') === 'forwarded',
    'dashboard signer bridge missing forwarded proxy marker'
  )

  return {
    ...parsed,
    mode: 'dashboard_proxy',
  }
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
  try {
    return await tryDirectAuthorize(body)
  } catch (error) {
    const status = error?.status
    const payloadCode = error?.payload?.code
    const shouldFallbackToDashboardProxy =
      status === 401 && payloadCode === 'INVALID_REQUEST_SIGNATURE' && Boolean(dashboardUrl)

    if (!shouldFallbackToDashboardProxy) {
      throw error
    }

    return tryDashboardProxyAuthorize(body)
  }
}

function findMetric(snapshot, name) {
  const metrics = snapshot?.metrics?.metrics
  if (!Array.isArray(metrics)) return null
  return metrics.find((metric) => metric?.name === name) ?? null
}

function writeResult(result) {
  if (!outputPath) return
  const resolved = path.resolve(repoRoot, outputPath)
  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  fs.writeFileSync(resolved, JSON.stringify(result, null, 2))
}

async function main() {
  await resolveBaseUrl()
  const health = await fetchJsonAllowDegraded('/health')
  assert(['healthy', 'ok', 'degraded'].includes(String(health.json?.status)), '/health missing valid status')
  stage('health', { status: health.json?.status ?? null })

  const ciHealth = await fetchJson('/api/v1/ci/health')
  assert(typeof ciHealth.json === 'object' && ciHealth.json !== null, '/api/v1/ci/health missing object payload')
  stage('ciHealth', { status: ciHealth.json?.status ?? 'ok' })

  const slo = await fetchJson('/api/v1/ci/slo')
  const p95Total = Number(slo.json?.currentMs?.total?.p95 ?? NaN)
  const p95Compute = Number(slo.json?.currentMs?.compute?.p95 ?? NaN)
  assert(Number.isFinite(p95Total), '/api/v1/ci/slo missing p95 total')
  assert(Number.isFinite(p95Compute), '/api/v1/ci/slo missing p95 compute')
  assert(p95Total <= 100, `engine p95 total above gate: ${p95Total}`)
  assert(p95Compute <= 50, `engine p95 compute above gate: ${p95Compute}`)
  stage('slo', { p95Total, p95Compute, counts: slo.json?.counts ?? null })

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
  stage('provenance', { verified: provenanceVerified, mismatch: provenanceMismatch })

  const cache = await waitForWarmCoverage()
  const requiredWarmCoveragePct = Number(cache.json?.cache?.requiredWarmCoveragePct ?? NaN)
  const requiredLkgCoveragePct = Number(cache.json?.cache?.requiredLkgCoveragePct ?? NaN)
  assert(Number.isFinite(requiredWarmCoveragePct), 'system/cache missing requiredWarmCoveragePct')
  if (
    Number.isFinite(requiredLkgCoveragePct) &&
    requiredWarmCoveragePct === 0 &&
    requiredLkgCoveragePct === 0
  ) {
    stage('cache', {
      requiredWarmCoveragePct,
      requiredLkgCoveragePct,
      requiredRegions: cache.json?.cache?.requiredRegions ?? [],
      healthy: cache.json?.cache?.healthy ?? null,
      note: 'cache coverage gate skipped (redis unavailable)',
    })
  } else {
    assert(requiredWarmCoveragePct >= 95, `required warm coverage below gate: ${requiredWarmCoveragePct}`)
    stage('cache', {
      requiredWarmCoveragePct,
      requiredLkgCoveragePct: cache.json?.cache?.requiredLkgCoveragePct ?? null,
      healthy: cache.json?.cache?.healthy ?? null,
    })
  }

  const authorize = await authorizeDecision()
  const decisionFrameId = authorize.json?.decisionFrameId
  assert(typeof decisionFrameId === 'string' && decisionFrameId.length > 0, 'authorize response missing decisionFrameId')
  assert(Boolean(authorize.response.headers.get('Replay-Trace-ID')), 'authorize response missing Replay-Trace-ID header')
  assert(Boolean(authorize.response.headers.get('X-CO2Router-Trace-Hash')), 'authorize response missing X-CO2Router-Trace-Hash header')
  stage('authorize', {
    mode: authorize.mode,
    decisionFrameId,
    replayTraceId: authorize.response.headers.get('Replay-Trace-ID'),
    traceHash: authorize.response.headers.get('X-CO2Router-Trace-Hash'),
    governanceSource:
      authorize.json?.policyTrace?.sekedPolicy?.source ??
      authorize.json?.policyTrace?.governance?.source ??
      authorize.json?.governance?.source ??
      null,
  })

  const trace = await waitForDecisionArtifact(
    `/api/v1/ci/decisions/${decisionFrameId}/trace`,
    internalHeaders(),
    [404]
  )
  assert(trace.json?.decisionFrameId === decisionFrameId, 'trace response missing matching decisionFrameId')
  stage('trace', { decisionFrameId })

  const replay = await waitForDecisionArtifact(
    `/api/v1/ci/decisions/${decisionFrameId}/replay`,
    internalHeaders(),
    [404, 422]
  )
  assert(replay.json?.decisionFrameId === decisionFrameId, 'replay response missing matching decisionFrameId')
  assert(replay.json?.deterministicMatch === true, 'replay response is not deterministic')
  stage('replay', {
    decisionFrameId,
    deterministicMatch: replay.json?.deterministicMatch === true,
    mismatches: replay.json?.mismatches ?? [],
  })

  const telemetry = await fetchJson('/api/v1/ci/telemetry')
  const leakMetric = findMetric(telemetry.json, 'ecobe.routing.hot_path.provider_leak.count')
  const leakSum = Number(leakMetric?.sum ?? 0)
  const replayMismatchCount = Number(findMetric(telemetry.json, 'ecobe.replay.mismatch.count')?.sum ?? 0)
  assert(leakSum === 0, `hot-path provider leak count must be zero, got ${leakSum}`)
  stage('telemetry', {
    hotPathProviderLeakCount: leakSum,
    replayMismatchCount,
  })

  const result = {
    ...checkpoint,
    ok: true,
    checkedAt: new Date().toISOString(),
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
    authorize: checkpoint.stages.authorize,
    replay: checkpoint.stages.replay,
    telemetry: checkpoint.stages.telemetry,
  }

  writeResult(result)
  console.log(JSON.stringify(result, null, 2))
}

try {
  await main()
} catch (error) {
  const failure = {
    ...checkpoint,
    ok: false,
    failedAt: new Date().toISOString(),
    error: {
      message: error instanceof Error ? error.message : String(error),
      status: error?.status ?? null,
      payload: error?.payload ?? null,
    },
  }
  writeResult(failure)
  console.error(JSON.stringify(failure, null, 2))
  process.exit(1)
}
