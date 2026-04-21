/**
 * Tests for the control-surface engine module.
 *
 * Key change in this PR: getEngineBaseUrl() was renamed to resolveEngineBaseUrl()
 * and now THROWS an error if none of the required env vars are set, instead of
 * returning a hardcoded default Railway URL.
 */

import crypto from 'crypto'

// Mock global fetch before importing the module
const mockFetch = jest.fn()
global.fetch = mockFetch as any

// Save and restore env vars around each test
const originalEnv = { ...process.env }

function restoreEnvVar(key: string, originalValue: string | undefined) {
  if (originalValue !== undefined) {
    process.env[key] = originalValue
  } else {
    delete process.env[key]
  }
}

afterEach(() => {
  restoreEnvVar('ECOBE_API_URL', originalEnv.ECOBE_API_URL)
  restoreEnvVar('CO2ROUTER_API_URL', originalEnv.CO2ROUTER_API_URL)
  restoreEnvVar('NEXT_PUBLIC_ECOBE_API_URL', originalEnv.NEXT_PUBLIC_ECOBE_API_URL)
  restoreEnvVar('ECOBE_INTERNAL_API_KEY', originalEnv.ECOBE_INTERNAL_API_KEY)
  restoreEnvVar('CO2ROUTER_INTERNAL_API_KEY', originalEnv.CO2ROUTER_INTERNAL_API_KEY)
  restoreEnvVar('DECISION_API_SIGNATURE_SECRET', originalEnv.DECISION_API_SIGNATURE_SECRET)
  restoreEnvVar(
    'CO2ROUTER_DECISION_API_SIGNATURE_SECRET',
    originalEnv.CO2ROUTER_DECISION_API_SIGNATURE_SECRET
  )
  mockFetch.mockReset()
  jest.resetModules()
})

function makeOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  }
}

function makeErrorResponse(status: number, text: string) {
  return {
    ok: false,
    status,
    json: jest.fn().mockResolvedValue({ error: text }),
    text: jest.fn().mockResolvedValue(text),
  }
}

describe('engine module — resolveEngineBaseUrl (via fetchEngineJson)', () => {
  describe('throws when no env vars are set', () => {
    it('throws Error when ECOBE_API_URL, CO2ROUTER_API_URL, and NEXT_PUBLIC_ECOBE_API_URL are all unset', async () => {
      delete process.env.ECOBE_API_URL
      delete process.env.CO2ROUTER_API_URL
      delete process.env.NEXT_PUBLIC_ECOBE_API_URL

      const { fetchEngineJson } = await import('../engine')

      await expect(fetchEngineJson('/health')).rejects.toThrow(
        'ECOBE_API_URL, CO2ROUTER_API_URL, or NEXT_PUBLIC_ECOBE_API_URL must be set'
      )
    })

    it('throws when all env vars are empty strings', async () => {
      process.env.ECOBE_API_URL = ''
      process.env.CO2ROUTER_API_URL = ''
      process.env.NEXT_PUBLIC_ECOBE_API_URL = ''

      const { fetchEngineJson } = await import('../engine')

      await expect(fetchEngineJson('/health')).rejects.toThrow(
        'ECOBE_API_URL, CO2ROUTER_API_URL, or NEXT_PUBLIC_ECOBE_API_URL must be set'
      )
    })
  })

  describe('URL resolution priority', () => {
    it('uses ECOBE_API_URL when set', async () => {
      process.env.ECOBE_API_URL = 'https://engine.example.com'
      process.env.CO2ROUTER_API_URL = 'https://fallback.example.com'
      mockFetch.mockResolvedValue(makeOkResponse({ ok: true }))

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/health')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://engine.example.com/api/v1/health',
        expect.any(Object)
      )
    })

    it('falls back to CO2ROUTER_API_URL when ECOBE_API_URL is unset', async () => {
      delete process.env.ECOBE_API_URL
      process.env.CO2ROUTER_API_URL = 'https://co2router.example.com'
      delete process.env.NEXT_PUBLIC_ECOBE_API_URL
      mockFetch.mockResolvedValue(makeOkResponse({ ok: true }))

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/health')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://co2router.example.com/api/v1/health',
        expect.any(Object)
      )
    })

    it('falls back to NEXT_PUBLIC_ECOBE_API_URL when neither ECOBE_API_URL nor CO2ROUTER_API_URL are set', async () => {
      delete process.env.ECOBE_API_URL
      delete process.env.CO2ROUTER_API_URL
      process.env.NEXT_PUBLIC_ECOBE_API_URL = 'https://public.example.com'
      mockFetch.mockResolvedValue(makeOkResponse({ ok: true }))

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/health')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://public.example.com/api/v1/health',
        expect.any(Object)
      )
    })

    it('does NOT fall back to any hardcoded Railway default URL', async () => {
      delete process.env.ECOBE_API_URL
      delete process.env.CO2ROUTER_API_URL
      delete process.env.NEXT_PUBLIC_ECOBE_API_URL

      const { fetchEngineJson } = await import('../engine')

      // Must throw, not call fetch with a Railway URL
      await expect(fetchEngineJson('/health')).rejects.toThrow()
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('URL normalization', () => {
    it('strips trailing slash from base URL', async () => {
      process.env.ECOBE_API_URL = 'https://engine.example.com/'
      mockFetch.mockResolvedValue(makeOkResponse({ ok: true }))

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/health')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://engine.example.com/api/v1/health',
        expect.any(Object)
      )
    })

    it('strips /api/v1 suffix from base URL before appending path', async () => {
      process.env.ECOBE_API_URL = 'https://engine.example.com/api/v1'
      mockFetch.mockResolvedValue(makeOkResponse({ ok: true }))

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/health')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://engine.example.com/api/v1/health',
        expect.any(Object)
      )
    })

    it('strips /api/v1/ suffix (with trailing slash) from base URL', async () => {
      process.env.ECOBE_API_URL = 'https://engine.example.com/api/v1/'
      mockFetch.mockResolvedValue(makeOkResponse({ ok: true }))

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/health')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://engine.example.com/api/v1/health',
        expect.any(Object)
      )
    })
  })

  describe('fetchEngineJson core behavior', () => {
    beforeEach(() => {
      process.env.ECOBE_API_URL = 'https://engine.example.com'
    })

    it('returns parsed JSON on success', async () => {
      const body = { decision: 'proceed', region: 'eu-west-1' }
      mockFetch.mockResolvedValue(makeOkResponse(body))

      const { fetchEngineJson } = await import('../engine')
      const result = await fetchEngineJson<typeof body>('/ci/route')

      expect(result).toEqual(body)
    })

    it('throws on non-OK HTTP response', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(403, 'Forbidden'))

      const { fetchEngineJson } = await import('../engine')

      await expect(fetchEngineJson('/ci/route')).rejects.toThrow(
        'Engine request failed for /ci/route: 403 Forbidden'
      )
    })

    it('sets content-type: application/json header', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({}))

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/health')

      const callArgs = mockFetch.mock.calls[0]
      const headers: Headers = callArgs[1].headers
      expect(headers.get('content-type')).toBe('application/json')
    })

    it('sets cache: no-store', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({}))

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/health')

      const callArgs = mockFetch.mock.calls[0]
      expect(callArgs[1].cache).toBe('no-store')
    })
  })

  describe('internal API key', () => {
    beforeEach(() => {
      process.env.ECOBE_API_URL = 'https://engine.example.com'
    })

    it('sets Authorization: Bearer header when internal=true and ECOBE_INTERNAL_API_KEY is set', async () => {
      process.env.ECOBE_INTERNAL_API_KEY = 'secret-internal-key'
      mockFetch.mockResolvedValue(makeOkResponse({}))

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/health', {}, { internal: true })

      const callArgs = mockFetch.mock.calls[0]
      const headers: Headers = callArgs[1].headers
      expect(headers.get('authorization')).toBe('Bearer secret-internal-key')
    })

    it('does not set Authorization header when internal=false', async () => {
      process.env.ECOBE_INTERNAL_API_KEY = 'secret-internal-key'
      mockFetch.mockResolvedValue(makeOkResponse({}))

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/health', {}, { internal: false })

      const callArgs = mockFetch.mock.calls[0]
      const headers: Headers = callArgs[1].headers
      expect(headers.get('authorization')).toBeNull()
    })

    it('does not set Authorization header when ECOBE_INTERNAL_API_KEY is unset', async () => {
      delete process.env.ECOBE_INTERNAL_API_KEY
      delete process.env.CO2ROUTER_INTERNAL_API_KEY
      mockFetch.mockResolvedValue(makeOkResponse({}))

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/health', {}, { internal: true })

      const callArgs = mockFetch.mock.calls[0]
      const headers: Headers = callArgs[1].headers
      expect(headers.get('authorization')).toBeNull()
    })

    it('falls back to CO2ROUTER_INTERNAL_API_KEY when ECOBE_INTERNAL_API_KEY is unset', async () => {
      delete process.env.ECOBE_INTERNAL_API_KEY
      process.env.CO2ROUTER_INTERNAL_API_KEY = 'fallback-key'
      mockFetch.mockResolvedValue(makeOkResponse({}))

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/health', {}, { internal: true })

      const callArgs = mockFetch.mock.calls[0]
      const headers: Headers = callArgs[1].headers
      expect(headers.get('authorization')).toBe('Bearer fallback-key')
    })
  })

  describe('hasInternalApiKey', () => {
    it('returns true when ECOBE_INTERNAL_API_KEY is set', async () => {
      process.env.ECOBE_INTERNAL_API_KEY = 'some-key'

      const { hasInternalApiKey } = await import('../engine')
      expect(hasInternalApiKey()).toBe(true)
    })

    it('returns false when neither internal API key env var is set', async () => {
      delete process.env.ECOBE_INTERNAL_API_KEY
      delete process.env.CO2ROUTER_INTERNAL_API_KEY

      const { hasInternalApiKey } = await import('../engine')
      expect(hasInternalApiKey()).toBe(false)
    })

    it('returns true when CO2ROUTER_INTERNAL_API_KEY is set but ECOBE_INTERNAL_API_KEY is not', async () => {
      delete process.env.ECOBE_INTERNAL_API_KEY
      process.env.CO2ROUTER_INTERNAL_API_KEY = 'router-key'

      const { hasInternalApiKey } = await import('../engine')
      expect(hasInternalApiKey()).toBe(true)
    })
  })

  describe('decision signature paths', () => {
    beforeEach(() => {
      process.env.ECOBE_API_URL = 'https://engine.example.com'
    })

    it('adds x-ecobe-signature header for /ci/route when DECISION_API_SIGNATURE_SECRET is set', async () => {
      process.env.DECISION_API_SIGNATURE_SECRET = 'signing-secret-key'
      mockFetch.mockResolvedValue(makeOkResponse({}))

      const body = JSON.stringify({ preferredRegions: ['us-east-1'] })
      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/ci/route', { method: 'POST', body })

      const callArgs = mockFetch.mock.calls[0]
      const headers: Headers = callArgs[1].headers
      const sig = headers.get('x-ecobe-signature')
      expect(sig).toBeTruthy()
      expect(sig).toMatch(/^v1=/)

      // Verify the signature is a valid HMAC-SHA256
      const expectedHmac = crypto
        .createHmac('sha256', 'signing-secret-key')
        .update(body)
        .digest('hex')
      expect(sig).toBe(`v1=${expectedHmac}`)
    })

    it('does not add signature for /ci/route when DECISION_API_SIGNATURE_SECRET is unset', async () => {
      delete process.env.DECISION_API_SIGNATURE_SECRET
      delete process.env.CO2ROUTER_DECISION_API_SIGNATURE_SECRET
      mockFetch.mockResolvedValue(makeOkResponse({}))

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/ci/route', { method: 'POST', body: '{}' })

      const callArgs = mockFetch.mock.calls[0]
      const headers: Headers = callArgs[1].headers
      expect(headers.get('x-ecobe-signature')).toBeNull()
    })

    it('does not override existing x-ecobe-signature header', async () => {
      process.env.DECISION_API_SIGNATURE_SECRET = 'signing-secret-key'
      mockFetch.mockResolvedValue(makeOkResponse({}))

      const existingHeaders = new Headers()
      existingHeaders.set('x-ecobe-signature', 'v1=existing-signature')

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/ci/route', {
        method: 'POST',
        body: '{}',
        headers: existingHeaders,
      })

      const callArgs = mockFetch.mock.calls[0]
      const headers: Headers = callArgs[1].headers
      expect(headers.get('x-ecobe-signature')).toBe('v1=existing-signature')
    })

    it('does not add signature for /health (non-decision path)', async () => {
      process.env.DECISION_API_SIGNATURE_SECRET = 'signing-secret-key'
      mockFetch.mockResolvedValue(makeOkResponse({}))

      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/health', { method: 'POST', body: '{}' })

      const callArgs = mockFetch.mock.calls[0]
      const headers: Headers = callArgs[1].headers
      expect(headers.get('x-ecobe-signature')).toBeNull()
    })

    it('adds signature for /ci/authorize path', async () => {
      process.env.DECISION_API_SIGNATURE_SECRET = 'signing-secret-key'
      mockFetch.mockResolvedValue(makeOkResponse({}))

      const body = JSON.stringify({ test: true })
      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/ci/authorize', { method: 'POST', body })

      const callArgs = mockFetch.mock.calls[0]
      const headers: Headers = callArgs[1].headers
      expect(headers.get('x-ecobe-signature')).toMatch(/^v1=/)
    })

    it('adds signature for /ci/carbon-route path', async () => {
      process.env.DECISION_API_SIGNATURE_SECRET = 'signing-secret-key'
      mockFetch.mockResolvedValue(makeOkResponse({}))

      const body = JSON.stringify({ test: true })
      const { fetchEngineJson } = await import('../engine')
      await fetchEngineJson('/ci/carbon-route', { method: 'POST', body })

      const callArgs = mockFetch.mock.calls[0]
      const headers: Headers = callArgs[1].headers
      expect(headers.get('x-ecobe-signature')).toMatch(/^v1=/)
    })
  })
})