import fs from 'node:fs/promises'
import path from 'node:path'

const baseUrl = (process.env.ECOBE_ENGINE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '')
const apiKey = process.env.ECOBE_INTERNAL_API_KEY || process.env.ECOBE_ENGINE_API_KEY || ''
const outputPath =
  process.env.ENFORCEMENT_PROOF_OUTPUT_PATH ||
  path.join(process.cwd(), '.github-artifacts', 'enforcement-proof', 'result.json')

if (!apiKey) {
  throw new Error('ECOBE_INTERNAL_API_KEY or ECOBE_ENGINE_API_KEY is required')
}

async function fetchJson(route, init = {}) {
  const response = await fetch(`${baseUrl}${route}`, init)
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }

  if (!response.ok) {
    throw new Error(`${route} returned ${response.status}: ${text}`)
  }

  return body
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function main() {
  const startedAt = new Date().toISOString()

  const authorizationPayload = {
    requestId: `gha-proof-${Date.now()}`,
    preferredRegions: ['us-east-1', 'us-west-2', 'eu-west-1'],
    workloadClass: 'interactive',
    jobType: 'standard',
    criticality: 'standard',
    waterPolicyProfile: 'default',
    allowDelay: true,
    maxDelayMinutes: 20,
    decisionMode: 'runtime_authorization',
    caller: {
      system: 'github_actions',
      actor: 'github-actions',
      requestId: 'gha-proof',
    },
    runtimeTarget: {
      runtime: 'github_actions',
      targetId: 'gha-proof-runtime-target',
      labels: ['ubuntu-latest'],
      regionAffinity: ['us-east-1', 'us-west-2', 'eu-west-1'],
      criticality: 'standard',
    },
    transport: {
      controlPoint: 'ci_pre_job',
      transport: 'ci_runner',
      adapterId: 'co2router.github-action.v2',
      adapterVersion: '2026-04-05',
    },
    telemetryContext: {
      traceId: 'gha-proof-trace',
      spanId: '1',
      source: 'github_actions',
    },
    workload: {
      name: 'gha-proof-runtime',
      type: 'standard',
      runtime: 'github_actions',
    },
    timestamp: new Date().toISOString(),
    metadata: {
      repo: 'reprewindai-dev/ecobe-engineclaude',
      workflow: 'Enforcement Proof',
      job: 'engine-runtime-proof',
      branch: 'codex/full-doctrine-enforcement',
    },
  }

  const authorization = await fetchJson('/api/v1/ci/authorize', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(authorizationPayload),
  })

  assert(
    ['run_now', 'reroute', 'delay', 'throttle', 'deny'].includes(authorization.decision),
    'authorization decision must be one of the five binding actions'
  )
  assert(authorization.decisionMode === 'runtime_authorization', 'authorization must run in runtime mode')
  assert(typeof authorization.decisionFrameId === 'string' && authorization.decisionFrameId.length > 0, 'missing decisionFrameId')
  assert(typeof authorization.proofHash === 'string' && authorization.proofHash.length > 0, 'missing proofHash')
  assert(authorization.policyTrace && typeof authorization.policyTrace === 'object', 'missing policyTrace')
  assert(authorization.decisionTrust && typeof authorization.decisionTrust === 'object', 'missing decisionTrust')
  assert(
    authorization.enforcementBundle?.githubActions &&
      typeof authorization.enforcementBundle.githubActions === 'object',
    'missing GitHub Actions enforcement bundle'
  )
  assert(
    authorization.kubernetesEnforcement || authorization.enforcementBundle?.kubernetes,
    'missing Kubernetes enforcement bundle'
  )

  const dekesRoute = await fetchJson('/api/v1/route', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      source: 'github-actions-proof',
      workloadType: 'dekes_runtime_route',
      candidateRegions: ['us-east-1', 'us-west-2', 'eu-west-1'],
      durationMinutes: 9,
      delayToleranceMinutes: 15,
      maxCarbonGPerKwh: 400,
      carbonWeight: 0.6,
      latencyWeight: 0.2,
      costWeight: 0.2,
    }),
  })

  assert(typeof dekesRoute.decisionFrameId === 'string' && dekesRoute.decisionFrameId.length > 0, 'DEKES route missing decisionFrameId')
  assert(typeof dekesRoute.proofHash === 'string' && dekesRoute.proofHash.length > 0, 'DEKES route missing proofHash')
  assert(typeof dekesRoute.action === 'string' && dekesRoute.action.length > 0, 'DEKES route missing action')

  const dekesCompletion = await fetchJson('/api/v1/workloads/complete', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      decision_id: dekesRoute.decisionFrameId,
      executionRegion: dekesRoute.selectedRegion,
      durationMinutes: 7,
      status: 'success',
    }),
  })

  assert(dekesCompletion.received === true, 'DEKES completion receipt was not recorded')

  const dekesEvents = await fetchJson('/api/v1/integrations/dekes/events?limit=10&hours=1')
  assert(Array.isArray(dekesEvents.events), 'DEKES integration events missing events array')
  assert(
    dekesEvents.events.some((event) => event.type === 'ROUTING_DECISION'),
    'DEKES integration events missing ROUTING_DECISION'
  )
  assert(
    dekesEvents.events.some((event) => event.type === 'WORKLOAD_COMPLETED'),
    'DEKES integration events missing WORKLOAD_COMPLETED'
  )

  const systemStatus = await fetchJson('/api/v1/system/status')
  const systemCache = await fetchJson('/api/v1/system/cache')
  const gridSummary = await fetchJson('/api/v1/intelligence/grid/summary?regions=us-east-1')

  assert(systemStatus.providerFreshness, 'system status missing providerFreshness summary')
  assert(systemStatus.decisionProjectionBacklog, 'system status missing decisionProjectionBacklog')
  assert(systemStatus.cache, 'system status missing cache block')
  assert(systemCache.cache?.healthy !== undefined, 'system cache response missing health')
  assert(Array.isArray(gridSummary.regions), 'grid summary missing regions array')

  const result = {
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl,
    authorization: {
      decision: authorization.decision,
      decisionFrameId: authorization.decisionFrameId,
      proofHash: authorization.proofHash,
      selectedRegion: authorization.selectedRegion,
      githubActions: authorization.enforcementBundle.githubActions,
      policyTrace: authorization.policyTrace,
      decisionTrust: authorization.decisionTrust,
    },
    dekes: {
      decisionFrameId: dekesRoute.decisionFrameId,
      proofHash: dekesRoute.proofHash,
      action: dekesRoute.action,
      selectedRegion: dekesRoute.selectedRegion,
      completion: dekesCompletion,
      events: dekesEvents.events,
    },
    telemetry: {
      systemStatus,
      systemCache,
      gridSummary,
    },
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  process.stdout.write(`Wrote enforcement proof to ${outputPath}\n`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
