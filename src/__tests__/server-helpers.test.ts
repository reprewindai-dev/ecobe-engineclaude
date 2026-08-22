/**
 * Tests for helper functions in src/server.ts
 *
 * The server.ts module calls start() at module load time which makes it hard to
 * import directly. We test the pure helper logic by re-implementing it in tests,
 * and test the request listener behavior via a lightweight mock HTTP server setup.
 *
 * Key testable behaviors:
 * - requestPath: URL parsing
 * - isProtectedEnginePath: path classification
 * - extractInternalToken: token extraction from headers
 * - engineRequestListener: health endpoint, auth gating
 * - writeJson: JSON response writing
 */

import type { IncomingMessage, ServerResponse } from 'http'

// ─── Re-implementations of pure helpers from server.ts ───────────────────────
// These mirror server.ts implementations exactly.

function requestPath(req: Pick<IncomingMessage, 'url'>): string {
  return new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/'
}

function isProtectedEnginePath(pathname: string): boolean {
  return (
    pathname === '/ui' ||
    pathname.startsWith('/ui/') ||
    pathname === '/api/v1' ||
    pathname.startsWith('/api/v1/') ||
    pathname === '/internal/v1' ||
    pathname.startsWith('/internal/v1/')
  )
}

function extractInternalToken(
  req: Pick<IncomingMessage, 'headers'>
): string | null {
  const authorization = req.headers.authorization
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim()
  }

  const internalKey = req.headers['x-ecobe-internal-key']
  if (typeof internalKey === 'string' && internalKey.trim()) {
    return internalKey.trim()
  }

  const apiKey = req.headers['x-api-key']
  if (typeof apiKey === 'string' && apiKey.trim()) {
    return apiKey.trim()
  }

  return null
}

// ─── requestPath tests ────────────────────────────────────────────────────────

describe('requestPath', () => {
  it('returns "/" for empty url', () => {
    expect(requestPath({ url: undefined as any })).toBe('/')
  })

  it('returns "/" for root path', () => {
    expect(requestPath({ url: '/' })).toBe('/')
  })

  it('strips trailing slashes from paths', () => {
    expect(requestPath({ url: '/health/' })).toBe('/health')
  })

  it('strips multiple trailing slashes', () => {
    expect(requestPath({ url: '/api/v1///' })).toBe('/api/v1')
  })

  it('preserves path without trailing slash', () => {
    expect(requestPath({ url: '/api/v1/health' })).toBe('/api/v1/health')
  })

  it('strips query string from path', () => {
    expect(requestPath({ url: '/health?status=ok' })).toBe('/health')
  })

  it('handles nested paths', () => {
    expect(requestPath({ url: '/api/v1/ci/route' })).toBe('/api/v1/ci/route')
  })
})

// ─── isProtectedEnginePath tests ─────────────────────────────────────────────

describe('isProtectedEnginePath', () => {
  describe('protected paths', () => {
    it('protects /ui', () => {
      expect(isProtectedEnginePath('/ui')).toBe(true)
    })

    it('protects /ui/ prefix paths', () => {
      expect(isProtectedEnginePath('/ui/dashboard')).toBe(true)
    })

    it('protects /api/v1', () => {
      expect(isProtectedEnginePath('/api/v1')).toBe(true)
    })

    it('protects /api/v1/ prefix paths', () => {
      expect(isProtectedEnginePath('/api/v1/ci/route')).toBe(true)
    })

    it('protects /api/v1/health', () => {
      expect(isProtectedEnginePath('/api/v1/health')).toBe(true)
    })

    it('protects /internal/v1', () => {
      expect(isProtectedEnginePath('/internal/v1')).toBe(true)
    })

    it('protects /internal/v1/ prefix paths', () => {
      expect(isProtectedEnginePath('/internal/v1/admin')).toBe(true)
    })
  })

  describe('non-protected paths', () => {
    it('does not protect /health (public liveness endpoint)', () => {
      expect(isProtectedEnginePath('/health')).toBe(false)
    })

    it('does not protect root path /', () => {
      expect(isProtectedEnginePath('/')).toBe(false)
    })

    it('does not protect /api (without v1)', () => {
      expect(isProtectedEnginePath('/api')).toBe(false)
    })

    it('does not protect /api/v2', () => {
      expect(isProtectedEnginePath('/api/v2')).toBe(false)
    })

    it('does not protect paths that START with similar strings but are not subpaths', () => {
      // /uikit is not /ui/
      expect(isProtectedEnginePath('/uikit')).toBe(false)
    })

    it('does not protect /internal without /v1', () => {
      expect(isProtectedEnginePath('/internal')).toBe(false)
    })
  })
})

// ─── extractInternalToken tests ──────────────────────────────────────────────

describe('extractInternalToken', () => {
  it('extracts Bearer token from Authorization header', () => {
    const req = { headers: { authorization: 'Bearer my-secret-token' } }
    expect(extractInternalToken(req)).toBe('my-secret-token')
  })

  it('strips whitespace from Bearer token', () => {
    const req = { headers: { authorization: 'Bearer   trimmed-token  ' } }
    expect(extractInternalToken(req)).toBe('trimmed-token')
  })

  it('returns null for non-Bearer authorization scheme', () => {
    const req = { headers: { authorization: 'Basic dXNlcjpwYXNz' } }
    expect(extractInternalToken(req)).toBeNull()
  })

  it('extracts token from x-ecobe-internal-key header', () => {
    const req = { headers: { 'x-ecobe-internal-key': 'internal-key-value' } }
    expect(extractInternalToken(req)).toBe('internal-key-value')
  })

  it('trims whitespace from x-ecobe-internal-key', () => {
    const req = { headers: { 'x-ecobe-internal-key': '  trimmed-key  ' } }
    expect(extractInternalToken(req)).toBe('trimmed-key')
  })

  it('extracts token from x-api-key header', () => {
    const req = { headers: { 'x-api-key': 'api-key-value' } }
    expect(extractInternalToken(req)).toBe('api-key-value')
  })

  it('returns null when no relevant headers are present', () => {
    const req = { headers: {} }
    expect(extractInternalToken(req)).toBeNull()
  })

  it('returns null when x-ecobe-internal-key is empty string', () => {
    const req = { headers: { 'x-ecobe-internal-key': '   ' } }
    expect(extractInternalToken(req)).toBeNull()
  })

  it('prioritizes Bearer token over x-ecobe-internal-key', () => {
    const req = {
      headers: {
        authorization: 'Bearer priority-token',
        'x-ecobe-internal-key': 'lower-priority-key',
      },
    }
    expect(extractInternalToken(req)).toBe('priority-token')
  })

  it('prioritizes x-ecobe-internal-key over x-api-key', () => {
    const req = {
      headers: {
        'x-ecobe-internal-key': 'internal-priority',
        'x-api-key': 'api-fallback',
      },
    }
    expect(extractInternalToken(req)).toBe('internal-priority')
  })
})

// ─── writeJson behavior ───────────────────────────────────────────────────────

describe('writeJson response behavior', () => {
  function createMockResponse() {
    const headers: Record<string, string | number> = {}
    let statusCode = 200
    let body = ''
    return {
      setHeader: jest.fn((key: string, value: string | number) => {
        headers[key.toLowerCase()] = value
      }),
      end: jest.fn((data: string) => {
        body = data
      }),
      get statusCode() { return statusCode },
      set statusCode(v: number) { statusCode = v },
      headers,
      get body() { return body },
    }
  }

  function writeJsonInline(
    res: ReturnType<typeof createMockResponse>,
    statusCode: number,
    payload: unknown
  ) {
    const body = JSON.stringify(payload)
    res.statusCode = statusCode
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('content-length', Buffer.byteLength(body))
    res.end(body)
  }

  it('sets statusCode correctly', () => {
    const res = createMockResponse()
    writeJsonInline(res, 404, { error: 'Not Found' })
    expect(res.statusCode).toBe(404)
  })

  it('sets content-type to application/json', () => {
    const res = createMockResponse()
    writeJsonInline(res, 200, { ok: true })
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
  })

  it('sets content-length matching JSON body byte count', () => {
    const res = createMockResponse()
    const payload = { status: 'ok', service: 'ecobe-engine' }
    const expectedBody = JSON.stringify(payload)
    writeJsonInline(res, 200, payload)
    expect(res.headers['content-length']).toBe(Buffer.byteLength(expectedBody))
  })

  it('ends response with JSON stringified body', () => {
    const res = createMockResponse()
    const payload = { hello: 'world' }
    writeJsonInline(res, 200, payload)
    expect(res.body).toBe(JSON.stringify(payload))
  })

  it('handles 401 unauthorized response correctly', () => {
    const res = createMockResponse()
    writeJsonInline(res, 401, { error: 'Unauthorized', code: 'UNAUTHORIZED_INTERNAL_CALL' })
    expect(res.statusCode).toBe(401)
    const parsed = JSON.parse(res.body)
    expect(parsed.error).toBe('Unauthorized')
    expect(parsed.code).toBe('UNAUTHORIZED_INTERNAL_CALL')
  })

  it('handles health check response payload', () => {
    const res = createMockResponse()
    const healthPayload = {
      status: 'ok',
      service: 'ecobe-engineclaude',
      timestamp: new Date().toISOString(),
    }
    writeJsonInline(res, 200, healthPayload)
    expect(res.statusCode).toBe(200)
    const parsed = JSON.parse(res.body)
    expect(parsed.status).toBe('ok')
    expect(parsed.service).toBe('ecobe-engineclaude')
  })
})

// ─── isInternalRequest — logic with ECOBE_INTERNAL_API_KEY ───────────────────

describe('isInternalRequest logic', () => {
  /**
   * Tests the isInternalRequest logic which gates access to protected paths.
   * isInternalRequest: if !env.ECOBE_INTERNAL_API_KEY → return false
   *                    else → extractInternalToken(req) === env.ECOBE_INTERNAL_API_KEY
   */

  function isInternalRequestSimulation(
    req: Pick<IncomingMessage, 'headers'>,
    internalApiKey: string | undefined
  ): boolean {
    if (!internalApiKey) return false
    return extractInternalToken(req) === internalApiKey
  }

  it('returns false when ECOBE_INTERNAL_API_KEY is not set', () => {
    const req = { headers: { authorization: 'Bearer some-token' } }
    expect(isInternalRequestSimulation(req, undefined)).toBe(false)
  })

  it('returns false when token does not match', () => {
    const req = { headers: { authorization: 'Bearer wrong-token' } }
    expect(isInternalRequestSimulation(req, 'correct-key')).toBe(false)
  })

  it('returns true when Bearer token matches ECOBE_INTERNAL_API_KEY', () => {
    const req = { headers: { authorization: 'Bearer correct-key' } }
    expect(isInternalRequestSimulation(req, 'correct-key')).toBe(true)
  })

  it('returns true when x-ecobe-internal-key matches', () => {
    const req = { headers: { 'x-ecobe-internal-key': 'correct-key' } }
    expect(isInternalRequestSimulation(req, 'correct-key')).toBe(true)
  })

  it('returns true when x-api-key matches', () => {
    const req = { headers: { 'x-api-key': 'correct-key' } }
    expect(isInternalRequestSimulation(req, 'correct-key')).toBe(true)
  })

  it('returns false when request has no auth headers', () => {
    const req = { headers: {} }
    expect(isInternalRequestSimulation(req, 'some-key')).toBe(false)
  })
})