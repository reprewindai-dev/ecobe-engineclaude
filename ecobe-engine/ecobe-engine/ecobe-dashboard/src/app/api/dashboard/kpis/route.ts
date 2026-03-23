import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ECOBE_ENGINE_URL =
  process.env.ECOBE_API_URL ||
  process.env.CO2ROUTER_API_URL ||
  'http://localhost:3000'

const ECOBE_ENGINE_API_KEY =
  process.env.DEKES_API_KEY ||
  process.env.ECOBE_API_KEY ||
  process.env.CO2ROUTER_API_KEY

async function fetchFromEngine(path: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (ECOBE_ENGINE_API_KEY) {
    headers.Authorization = `Bearer ${ECOBE_ENGINE_API_KEY}`
  }

  const response = await fetch(`${ECOBE_ENGINE_URL}/api/v1${path}`, {
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
    const days = searchParams.get('days') || '30'
    const data = await fetchFromEngine(`/dashboard/carbon-ledger-summary?days=${encodeURIComponent(days)}`)
    return NextResponse.json(data)
  } catch (error) {
    console.error('KPIs API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch KPI data'
    const updatedMessage = message.replace('ECOBE Engine', 'CO₂Router Engine')
    return NextResponse.json(
      { error: updatedMessage },
      { status: 500 }
    )
  }
}
