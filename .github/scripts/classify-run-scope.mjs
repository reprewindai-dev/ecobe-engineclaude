import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import process from 'node:process'

const DOCS_PREFIXES = ['docs/public/', 'docs/private/design-partner-program/']
const ENGINE_PROOF_PREFIXES = ['ecobe-engine/', '.github/scripts/verify-live-release.mjs']
const DASHBOARD_PROOF_PREFIXES = [
  'ecobe-dashboard/src/app/api/control-surface/',
  'ecobe-dashboard/src/app/api/ecobe/',
  'ecobe-dashboard/src/lib/control-surface/',
  'ecobe-dashboard/src/lib/hooks/control-surface.ts',
  'ecobe-dashboard/src/lib/observability/telemetry.ts',
  'ecobe-dashboard/src/types/control-surface.ts',
  '.github/scripts/verify-live-dashboard.mjs',
]

function runGit(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function resolveRange() {
  const eventName = process.env.GITHUB_EVENT_NAME
  const before = process.env.GITHUB_BEFORE_SHA
  const sha = process.env.GITHUB_SHA
  const baseSha = process.env.GITHUB_BASE_SHA

  if (eventName === 'workflow_dispatch') {
    return { base: null, head: sha }
  }

  if (eventName === 'pull_request' && baseSha && sha) {
    return { base: baseSha, head: sha }
  }

  if (before && sha && !/^0+$/.test(before)) {
    return { base: before, head: sha }
  }

  const head = sha ?? runGit(['rev-parse', 'HEAD'])
  const base = runGit(['rev-parse', `${head}^`])
  return { base, head }
}

function getChangedFiles() {
  const { base, head } = resolveRange()

  if (!base || !head) {
    return []
  }

  const diff = runGit(['diff', '--name-only', base, head])
  return diff
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function main() {
  const outputPath = process.env.GITHUB_OUTPUT
  const eventName = process.env.GITHUB_EVENT_NAME
  const files = getChangedFiles()

  let docsOnly = files.length > 0
  let engineLiveRequired = eventName === 'workflow_dispatch'
  let dashboardLiveRequired = eventName === 'workflow_dispatch'

  for (const file of files) {
    if (!DOCS_PREFIXES.some((prefix) => file.startsWith(prefix))) {
      docsOnly = false
    }

    if (ENGINE_PROOF_PREFIXES.some((prefix) => file.startsWith(prefix))) {
      engineLiveRequired = true
    }

    if (DASHBOARD_PROOF_PREFIXES.some((prefix) => file.startsWith(prefix))) {
      dashboardLiveRequired = true
    }
  }

  const engineSkipReason = docsOnly && !engineLiveRequired ? 'docs-only' : 'no engine-proof inputs changed'
  const dashboardSkipReason =
    docsOnly && !dashboardLiveRequired ? 'docs-only' : 'no dashboard-proof inputs changed'

  const lines = [
    `docs_only=${docsOnly ? 'true' : 'false'}`,
    `engine_live_required=${engineLiveRequired ? 'true' : 'false'}`,
    `dashboard_live_required=${dashboardLiveRequired ? 'true' : 'false'}`,
    `engine_skip_reason=${engineSkipReason}`,
    `dashboard_skip_reason=${dashboardSkipReason}`,
    'changed_files<<EOF',
    ...files,
    'EOF',
  ]

  if (outputPath) {
    appendFileSync(outputPath, `${lines.join('\n')}\n`)
  } else {
    process.stdout.write(
      `${JSON.stringify(
        { docsOnly, engineLiveRequired, dashboardLiveRequired, engineSkipReason, dashboardSkipReason, files },
        null,
        2
      )}\n`
    )
  }
}

main()
