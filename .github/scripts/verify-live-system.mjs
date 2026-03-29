const baseUrl = (process.env.ECOBE_ENGINE_URL || process.env.DEFAULT_ECOBE_ENGINE_URL || '').trim().replace(/\/$/, '')

if (!baseUrl) {
  console.error('Missing ECOBE_ENGINE_URL or DEFAULT_ECOBE_ENGINE_URL.')
  process.exit(1)
}

const internalKey = process.env.ECOBE_ENGINE_API_KEY?.trim()

function buildHeaders() {
  const headers = {
    Accept: 'application/json',
  }

  if (internalKey) {
    headers.Authorization = `Bearer ${internalKey}`
    headers['x-ecobe-internal-key'] = internalKey
    headers['x-api-key'] = internalKey
  }

  return headers
}

async function fetchJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: buildHeaders(),
  })

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`)
  }

  return response.json()
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const health = await fetchJson('/health')
assert(typeof health === 'object' && health !== null, '/health did not return an object')
assert(['healthy', 'ok', 'degraded'].includes(String(health.status)), '/health missing valid status')

const provenance = await fetchJson('/api/v1/water/provenance')
assert(typeof provenance === 'object' && provenance !== null, '/api/v1/water/provenance did not return an object')
assert(
  typeof provenance.verified === 'number' || typeof provenance.missingSource === 'number' || Array.isArray(provenance.datasets),
  '/api/v1/water/provenance missing verification fields'
)

const slo = await fetchJson('/api/v1/ci/slo')
assert(typeof slo === 'object' && slo !== null, '/api/v1/ci/slo did not return an object')
assert(
  typeof slo.counts?.totalSamples === 'number' ||
    typeof slo.samples === 'number' ||
    typeof slo.currentMs?.total?.p95 === 'number',
  '/api/v1/ci/slo missing latency shape'
)

const decisions = await fetchJson('/api/v1/ci/decisions?limit=1')
assert(Array.isArray(decisions), '/api/v1/ci/decisions did not return an array')

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      checks: {
        health: health.status,
        provenanceVerified:
          typeof provenance.verified === 'number' ? provenance.verified : provenance.verifiedCount ?? null,
        decisionCount: decisions.length,
      },
    },
    null,
    2
  )
)
