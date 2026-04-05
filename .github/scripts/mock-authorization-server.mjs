import http from 'node:http'

const port = Number(process.env.MOCK_AUTH_PORT || 4010)
const apiKey = process.env.MOCK_AUTH_API_KEY || 'test-internal-api-key'

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      if (!body) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function caseFromPayload(payload) {
  const name = [
    payload?.workload?.name,
    payload?.workloadId,
    payload?.runtimeTarget?.targetId,
    payload?.metadata?.job,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (name.includes('deny')) return 'deny'
  if (name.includes('delay')) return 'delay'
  if (name.includes('throttle')) return 'throttle'
  if (name.includes('reroute')) return 'reroute'
  return 'run_now'
}

function buildResponse(payload) {
  const decisionMode = payload?.decisionMode || 'runtime_authorization'
  const decisionCase = caseFromPayload(payload)
  const selectedRegion =
    decisionCase === 'reroute'
      ? payload?.preferredRegions?.[1] || 'us-west-2'
      : payload?.preferredRegions?.[0] || 'us-east-1'
  const notBefore =
    decisionCase === 'delay' ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null
  const decisionFrameId = `df-${decisionCase}-${Date.now()}`
  const executable =
    decisionMode === 'runtime_authorization' && decisionCase !== 'deny' && decisionCase !== 'delay'
  const maxParallel = decisionCase === 'throttle' ? 2 : decisionCase === 'delay' || decisionCase === 'deny' ? 0 : 1

  return {
    decision: decisionCase,
    decisionMode,
    decisionFrameId,
    reasonCode: `MOCK_${decisionCase.toUpperCase()}`,
    proofHash: `sha256:${decisionFrameId}`,
    selectedRegion,
    selectedRunner: 'ubuntu-latest',
    signalConfidence: decisionCase === 'deny' ? 0.22 : 0.91,
    fallbackUsed: decisionCase === 'deny',
    selected: {
      region: selectedRegion,
      carbonIntensity: decisionCase === 'deny' ? 480 : 118,
    },
    baseline: {
      region: payload?.preferredRegions?.[0] || 'us-east-1',
      carbonIntensity: 320,
    },
    savings: {
      carbonReductionPct: decisionCase === 'deny' ? 0 : 63.1,
    },
    policyTrace: {
      policyVersion: 'mock.v1',
      conflictHierarchy: ['policy', 'water', 'sla', 'carbon', 'cost'],
      operatingMode: decisionMode,
    },
    decisionTrust: {
      signalFreshness: {
        carbonFreshnessSec: 45,
        waterFreshnessSec: 300,
        freshnessSummary: 'carbon freshness 45s | water freshness 300s',
      },
      providerTrust: {
        primarySource: decisionCase === 'deny' ? 'DEGRADED_SAFE_STATIC_FALLBACK' : 'WATTTIME_MOER',
      },
      disagreement: {
        flagged: false,
        pct: 0,
      },
      estimatedFields: [],
      replayability: 'deterministic-match',
      fallbackMode: decisionCase === 'deny' ? 'degraded_safe' : 'live',
      degradedState: decisionCase === 'deny',
    },
    enforcementBundle: {
      githubActions: {
        executable,
        maxParallel,
        environment:
          decisionCase === 'delay'
            ? 'ecobe-deferred'
            : decisionCase === 'deny'
              ? 'ecobe-blocked'
              : 'ecobe-authorized',
        matrixAllowedRegions: [selectedRegion],
        notBefore,
      },
      kubernetes: {
        admission: {
          allow: decisionCase !== 'deny',
          reason: `MOCK_${decisionCase.toUpperCase()}`,
        },
      },
    },
    workflowOutputs: {
      decisionFrameId,
      selectedRegion,
      selectedRunner: 'ubuntu-latest',
      carbonIntensity: decisionCase === 'deny' ? 480 : 118,
      carbonBaseline: 320,
      carbonReductionPct: decisionCase === 'deny' ? 0 : 63.1,
    },
    notBefore,
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') {
      writeJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() })
      return
    }

    if (req.method === 'POST' && req.url === '/api/v1/ci/authorize') {
      const auth = req.headers.authorization
      if (auth !== `Bearer ${apiKey}`) {
        writeJson(res, 401, { error: 'Unauthorized' })
        return
      }

      const payload = await readJson(req)
      writeJson(res, 200, buildResponse(payload))
      return
    }

    writeJson(res, 404, { error: 'Not found' })
  } catch (error) {
    writeJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Mock authorization server listening on http://127.0.0.1:${port}\n`)
})
