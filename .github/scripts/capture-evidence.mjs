import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const engineUrl = (process.env.ECOBE_ENGINE_URL || process.env.DEFAULT_ECOBE_ENGINE_URL || '').trim().replace(/\/$/, '')
const dashboardUrl = (process.env.DASHBOARD_URL || process.env.DEFAULT_DASHBOARD_URL || '').trim().replace(/\/$/, '')
const internalKey = (process.env.ECOBE_INTERNAL_API_KEY || process.env.ECOBE_ENGINE_API_KEY || '').trim()
const signatureSecret = process.env.DECISION_API_SIGNATURE_SECRET?.trim() || ''
const publicDir = path.resolve(process.cwd(), process.env.EVIDENCE_PUBLIC_DIR || 'docs/public/evidence')
const privateDir = path.resolve(process.cwd(), process.env.EVIDENCE_PRIVATE_DIR || 'docs/private/evidence')

if (!engineUrl || !dashboardUrl) {
  console.error('Missing engine or dashboard URL for evidence capture.')
  process.exit(1)
}

function mkdir(target) {
  fs.mkdirSync(target, { recursive: true })
}

function writeJson(target, value) {
  mkdir(path.dirname(target))
  fs.writeFileSync(target, JSON.stringify(value, null, 2))
}

function internalHeaders() {
  if (!internalKey) return {}
  return {
    Authorization: `Bearer ${internalKey}`,
    'x-ecobe-internal-key': internalKey,
    'x-api-key': internalKey,
  }
}

function signBody(body) {
  if (!signatureSecret) return null
  return crypto.createHmac('sha256', signatureSecret).update(body).digest('hex')
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`)
  }
  return { response, json }
}

async function fetchDashboardProxyJson(pathname) {
  const proxiedPath = pathname.replace(/^\/api\/v1\//, '')
  return fetchJson(`${dashboardUrl}/api/ecobe/${proxiedPath}`)
}

async function tryDirectAuthorize(body) {
  return fetchJson(`${engineUrl}/api/v1/ci/authorize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signature ? { 'x-ecobe-signature': `v1=${signature}` } : {}),
    },
    body,
  })
}

async function tryDashboardProxyAuthorize(body) {
  return fetchJson(`${dashboardUrl}/api/ecobe/ci/authorize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  })
}

async function authorizeWithFallback(body) {
  try {
    return await tryDirectAuthorize(body)
  } catch (error) {
    if (dashboardUrl) {
      return tryDashboardProxyAuthorize(body)
    }
    throw error
  }
}

async function fetchDecisionArtifact(pathname) {
  try {
    return await fetchJson(`${engineUrl}${pathname}`, {
      headers: internalHeaders(),
    })
  } catch (error) {
    if (dashboardUrl) {
      return fetchDashboardProxyJson(pathname)
    }
    throw error
  }
}

const authorizePayload = {
  requestId: `evidence-${Date.now()}`,
  idempotencyKey: `evidence-${Date.now()}-idempotent`,
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

const authorizeBody = JSON.stringify(authorizePayload)
const signature = signBody(authorizeBody)

const [slo, commandCenter, provenance] = await Promise.all([
  fetchJson(`${engineUrl}/api/v1/ci/slo`),
  fetchJson(`${dashboardUrl}/api/control-surface/command-center`),
  fetchJson(`${engineUrl}/api/v1/water/provenance`),
])

const authorize = await authorizeWithFallback(authorizeBody)

const decisionFrameId = authorize.json?.decisionFrameId
if (!decisionFrameId) {
  throw new Error('authorize response missing decisionFrameId')
}

const [trace, replay] = await Promise.all([
  fetchDecisionArtifact(`/api/v1/ci/decisions/${decisionFrameId}/trace`),
  fetchDecisionArtifact(`/api/v1/ci/decisions/${decisionFrameId}/replay`),
])

mkdir(publicDir)
mkdir(privateDir)

writeJson(path.join(publicDir, 'summary.json'), {
  generatedAt: new Date().toISOString(),
  engineSlo: slo.json,
  commandCenter: {
    generatedAt: commandCenter.json?.generatedAt ?? null,
  },
  provenance: {
    verified: provenance.json?.verified ?? null,
  },
  proof: {
    decisionFrameId,
    replayTraceId: authorize.response.headers.get('Replay-Trace-ID'),
    traceHash: authorize.response.headers.get('X-CO2Router-Trace-Hash'),
    deterministicMatch: replay.json?.deterministicMatch ?? null,
  },
})

writeJson(path.join(privateDir, 'authorize.json'), authorize.json)
writeJson(path.join(privateDir, 'trace.json'), trace.json)
writeJson(path.join(privateDir, 'replay.json'), replay.json)
writeJson(path.join(privateDir, 'slo.json'), slo.json)
writeJson(path.join(privateDir, 'command-center.json'), commandCenter.json)
writeJson(path.join(privateDir, 'provenance.json'), provenance.json)

console.log(
  JSON.stringify(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      decisionFrameId,
      publicDir,
      privateDir,
    },
    null,
    2
  )
)
