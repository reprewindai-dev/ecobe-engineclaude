const DEFAULT_ENGINE_URL = 'https://ecobe-engineclaude-production.up.railway.app'

export function getEngineBaseUrl() {
  return (
    process.env.ECOBE_API_URL ||
    process.env.CO2ROUTER_API_URL ||
    process.env.NEXT_PUBLIC_ECOBE_API_URL ||
    DEFAULT_ENGINE_URL
  )
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/$/, '')
}

function getInternalApiKey() {
  return process.env.ECOBE_INTERNAL_API_KEY || process.env.CO2ROUTER_INTERNAL_API_KEY || null
}

export async function fetchEngineJson<T>(
  path: string,
  init: RequestInit = {},
  options: { internal?: boolean } = {}
) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')

  if (options.internal) {
    const token = getInternalApiKey()
    if (token) {
      headers.set('authorization', `Bearer ${token}`)
    }
  }

  const response = await fetch(`${getEngineBaseUrl()}/api/v1${path}`, {
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
