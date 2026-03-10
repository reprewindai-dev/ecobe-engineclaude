import { NextResponse } from 'next/server'

const DEFAULT_ENGINE_URL = 'http://localhost:3000'

function getEngineBaseUrl() {
  return process.env.ECOBE_API_URL || DEFAULT_ENGINE_URL
}

async function proxy(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params

  const engineBaseUrl = getEngineBaseUrl().replace(/\/$/, '')
  const url = new URL(request.url)

  const targetUrl = new URL(
    `${engineBaseUrl}/api/v1/${path.map(encodeURIComponent).join('/')}${url.search}`
  )

  const headers = new Headers(request.headers)
  headers.delete('host')

  const res = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
    redirect: 'manual',
  })

  return new NextResponse(res.body, {
    status: res.status,
    headers: res.headers,
  })
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
