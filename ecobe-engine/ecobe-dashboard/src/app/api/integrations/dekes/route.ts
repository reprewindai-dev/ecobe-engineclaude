import { NextResponse } from 'next/server'

const ECOBE_ENGINE_URL =
  process.env.ECOBE_API_URL ||
  process.env.CO2ROUTER_API_URL ||
  'http://localhost:3000'

const ECOBE_ENGINE_API_KEY =
  process.env.DEKES_API_KEY ||
  process.env.ECOBE_API_KEY ||
  process.env.CO2ROUTER_API_KEY

async function fetchFromEngine(path: string) {
  const url = `${ECOBE_ENGINE_URL}/api/v1${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (ECOBE_ENGINE_API_KEY) {
    headers.Authorization = `Bearer ${ECOBE_ENGINE_API_KEY}`
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`ECOBE Engine error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const endpoint = searchParams.get('endpoint') || 'summary'
    const days = searchParams.get('days') || '30'
    const hours = searchParams.get('hours') || '168'

    let path = `/integrations/dekes/${endpoint}`

    const params = new URLSearchParams()
    if (endpoint === 'summary' && days) params.set('days', days)
    if (endpoint === 'metrics' && hours) params.set('hours', hours)

    if (params.toString()) {
      path += `?${params.toString()}`
    }

    const data = await fetchFromEngine(path)

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
