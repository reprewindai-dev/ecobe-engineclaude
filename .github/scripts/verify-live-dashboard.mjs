const dashboardUrl = (process.env.DASHBOARD_URL || process.env.DEFAULT_DASHBOARD_URL || '').trim().replace(/\/$/, '')

if (!dashboardUrl) {
  console.error('Missing DASHBOARD_URL or DEFAULT_DASHBOARD_URL.')
  process.exit(1)
}

const samplePayload = {
  preferredRegions: ['us-west-2', 'us-east-1', 'eu-west-1'],
  carbonWeight: 0.7,
  waterWeight: 0.3,
  latencyWeight: 0.1,
  costWeight: 0.1,
  estimatedEnergyKwh: 1.25,
  jobType: 'standard',
  criticality: 'standard',
  waterPolicyProfile: 'default',
  allowDelay: true,
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function fetchText(pathname) {
  const response = await fetch(`${dashboardUrl}${pathname}`)
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${pathname} returned ${response.status}: ${text}`)
  }
  return { response, text }
}

async function fetchJson(pathname) {
  const response = await fetch(`${dashboardUrl}${pathname}`)
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  if (!response.ok) {
    throw new Error(`${pathname} returned ${response.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`)
  }
  return { response, json }
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return Number((sorted[Math.max(0, index)] ?? 0).toFixed(3))
}

function parseServerTimingTotal(headerValue) {
  if (!headerValue) return null
  const match = /(?:^|,\s*)total;dur=([0-9.]+)/i.exec(headerValue)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? Number(value.toFixed(3)) : null
}

async function runSimulation(mode) {
  const warmupCount = 5
  const sampleCount = 20
  const wallLatencies = []
  const serverLatencies = []
  const responseBytes = []
  let lastHeaders = null

  for (let index = 0; index < warmupCount; index += 1) {
    const response = await fetch(`${dashboardUrl}/api/control-surface/simulate?mode=${mode}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(samplePayload),
    })
    await response.text()
    if (!response.ok) {
      throw new Error(`simulate ${mode} warmup returned ${response.status}`)
    }
  }

  for (let index = 0; index < sampleCount; index += 1) {
    const startedAt = performance.now()
    const response = await fetch(`${dashboardUrl}/api/control-surface/simulate?mode=${mode}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(samplePayload),
    })
    const text = await response.text()
    const elapsedMs = performance.now() - startedAt
    if (!response.ok) {
      throw new Error(`simulate ${mode} returned ${response.status}: ${text}`)
    }
    wallLatencies.push(Number(elapsedMs.toFixed(3)))
    responseBytes.push(Number(response.headers.get('x-co2router-response-bytes') ?? 0))
    const serverTimingTotal = parseServerTimingTotal(response.headers.get('Server-Timing'))
    if (serverTimingTotal === null) {
      throw new Error(`simulate ${mode} missing parsable total server timing`)
    }
    serverLatencies.push(serverTimingTotal)
    lastHeaders = response.headers
  }

  assert(lastHeaders?.get('x-co2router-sim-mode') === mode, `simulate ${mode} missing x-co2router-sim-mode header`)
  assert(Boolean(lastHeaders?.get('Server-Timing')), `simulate ${mode} missing Server-Timing header`)
  assert(Boolean(lastHeaders?.get('x-co2router-response-bytes')), `simulate ${mode} missing response byte header`)

  return {
    mode,
    wallP50Ms: percentile(wallLatencies, 50),
    wallP95Ms: percentile(wallLatencies, 95),
    wallP99Ms: percentile(wallLatencies, 99),
    serverP50Ms: percentile(serverLatencies, 50),
    serverP95Ms: percentile(serverLatencies, 95),
    serverP99Ms: percentile(serverLatencies, 99),
    avgBytes: Number((responseBytes.reduce((sum, value) => sum + value, 0) / responseBytes.length).toFixed(1)),
    samples: wallLatencies.length,
  }
}

const home = await fetchText('/')
assert(home.text.includes('CO2 Router'), 'homepage missing CO2 Router')

const consolePage = await fetchText('/console')
assert(consolePage.text.includes('CO2 Router'), '/console missing CO2 Router')

const commandCenter = await fetchJson('/api/control-surface/command-center')
assert(Boolean(commandCenter.response.headers.get('x-co2router-snapshot-cache')), 'command-center missing cache header')
assert(Boolean(commandCenter.response.headers.get('Server-Timing')), 'command-center missing Server-Timing header')

const liveSystem = await fetchJson('/api/control-surface/live-system')
assert(Boolean(liveSystem.response.headers.get('x-co2router-snapshot-cache')), 'live-system missing cache header')
assert(Boolean(liveSystem.response.headers.get('Server-Timing')), 'live-system missing Server-Timing header')

const overview = await fetchJson('/api/control-surface/overview')
assert(overview.response.status === 200, 'overview route returned non-200')

const metrics = await fetchJson('/api/control-surface/metrics')
assert(Array.isArray(metrics.json?.metrics), 'metrics route missing metrics array')

const fast = await runSimulation('fast')
const full = await runSimulation('full')

assert(fast.serverP95Ms <= 250, `dashboard fast mode p95 above gate: ${fast.serverP95Ms}`)
assert(full.serverP95Ms >= fast.serverP95Ms, 'dashboard full mode must remain slower than fast mode')
assert(full.avgBytes > fast.avgBytes, 'dashboard full mode must remain larger than fast mode')

const result = {
  ok: true,
  checkedAt: new Date().toISOString(),
  dashboardUrl,
  routes: {
    home: home.response.status,
    console: consolePage.response.status,
    commandCenter: commandCenter.response.status,
    liveSystem: liveSystem.response.status,
    overview: overview.response.status,
    metrics: metrics.response.status,
  },
  simulations: {
    fast,
    full,
  },
}

console.log(JSON.stringify(result, null, 2))
