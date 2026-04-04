import fs from 'fs'
import path from 'path'

function resolveWorkspaceRoot() {
  const cwd = process.cwd()
  const parent = path.resolve(cwd, '..')
  if (fs.existsSync(path.resolve(parent, 'ecobe-dashboard'))) {
    return parent
  }

  const direct = path.resolve(cwd, 'ecobe-dashboard')
  if (fs.existsSync(direct)) {
    return cwd
  }

  return cwd
}

const workspaceRoot = resolveWorkspaceRoot()
const repoRoot = workspaceRoot
const engineUrl = (process.env.ECOBE_ENGINE_URL || process.env.DEFAULT_ECOBE_ENGINE_URL || '').trim().replace(/\/$/, '')
const dashboardUrl = (process.env.DASHBOARD_URL || process.env.DEFAULT_DASHBOARD_URL || '').trim().replace(/\/$/, '')
const outputPath = process.env.CLAIM_CERT_OUTPUT_PATH?.trim()
const registryPath = path.resolve(workspaceRoot, 'ecobe-dashboard', 'src', 'lib', 'claims', 'registry.json')
const publicSearchRoots = [
  path.resolve(repoRoot, 'ecobe-dashboard', 'src', 'app'),
  path.resolve(repoRoot, 'ecobe-dashboard', 'src', 'components'),
  path.resolve(repoRoot, 'ecobe-engine', 'docs', 'public'),
]

if (!engineUrl || !dashboardUrl) {
  console.error('Missing engine or dashboard URL for claim certification.')
  process.exit(1)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function writeResult(result) {
  if (!outputPath) return
  const resolved = path.resolve(repoRoot, outputPath)
  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  fs.writeFileSync(resolved, JSON.stringify(result, null, 2))
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

async function fetchJson(url, init) {
  const response = await fetch(url, init)
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  if (!response.ok) {
    const error = new Error(`${url} returned ${response.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`)
    error.status = response.status
    error.payload = json
    throw error
  }
  return { response, json }
}

function collectFiles(root) {
  if (!fs.existsSync(root)) return []
  const entries = fs.readdirSync(root, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) return collectFiles(target)
    return [target]
  })
}

function findClaimMentions(claimText) {
  const hits = []
  for (const root of publicSearchRoots) {
    const files = collectFiles(root)
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      if (content.includes(claimText)) {
        hits.push(path.relative(repoRoot, file))
      }
    }
  }
  return hits
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

async function main() {
  const registry = readJson(registryPath)
  const [slo, decisions, providerTrust, overview] = await Promise.all([
    fetchJson(`${engineUrl}/api/v1/ci/slo`),
    fetchJson(`${engineUrl}/api/v1/ci/decisions?limit=1`),
    fetchJson(`${engineUrl}/api/v1/dashboard/provider-trust`),
    fetchJson(`${dashboardUrl}/api/control-surface/overview`),
  ])

  const latestDecision = decisions.json?.decisions?.[0]
  assert(latestDecision, 'latest decision feed returned no decisions')
  const responseMetadata = latestDecision?.metadata?.response ?? {}
  const conflictHierarchy = latestDecision?.policyTrace?.conflictHierarchy ?? []
  const wattTime = providerTrust.json?.freshness?.find((item) => item.provider === 'WATTTIME_MOER')
  const prismaSchema = readText(path.resolve(repoRoot, 'ecobe-engine', 'prisma', 'schema.prisma'))
  const envConfig = readText(path.resolve(repoRoot, 'ecobe-engine', 'src', 'config', 'env.ts'))
  const eiaWorker = readText(path.resolve(repoRoot, 'ecobe-engine', 'src', 'workers', 'eia-ingestion.ts'))
  const ciRoute = readText(path.resolve(repoRoot, 'ecobe-engine', 'src', 'routes', 'ci.ts'))
  const modelCount = (prismaSchema.match(/^model\s+/gm) ?? []).length
  const migrationCount = fs.readdirSync(path.resolve(repoRoot, 'ecobe-engine', 'prisma', 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).length

  const actionSet = new Set((overview.json?.actionDistribution ?? []).map((item) => item.action))
  const claimChecks = {
    current_total_budget_live: () =>
      slo.json?.withinBudget?.total === true &&
      Number(slo.json?.budget?.totalP95Ms ?? slo.json?.budgetMs?.totalP95 ?? NaN) === 100,
    current_compute_budget_live: () =>
      slo.json?.withinBudget?.compute === true &&
      Number(slo.json?.budget?.computeP95Ms ?? slo.json?.budgetMs?.computeP95 ?? NaN) === 60 &&
      Number(slo.json?.target?.computeP95Ms ?? NaN) === 58,
    current_confidence_example: () => Number(latestDecision?.signalConfidence ?? 0) >= 0.8,
    current_carbon_example: () =>
      Number.isFinite(Number(latestDecision?.carbonIntensity ?? NaN)) &&
      typeof responseMetadata?.proofEnvelope?.signalLineage?.carbonProvider === 'string',
    current_water_example: () => Number.isFinite(Number(latestDecision?.waterImpactLiters ?? NaN)),
    proof_hash_per_decision: () =>
      /^[a-f0-9]{64}$/i.test(String(latestDecision?.proofHash ?? '')) &&
      /^[a-f0-9]{64}$/i.test(String(overview.json?.liveDecision?.proofHash ?? '')),
    five_binding_actions: () =>
      ['run_now', 'reroute', 'delay', 'throttle', 'deny'].every((action) => actionSet.has(action)),
    policy_order_precedes_carbon: () =>
      JSON.stringify(conflictHierarchy) ===
      JSON.stringify([
        'policy_hard_override',
        'water_guardrail',
        'latency_sla_protection',
        'carbon_optimization_within_allowed_envelope',
        'cost_tie_breaker',
      ]),
    saiq_framework: () =>
      latestDecision?.metadata?.trace?.governanceSource === 'SEKED_INTERNAL_V1' &&
      latestDecision?.policyTrace?.sekedPolicy?.applied === true,
    replay_verified_decisions: () => overview.json?.replay?.deterministicMatch === true,
    kubernetes_admission_bundle: () =>
      Boolean(responseMetadata?.kubernetesEnforcement) &&
      Boolean(responseMetadata?.enforcementBundle?.kubernetes),
    current_watttime_fresh: () =>
      wattTime?.status === 'healthy' &&
      Number.isFinite(Number(wattTime?.freshnessSec ?? NaN)) &&
      Number(wattTime?.freshnessSec) < 60,
    current_prisma_47_14: () => modelCount === 47 && migrationCount === 14,
    eia_930_ingestion: () =>
      envConfig.includes("EIA_INGESTION_SCHEDULE: z.string().default('0 */15 * * * *')") &&
      eiaWorker.includes("async start(schedule: string = '0 */15 * * * *')"),
    billing_non_blocking: () => !/\bstripe\b|\bbilling\b/i.test(ciRoute),
  }

  const report = {
    ok: true,
    checkedAt: new Date().toISOString(),
    engineUrl,
    dashboardUrl,
    evidence: {
      slo: {
        totalP95Ms: slo.json?.p95?.totalMs ?? null,
        computeP95Ms: slo.json?.p95?.computeMs ?? null,
        computeBudgetMs: slo.json?.budget?.computeP95Ms ?? slo.json?.budgetMs?.computeP95 ?? null,
        computeTargetMs: slo.json?.target?.computeP95Ms ?? null,
      },
      latestDecision: {
        decisionFrameId: latestDecision?.decisionFrameId ?? null,
        selectedRegion: latestDecision?.selectedRegion ?? null,
        signalConfidence: latestDecision?.signalConfidence ?? null,
        carbonIntensity: latestDecision?.carbonIntensity ?? null,
        waterImpactLiters: latestDecision?.waterImpactLiters ?? null,
        proofHash: latestDecision?.proofHash ?? null,
      },
      providerTrust: {
        wattTimeFreshnessSec: wattTime?.freshnessSec ?? null,
        wattTimeStatus: wattTime?.status ?? null,
      },
      repo: {
        prismaModelCount: modelCount,
        migrationCount,
      },
    },
    claims: [],
  }

  for (const claim of registry.claims) {
    const mentions = claim.status === 'VERIFY' ? findClaimMentions(claim.claim) : []
    const labelComplete = claim.status !== 'LABEL' || Boolean(claim.requiredQualifier)
    const safeCheck = claim.status === 'SAFE' ? (claimChecks[claim.id]?.() ?? false) : true
    const verifyBlocked = claim.status !== 'VERIFY' || mentions.length === 0
    const ok = safeCheck && verifyBlocked && labelComplete && (claim.status !== 'VERIFY' || claim.allowedSurfaces.length === 0)

    report.claims.push({
      id: claim.id,
      claim: claim.claim,
      status: claim.status,
      ok,
      publishedText:
        claim.status === 'LABEL' && claim.requiredQualifier
          ? `${claim.claim} (${claim.requiredQualifier})`
          : claim.claim,
      evidenceSource: claim.evidenceSource,
      mentions,
    })

    if (!ok) {
      report.ok = false
    }
  }

  writeResult(report)
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) {
    process.exit(1)
  }
}

try {
  await main()
} catch (error) {
  const failure = {
    ok: false,
    checkedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  }
  writeResult(failure)
  console.error(JSON.stringify(failure, null, 2))
  process.exit(1)
}
