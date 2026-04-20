import crypto from 'crypto'

const DECISION_SIGNATURE_PATHS = new Set(['/ci/route', '/ci/authorize', '/ci/carbon-route'])

function resolveEngineBaseUrl() {
  const value =
    process.env.ECOBE_API_URL ||
    process.env.CO2ROUTER_API_URL ||
    process.env.NEXT_PUBLIC_ECOBE_API_URL

  if (!value) {
    throw new Error(
      'ECOBE_API_URL, CO2ROUTER_API_URL, or NEXT_PUBLIC_ECOBE_API_URL must be set'
    )
  }

  return value.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')
}

function getInternalApiKey() {
  return process.env.ECOBE_INTERNAL_API_KEY || process.env.CO2ROUTER_INTERNAL_API_KEY || null
}

function getDecisionApiSignatureSecret() {
  return (
    process.env.DECISION_API_SIGNATURE_SECRET ||
    process.env.CO2ROUTER_DECISION_API_SIGNATURE_SECRET ||
    null
  )
}

function signDecisionBody(body: string) {
  const secret = getDecisionApiSignatureSecret()
  if (!secret) return null
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

export async function fetchEngineJson<T>(
  path: string,
  init: RequestInit = {},
  options: { internal?: boolean } = {}
) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  const requestBody = typeof init.body === 'string' ? init.body : null
  const shouldSignDecisionBody =
    requestBody !== null &&
    DECISION_SIGNATURE_PATHS.has(path) &&
    !headers.has('x-ecobe-signature')

  if (shouldSignDecisionBody) {
    const signature = signDecisionBody(requestBody)
    if (signature) {
      headers.set('x-ecobe-signature', `v1=${signature}`)
    }
  }

  if (options.internal) {
    const token = getInternalApiKey()
    if (token) {
      headers.set('authorization', `Bearer ${token}`)
    }
  }

  const response = await fetch(`${resolveEngineBaseUrl()}/api/v1${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Engine request failed for ${path}: ${response.status} ${text}`)
  }

  return (await response.json()) as T
}

export function hasInternalApiKey() {
  return Boolean(getInternalApiKey())
}
