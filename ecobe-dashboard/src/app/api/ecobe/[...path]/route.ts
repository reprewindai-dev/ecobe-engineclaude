import crypto from 'crypto'
import axios from 'axios'
import { NextResponse } from 'next/server'

const DEFAULT_ENGINE_URL = 'https://ecobe-engineclaude-production.up.railway.app'
const FORWARDED_HEADERS = ['accept', 'content-type', 'authorization', 'x-request-id', 'x-ecobe-signature'] as const
const SIGNED_DECISION_PATHS = new Set(['ci/route', 'ci/authorize', 'ci/carbon-route'])

function getEngineBaseUrl() {
  return process.env.ECOBE_API_URL || DEFAULT_ENGINE_URL
}

function shouldUseInternalKey(path: string[]) {
  const joined = path.join('/')
  return (
    joined === 'methodology' ||
    joined.startsWith('methodology/') ||
    joined.startsWith('disclosure/') ||
    joined.startsWith('system/')
  )
}

function getDecisionApiSignatureSecret() {
  return (
    process.env.DECISION_API_SIGNATURE_SECRET ||
    process.env.CO2ROUTER_DECISION_API_SIGNATURE_SECRET ||
    null
  )
}

function signDecisionBody(body: Buffer) {
  const secret = getDecisionApiSignatureSecret()
  if (!secret) return null
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

async function proxy(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params

  const engineBaseUrl = getEngineBaseUrl().replace(/\/$/, '')
  const url = new URL(request.url)
  const useInternalKey = shouldUseInternalKey(path)

  const targetUrl = new URL(
    `${engineBaseUrl}/api/v1/${path.map(encodeURIComponent).join('/')}${url.search}`
  )

  const headers: Record<string, string> = {}
  for (const header of FORWARDED_HEADERS) {
    if (useInternalKey && header === 'authorization') {
      continue
    }
    const value = request.headers.get(header)
    if (value) headers[header] = value
  }

  if (useInternalKey) {
    const internalKey = process.env.ECOBE_INTERNAL_API_KEY
    if (!internalKey) {
      return NextResponse.json(
        { error: 'Dashboard internal engine authentication is not configured.' },
        { status: 503 }
      )
    }
    headers.authorization = `Bearer ${internalKey}`
    headers['x-ecobe-internal-key'] = internalKey
    headers['x-api-key'] = internalKey
  }

  const bodyBuffer =
    ['GET', 'HEAD'].includes(request.method) ? undefined : Buffer.from(await request.arrayBuffer())

  if (!useInternalKey && bodyBuffer && SIGNED_DECISION_PATHS.has(path.join('/')) && !headers['x-ecobe-signature']) {
    const signature = signDecisionBody(bodyBuffer)
    if (signature) {
      headers['x-ecobe-signature'] = `v1=${signature}`
    }
  }

  const upstream = await axios.request<ArrayBuffer>({
    url: targetUrl.toString(),
    method: request.method as
      | 'GET'
      | 'POST'
      | 'PUT'
      | 'PATCH'
      | 'DELETE'
      | 'HEAD'
      | 'OPTIONS',
    headers,
    data: bodyBuffer,
    responseType: 'arraybuffer',
    validateStatus: () => true,
    maxRedirects: 0,
  })

  const response = new NextResponse(upstream.data, {
    status: upstream.status,
    headers: upstream.headers as HeadersInit,
  })
  response.headers.set('x-ecobe-proxy-mode', useInternalKey ? 'internal' : 'forwarded')
  return response
}

export async function GET(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, ctx)
}

export async function POST(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, ctx)
}

export async function PUT(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, ctx)
}

export async function PATCH(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, ctx)
}

export async function DELETE(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, ctx)
}
