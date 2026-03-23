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

const REGION_NAMES: Record<string, string> = {
  'us-east-1': 'US East (N. Virginia)',
  'us-west-2': 'US West (Oregon)',
  'eu-west-1': 'EU (Ireland)',
  'eu-central-1': 'EU (Frankfurt)',
  'ap-southeast-1': 'Asia Pacific (Singapore)',
  'ap-northeast-1': 'Asia Pacific (Tokyo)',
}

type GridSummaryRegion = {
  region: string
  carbonIntensity: number | null
  source: string | null
  renewableRatio: number | null
  demandRampPct: number | null
  signalQuality: 'high' | 'medium' | 'low'
}

type GridSummaryResponse = {
  timestamp: string
  regions: GridSummaryRegion[]
}

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

  return (await response.json()) as GridSummaryResponse
}

function confidenceFromQuality(signalQuality: GridSummaryRegion['signalQuality']) {
  if (signalQuality === 'high') return 0.9
  if (signalQuality === 'medium') return 0.65
  return 0.35
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const selectedRegions = searchParams.getAll('region')
    const query = selectedRegions.length > 0
      ? `?${selectedRegions.map((region) => `regions=${encodeURIComponent(region)}`).join('&')}`
      : ''

    const data = await fetchFromEngine(`/intelligence/grid/summary${query}`)
    const regionData = data.regions.map((region) => ({
      id: region.region,
      name: REGION_NAMES[region.region] || region.region,
      carbonIntensity: region.carbonIntensity,
      demand: region.demandRampPct != null ? `${region.demandRampPct.toFixed(1)}% ramp` : 'Live grid signal',
      renewable: region.renewableRatio != null ? `${Math.round(region.renewableRatio * 100)}%` : 'Unavailable',
      confidence: confidenceFromQuality(region.signalQuality),
      source: region.source || 'unknown',
      timestamp: data.timestamp,
    }))

    return NextResponse.json(regionData)
  } catch (error) {
    console.error('Regions API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch regions data'
    const updatedMessage = message.replace('ECOBE Engine', 'CO₂Router Engine')
    return NextResponse.json(
      { error: updatedMessage },
      { status: 500 }
    )
  }
}
