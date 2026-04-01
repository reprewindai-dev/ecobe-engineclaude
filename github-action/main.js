const fs = require('fs')

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
  fs.appendFileSync(outputFile, `${name}=${serialized}${require('os').EOL}`)
}

function appendSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY
  if (!summaryFile) {
    return
  }

  fs.appendFileSync(summaryFile, `${markdown}${require('os').EOL}`)
}

async function main() {
  const engineUrl = requireInput('engine-url').replace(/\/$/, '')
  const apiKey = requireInput('api-key')
  const candidateRegions = parseList(getInput('candidate-regions') || getInput('preferred-regions') || 'eastus,northeurope,norwayeast')
  const candidateRunners = parseList(getInput('candidate-runners', 'ubuntu-latest,windows-latest,macos-latest'))
  const workloadId =
    getInput('workload-id') ||
    `${getInput('repo', process.env.GITHUB_REPOSITORY || 'unknown-repo')}:${getInput('job-name', getInput('job-type', 'standard'))}`

  if (candidateRegions.length === 0) {
    throw new Error('candidate-regions must include at least one region')
  }

  const payload = {
    workloadId,
    workloadName: getInput('job-name') || undefined,
    orgId: getInput('org-id') || undefined,
    candidateRegions,
    baselineRegion: getInput('baseline-region') || undefined,
    candidateRunners,
    durationMinutes: parseNumber('duration-minutes', 20),
    delayToleranceMinutes: parseNumber('delay-tolerance-minutes', 0),
    deadline: getInput('deadline') || undefined,
    signalProfile: getInput('signal-profile', 'us_official'),
    criticality: getInput('criticality', 'standard'),
    matrixSize: parseNumber('matrix-size', 1),
    jobType: getInput('job-type', 'standard'),
    assuranceMode: parseBoolean('assurance-mode', false),
    carbonWeight: getInput('carbon-weight') ? parseNumber('carbon-weight', 0) : undefined,
    latencyWeight: getInput('latency-weight') ? parseNumber('latency-weight', 0) : undefined,
    costWeight: getInput('cost-weight') ? parseNumber('cost-weight', 0) : undefined,
    metadata: {
      repo: getInput('repo', process.env.GITHUB_REPOSITORY || ''),
      workflow: getInput('workflow', process.env.GITHUB_WORKFLOW || ''),
      commitSha: getInput('commit-sha', process.env.GITHUB_SHA || ''),
      branch: getInput('branch', process.env.GITHUB_REF_NAME || ''),
      eventName: getInput('event-name', process.env.GITHUB_EVENT_NAME || ''),
    },
  }

  const controller = new AbortController()
  const timeoutMs = parseNumber('timeout-seconds', 30) * 1000
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  let response
  let bodyText = ''

  try {
    response = await fetch(`${engineUrl}/api/v1/ci/carbon-route`, {
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
    throw new Error(`ECOBE CI preflight failed with ${response.status}: ${bodyText}`)
  }

  const result = JSON.parse(bodyText)
  const policyTrace = Array.isArray(result.policyTrace) ? JSON.stringify(result.policyTrace) : '[]'
  const signalConfidence =
    result.signalConfidence && typeof result.signalConfidence === 'object'
      ? result.signalConfidence.label || ''
      : result.confidence || ''

  const outputs = {
    decision: result.decision ?? 'run_now',
    'reason-code': result.reasonCode ?? '',
    'approved-region': result.approvedRegion ?? result.selectedRegion ?? '',
    'approved-runner-label': result.approvedRunnerLabel ?? result.selectedRunner ?? '',
    'delay-seconds': result.delaySeconds ?? 0,
    'max-parallel': result.maxParallel ?? 1,
    'estimated-savings-percent': result.estimatedSavingsPercent ?? result.savings ?? '',
    'decision-id': result.decisionId ?? result.decisionFrameId ?? '',
    'baseline-carbon-intensity': result.baselineCarbonIntensity ?? result.baseline ?? '',
    'selected-carbon-intensity': result.selectedCarbonIntensity ?? result.carbonIntensity ?? '',
    'signal-confidence': signalConfidence,
    'policy-trace': policyTrace,
    recommendation: result.recommendation ?? '',
    'selected-runner': result.selectedRunner ?? result.approvedRunnerLabel ?? '',
    'selected-region': result.selectedRegion ?? result.approvedRegion ?? '',
    'carbon-intensity': result.carbonIntensity ?? result.selectedCarbonIntensity ?? '',
    baseline: result.baseline ?? result.baselineCarbonIntensity ?? '',
    savings: result.savings ?? result.estimatedSavingsPercent ?? '',
  }

  Object.entries(outputs).forEach(([name, value]) => setOutput(name, value))

  appendSummary(
    [
      '## ECOBE CI Preflight',
      '',
      '| Field | Value |',
      '| --- | --- |',
      `| Decision | ${outputs.decision} |`,
      `| Reason | ${outputs['reason-code'] || 'n/a'} |`,
      `| Approved region | ${outputs['approved-region'] || 'n/a'} |`,
      `| Approved runner | ${outputs['approved-runner-label'] || 'n/a'} |`,
      `| Delay seconds | ${outputs['delay-seconds']} |`,
      `| Max parallel | ${outputs['max-parallel']} |`,
      `| Baseline carbon intensity | ${outputs['baseline-carbon-intensity'] || 'n/a'} |`,
      `| Selected carbon intensity | ${outputs['selected-carbon-intensity'] || 'n/a'} |`,
      `| Estimated savings % | ${outputs['estimated-savings-percent'] || 'n/a'} |`,
      `| Confidence | ${outputs['signal-confidence'] || 'n/a'} |`,
      `| Decision id | ${outputs['decision-id'] || 'n/a'} |`,
      '',
      outputs.recommendation ? `> ${outputs.recommendation}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  )

  if (outputs.decision === 'deny' && parseBoolean('fail-on-deny', true)) {
    process.stderr.write(
      `::error::ECOBE denied execution (${outputs['reason-code'] || 'UNKNOWN_REASON'}). Decision id ${outputs['decision-id']}\n`
    )
    process.exitCode = 1
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`::error::${message}\n`)
  process.exitCode = 1
})
