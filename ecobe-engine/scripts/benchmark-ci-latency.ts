import fs from 'fs'
import path from 'path'
import { performance } from 'perf_hooks'

const OUTPUT_DIR = path.resolve(process.cwd(), 'data', 'perf', 'ci-decision-latency')
const LATEST_PATH = path.join(OUTPUT_DIR, 'latest.json')
const COMPARE_PATH = path.join(OUTPUT_DIR, 'compare.json')
const SAMPLE_COUNT = 250

type SampleRequest = {
  requestId: string
  preferredRegions: string[]
  jobType: 'standard' | 'heavy' | 'light'
  criticality: 'critical' | 'standard' | 'batch'
  waterPolicyProfile: 'default' | 'drought_sensitive' | 'eu_data_center_reporting' | 'high_water_sensitivity'
  allowDelay: boolean
  criticalPath: boolean
  signalPolicy: 'marginal_first' | 'average_fallback'
  carbonWeight: number
  waterWeight: number
  latencyWeight: number
  costWeight: number
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return Number((sorted[Math.max(0, index)] ?? 0).toFixed(3))
}

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

function readJson(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJson(filePath: string, value: unknown) {
  ensureOutputDir()
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function buildSampleRequests(): SampleRequest[] {
  return [
    {
      requestId: 'bench-us-west-2',
      preferredRegions: ['us-west-2', 'us-east-1', 'eu-west-1'],
      jobType: 'standard',
      criticality: 'standard',
      waterPolicyProfile: 'default',
      allowDelay: true,
      criticalPath: false,
      signalPolicy: 'marginal_first',
      carbonWeight: 0.7,
      waterWeight: 0.3,
      latencyWeight: 0.1,
      costWeight: 0.1,
    },
    {
      requestId: 'bench-us-west-1',
      preferredRegions: ['us-west-1', 'us-west-2', 'us-east-2'],
      jobType: 'heavy',
      criticality: 'batch',
      waterPolicyProfile: 'high_water_sensitivity',
      allowDelay: true,
      criticalPath: false,
      signalPolicy: 'average_fallback',
      carbonWeight: 0.65,
      waterWeight: 0.35,
      latencyWeight: 0.1,
      costWeight: 0.1,
    },
    {
      requestId: 'bench-us-east-2',
      preferredRegions: ['us-east-2', 'us-east-1', 'us-west-2'],
      jobType: 'standard',
      criticality: 'standard',
      waterPolicyProfile: 'drought_sensitive',
      allowDelay: true,
      criticalPath: false,
      signalPolicy: 'marginal_first',
      carbonWeight: 0.7,
      waterWeight: 0.3,
      latencyWeight: 0.1,
      costWeight: 0.1,
    },
    {
      requestId: 'bench-us-east-1',
      preferredRegions: ['us-east-1', 'us-west-2', 'eu-west-1'],
      jobType: 'standard',
      criticality: 'critical',
      waterPolicyProfile: 'default',
      allowDelay: true,
      criticalPath: true,
      signalPolicy: 'marginal_first',
      carbonWeight: 0.7,
      waterWeight: 0.3,
      latencyWeight: 0.15,
      costWeight: 0.1,
    },
    {
      requestId: 'bench-ap-southeast-1',
      preferredRegions: ['ap-southeast-1', 'ap-northeast-1', 'eu-west-1'],
      jobType: 'light',
      criticality: 'batch',
      waterPolicyProfile: 'high_water_sensitivity',
      allowDelay: true,
      criticalPath: false,
      signalPolicy: 'average_fallback',
      carbonWeight: 0.6,
      waterWeight: 0.4,
      latencyWeight: 0.1,
      costWeight: 0.1,
    },
    {
      requestId: 'bench-eu-central-1',
      preferredRegions: ['eu-central-1', 'eu-west-1', 'eu-west-2'],
      jobType: 'standard',
      criticality: 'standard',
      waterPolicyProfile: 'eu_data_center_reporting',
      allowDelay: true,
      criticalPath: false,
      signalPolicy: 'average_fallback',
      carbonWeight: 0.65,
      waterWeight: 0.35,
      latencyWeight: 0.1,
      costWeight: 0.1,
    },
    {
      requestId: 'bench-eu-west-1',
      preferredRegions: ['eu-west-1', 'eu-central-1', 'us-west-2'],
      jobType: 'standard',
      criticality: 'standard',
      waterPolicyProfile: 'default',
      allowDelay: true,
      criticalPath: false,
      signalPolicy: 'average_fallback',
      carbonWeight: 0.65,
      waterWeight: 0.35,
      latencyWeight: 0.1,
      costWeight: 0.1,
    },
    {
      requestId: 'bench-multi',
      preferredRegions: ['us-west-2', 'us-east-1', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'],
      jobType: 'heavy',
      criticality: 'standard',
      waterPolicyProfile: 'drought_sensitive',
      allowDelay: true,
      criticalPath: false,
      signalPolicy: 'marginal_first',
      carbonWeight: 0.7,
      waterWeight: 0.3,
      latencyWeight: 0.1,
      costWeight: 0.1,
    },
  ]
}

function buildResolvedCandidateOverrides(preferredRegions: string[], timestamp: string) {
  return preferredRegions.map((region, index) => {
    const carbonIntensity =
      region === 'us-west-2'
        ? 180
        : region === 'us-east-1'
          ? 260
          : region === 'eu-west-1'
            ? 210
            : region === 'eu-central-1'
              ? 290
              : region === 'ap-southeast-1'
                ? 340
                : 320
    const waterStressIndex =
      region === 'us-east-1'
        ? 3.2
        : region === 'eu-central-1'
          ? 2.3
          : region === 'ap-southeast-1'
            ? 4.2
            : 2.1
    const fallback =
      region === 'eu-central-1' || region === 'ap-southeast-1'
    const sourceUsed = fallback
      ? `LKG_${region.toUpperCase()}`
      : region.startsWith('us-')
        ? 'WATTTIME_MOER'
        : 'GB_CARBON_INTENSITY_API'

    return {
      region,
      runner: 'ubuntu-latest',
      carbonIntensity,
      carbonConfidence: fallback ? 0.45 : 0.92,
      carbonSourceUsed: sourceUsed,
      carbonFallbackUsed: fallback,
      signalMode: fallback ? ('fallback' as const) : ('marginal' as const),
      accountingMethod: fallback ? ('average' as const) : ('marginal' as const),
      carbonDisagreementFlag: false,
      carbonDisagreementPct: 0,
      waterSignal: {
        region,
        waterIntensityLPerKwh: 1.2,
        waterStressIndex,
        waterQualityIndex: null,
        droughtRiskIndex: null,
        scarcityFactor: waterStressIndex >= 4 ? 2.4 : 1.4,
        source: ['aqueduct', 'aware'],
        datasetVersions: { aqueduct: 'v1', aware: 'v1', wwf: 'v1', nrel: 'v1' },
        confidence: fallback ? 0.6 : 0.9,
        fallbackUsed: fallback,
        dataQuality: fallback ? 'medium' : 'high',
        signalType: 'average_operational',
        referenceTime: timestamp,
        authorityMode: fallback ? 'fallback' : 'basin',
        scenario: 'current',
        facilityId: null,
        supplierSet: ['aqueduct', 'aware'],
        evidenceRefs: ['water:aqueduct:v1'],
        telemetryRef: null,
        artifactGeneratedAt: timestamp,
      },
      waterImpactLiters: Number((1.2 * 1.6).toFixed(6)),
      scarcityImpact: Number(((1.2 * 1.6) * (waterStressIndex >= 4 ? 2.4 : 1.4)).toFixed(6)),
      reliabilityMultiplier: 1 + index * 0.02,
      score: Number((carbonIntensity / (1 + index * 0.02)).toFixed(6)),
      defensiblePenalty: fallback ? 25 : 0,
      defensibleReasonCodes: fallback ? ['LKG_SIGNAL_SAFETY_MARGIN'] : [],
      guardrailCandidateBlocked: waterStressIndex >= 4,
      guardrailReasons: waterStressIndex >= 4 ? ['WATER_GUARDRAIL_HARD_BLOCK'] : [],
      providerSnapshotRef: `${region}:${sourceUsed}:${timestamp}`,
      waterAuthority: {
        authorityMode: fallback ? 'fallback' : 'basin',
        scenario: 'current',
        confidence: fallback ? 0.6 : 0.9,
        supplierSet: ['aqueduct', 'aware'],
        evidenceRefs: ['water:aqueduct:v1'],
        facilityId: null,
        telemetryRef: null,
        bundleHash: 'bundle-hash',
        manifestHash: 'manifest-hash',
      },
      cacheStatus: fallback ? ('fallback' as const) : ('warm' as const),
      providerResolutionMs: fallback ? 2 : 1,
      carbonFreshnessSec: 0,
      waterFreshnessSec: 0,
    }
  })
}

async function main() {
  process.env.DATABASE_URL ??= 'postgresql://bench:bench@127.0.0.1:5432/bench?schema=public'
  process.env.DIRECT_DATABASE_URL ??= process.env.DATABASE_URL
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379'

  const { createDecision, finalizeCiDecisionResponse } = await import('../src/routes/ci')
  const { prisma } = await import('../src/lib/db')
  const { redis } = await import('../src/lib/redis')
  const before = readJson(LATEST_PATH)
  const requests = buildSampleRequests()
  const timestamp = new Date().toISOString()
  const totalMsSamples: number[] = []
  const computeMsSamples: number[] = []

  try {
    console.log(`Running ${SAMPLE_COUNT} hot-path decision samples with resolved candidate overrides...`)
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const request = requests[index % requests.length]
      const totalStarted = performance.now()
      const computeStarted = performance.now()
      const decision = await createDecision(
        {
          ...request,
          requestId: `${request.requestId}-${index}`,
          timestamp,
        },
        {
          decisionFrameId: `bench-frame-${index}`,
          nowIso: timestamp,
          resolvedCandidateOverrides: buildResolvedCandidateOverrides(request.preferredRegions, timestamp),
        }
      )
      const computeMs = performance.now() - computeStarted
      const totalMs = performance.now() - totalStarted
      await finalizeCiDecisionResponse(decision, {
        total: Number(totalMs.toFixed(3)),
        compute: Number(computeMs.toFixed(3)),
      })
      totalMsSamples.push(Number(totalMs.toFixed(3)))
      computeMsSamples.push(Number(computeMs.toFixed(3)))

      if ((index + 1) % 50 === 0) {
        console.log(`  completed ${index + 1}/${SAMPLE_COUNT}`)
      }
    }

    const latest = {
      generatedAt: new Date().toISOString(),
      mode: 'resolved_candidate_overrides',
      samples: SAMPLE_COUNT,
      requestTimestamp: timestamp,
      totals: {
        p50Ms: percentile(totalMsSamples, 50),
        p95Ms: percentile(totalMsSamples, 95),
        p99Ms: percentile(totalMsSamples, 99),
        maxMs: Number(Math.max(...totalMsSamples).toFixed(3)),
      },
      compute: {
        p50Ms: percentile(computeMsSamples, 50),
        p95Ms: percentile(computeMsSamples, 95),
        p99Ms: percentile(computeMsSamples, 99),
        maxMs: Number(Math.max(...computeMsSamples).toFixed(3)),
      },
    }

    const compare = {
      generatedAt: latest.generatedAt,
      before,
      after: latest,
      delta:
        before == null
          ? null
          : {
              totalP95Ms: Number((latest.totals.p95Ms - before.totals.p95Ms).toFixed(3)),
              computeP95Ms: Number((latest.compute.p95Ms - before.compute.p95Ms).toFixed(3)),
            },
    }

    writeJson(LATEST_PATH, latest)
    writeJson(COMPARE_PATH, compare)

    console.log(`Wrote ${LATEST_PATH}`)
    console.log(`Wrote ${COMPARE_PATH}`)
    console.log(
      `p95 total ${latest.totals.p95Ms} ms | p95 compute ${latest.compute.p95Ms} ms`
    )
  } finally {
    await prisma.$disconnect().catch(() => undefined)
    await redis.quit().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('CI latency benchmark failed:', error)
  process.exitCode = 1
})
