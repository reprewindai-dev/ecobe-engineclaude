const fs = require('fs')
const os = require('os')

function getInput(name, fallback = '') {
  const envName = `INPUT_${name.replace(/ /g, '_').replace(/-/g, '_').toUpperCase()}`
  const value = process.env[envName]
  return value == null ? fallback : value.trim()
}

function requireInput(name) {
  const value = getInput(name)
  if (!value) {
    throw new Error(`Missing required input: ${name}`)
  }
  return value
}

function parseList(value) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function parseNumber(name, fallback) {
  const raw = getInput(name, String(fallback))
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error(`Input ${name} must be a valid number`)
  }
  return value
}

function parseOptionalNumber(name) {
  const raw = getInput(name)
  if (!raw) {
    return undefined
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error(`Input ${name} must be a valid number`)
  }
  return value
}

function parseBoolean(name, fallback = false) {
  const raw = getInput(name, fallback ? 'true' : 'false').toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes'
}

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT
  if (!outputFile) {
    return
  }

  const serialized = value == null ? '' : String(value)
  if (serialized.includes('\n')) {
    const token = `ECOBE_${name.replace(/[^A-Za-z0-9]/g, '_')}_${Date.now()}`
    fs.appendFileSync(outputFile, `${name}<<${token}${os.EOL}${serialized}${os.EOL}${token}${os.EOL}`)
    return
  }

  fs.appendFileSync(outputFile, `${name}=${serialized}${os.EOL}`)
}

function appendSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY
  if (!summaryFile) {
    return
  }

  fs.appendFileSync(summaryFile, `${markdown}${os.EOL}`)
}

function toJson(value, fallback) {
  return JSON.stringify(value == null ? fallback : value)
}

function isoOrEmpty(value) {
  return value == null ? '' : String(value)
}

async function main() {
  const engineUrl = requireInput('engine-url').replace(/\/$/, '')
  const apiKey = requireInput('api-key')
  const preferredRegions = parseList(getInput('preferred-regions', 'us-east-1,us-west-2,eu-west-1'))

  if (preferredRegions.length === 0) {
    throw new Error('preferred-regions must include at least one region')
  }

  const workloadId =
    getInput('workload-id') ||
    `${process.env.GITHUB_REPOSITORY || 'unknown-repo'}:${getInput('job-name', process.env.GITHUB_JOB || 'governed-job')}`

  const payload = {
    requestId: process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}-${process.env.GITHUB_JOB || 'job'}`
      : undefined,
    preferredRegions,
    carbonWeight: parseOptionalNumber('carbon-weight'),
    waterWeight: parseOptionalNumber('water-weight'),
    latencyWeight: parseOptionalNumber('latency-weight'),
    costWeight: parseOptionalNumber('cost-weight'),
    workloadClass: getInput('workload-class', 'interactive'),
    jobType: getInput('job-type', 'standard'),
    criticality: getInput('criticality', 'standard'),
    waterPolicyProfile: getInput('water-policy-profile', 'default'),
    allowDelay: parseBoolean('allow-delay', true),
    deadlineAt: getInput('deadline-at') || undefined,
    maxDelayMinutes: parseNumber('max-delay-minutes', 30),
    criticalPath: parseBoolean('critical-path', false),
    decisionMode: getInput('decision-mode', 'runtime_authorization'),
    caller: {
      system: 'github_actions',
      actor: process.env.GITHUB_ACTOR || 'github-actions',
      requestId: process.env.GITHUB_RUN_ID || workloadId,
    },
    runtimeTarget: {
      runtime: 'github_actions',
      targetId: workloadId,
      labels: [process.env.RUNNER_NAME || 'github-actions'],
      regionAffinity: preferredRegions,
      criticality: getInput('criticality', 'standard'),
    },
    transport: {
      controlPoint: 'ci_pre_job',
      transport: 'ci_runner',
      adapterId: 'co2router.github-action.v2',
      adapterVersion: '2026-04-04',
    },
    telemetryContext: {
      traceId: process.env.GITHUB_RUN_ID || workloadId,
      spanId: process.env.GITHUB_RUN_ATTEMPT || '1',
      source: 'github_actions',
    },
    workload: {
      name: getInput('job-name', process.env.GITHUB_JOB || 'governed-job'),
      type: getInput('job-type', 'standard'),
      runtime: 'github_actions',
    },
    timestamp: new Date().toISOString(),
    metadata: {
      repo: process.env.GITHUB_REPOSITORY || '',
      workflow: process.env.GITHUB_WORKFLOW || '',
      job: process.env.GITHUB_JOB || '',
      commitSha: process.env.GITHUB_SHA || '',
      branch: process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || '',
      eventName: process.env.GITHUB_EVENT_NAME || '',
      serverUrl: process.env.GITHUB_SERVER_URL || '',
      runId: process.env.GITHUB_RUN_ID || '',
      runAttempt: process.env.GITHUB_RUN_ATTEMPT || '',
    },
  }

  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key])

  const controller = new AbortController()
  const timeoutMs = parseNumber('timeout-seconds', 30) * 1000
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  let response
  let bodyText = ''

  try {
    response = await fetch(`${engineUrl}/api/v1/ci/authorize`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    bodyText = await response.text()
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error(`CO2 Router authorization failed with ${response.status}: ${bodyText}`)
  }

  const result = JSON.parse(bodyText)
  const githubActions = result.enforcementBundle?.githubActions ?? {}
  const approvedRegion = result.selectedRegion || result.workflowOutputs?.selectedRegion || ''
  const approvedRunnerLabel = result.selectedRunner || result.workflowOutputs?.selectedRunner || ''
  const decision = result.decision || 'deny'
  const decisionFrameId = result.decisionFrameId || result.workflowOutputs?.decisionFrameId || ''
  const executable = githubActions.executable !== false && result.decisionMode === 'runtime_authorization'
  const notBefore = result.notBefore ?? githubActions.notBefore ?? null
  const matrixAllowedRegions = githubActions.matrixAllowedRegions ?? (approvedRegion ? [approvedRegion] : [])
  const policyTrace = result.policyTrace ?? {}
  const trust = result.decisionTrust ?? {}
  const recommendation =
    result.recommendation ||
    [decision, result.reasonCode || 'UNKNOWN_REASON', approvedRegion || 'no-region'].join(' | ')

  const outputs = {
    decision,
    'policy-action': decision,
    'reason-code': result.reasonCode ?? '',
    'decision-frame-id': decisionFrameId,
    'decision-id': decisionFrameId,
    'proof-hash': result.proofHash ?? '',
    'approved-region': approvedRegion,
    'approved-runner-label': approvedRunnerLabel,
    'approved-runs-on-json': approvedRunnerLabel ? toJson([approvedRunnerLabel], []) : toJson([], []),
    'matrix-allowed-regions': toJson(matrixAllowedRegions, []),
    executable: executable ? 'true' : 'false',
    environment: githubActions.environment ?? '',
    'max-parallel': String(githubActions.maxParallel ?? 1),
    'not-before': isoOrEmpty(notBefore),
    'policy-trace': JSON.stringify(policyTrace),
    trust: JSON.stringify(trust),
    'signal-confidence': String(result.signalConfidence ?? ''),
    recommendation,
    'selected-runner': approvedRunnerLabel,
    'selected-region': approvedRegion,
    'carbon-intensity': String(result.selected?.carbonIntensity ?? result.workflowOutputs?.carbonIntensity ?? ''),
    baseline: String(result.baseline?.carbonIntensity ?? result.workflowOutputs?.carbonBaseline ?? ''),
    savings: String(result.savings?.carbonReductionPct ?? result.workflowOutputs?.carbonReductionPct ?? ''),
  }

  Object.entries(outputs).forEach(([name, value]) => setOutput(name, value))

  appendSummary(
    [
      '## CO2 Router Pre-Execution Authorization',
      '',
      '| Field | Value |',
      '| --- | --- |',
      `| Decision | ${outputs.decision} |`,
      `| Reason code | ${outputs['reason-code'] || 'n/a'} |`,
      `| Executable | ${outputs.executable} |`,
      `| Approved region | ${outputs['approved-region'] || 'n/a'} |`,
      `| Approved runner | ${outputs['approved-runner-label'] || 'n/a'} |`,
      `| Max parallel | ${outputs['max-parallel']} |`,
      `| Environment | ${outputs.environment || 'n/a'} |`,
      `| Not before | ${outputs['not-before'] || 'n/a'} |`,
      `| Proof hash | ${outputs['proof-hash'] || 'n/a'} |`,
      `| Decision frame | ${outputs['decision-frame-id'] || 'n/a'} |`,
      `| Carbon intensity | ${outputs['carbon-intensity'] || 'n/a'} |`,
      `| Baseline | ${outputs.baseline || 'n/a'} |`,
      `| Savings % | ${outputs.savings || 'n/a'} |`,
      '',
      `> ${recommendation}`,
    ].join('\n')
  )

  const failOnDeny = parseBoolean('fail-on-deny', true)
  const failOnDelay = parseBoolean('fail-on-delay', true)
  const failOnNonExecutable = parseBoolean('fail-on-non-executable', true)

  if (decision === 'deny' && failOnDeny) {
    process.stderr.write(
      `::error::CO2 Router denied execution (${outputs['reason-code'] || 'UNKNOWN_REASON'}). Decision frame ${decisionFrameId}${os.EOL}`
    )
    process.exitCode = 1
    return
  }

  if (decision === 'delay' && failOnDelay) {
    process.stderr.write(
      `::error::CO2 Router deferred execution until ${outputs['not-before'] || 'a later window'} (${outputs['reason-code'] || 'DELAY'}). Decision frame ${decisionFrameId}${os.EOL}`
    )
    process.exitCode = 1
    return
  }

  if (!executable && failOnNonExecutable) {
    process.stderr.write(
      `::error::CO2 Router returned a non-executable bundle in ${result.decisionMode || 'unknown'} mode. Decision frame ${decisionFrameId}${os.EOL}`
    )
    process.exitCode = 1
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`::error::${message}${os.EOL}`)
  process.exitCode = 1
})
