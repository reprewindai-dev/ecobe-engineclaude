import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const repoRoot = process.cwd()
const allowlistPrefixes = [
  'ecobe-engine/',
  'ecobe-dashboard/',
  '.github/',
  'docs/public/',
  'docs/private/design-partner-program/',
]
const allowlistExactPaths = new Set([
  'ecobe-engine/ecobe-engine/src/routes/ci.ts',
  'ecobe-engine/ecobe-engine/src/__tests__/ci-doctrine.test.ts',
  'ecobe-engine/ecobe-engine/src/__tests__/provider-router.test.ts',
  'ecobe-engine/ecobe-engine/src/__tests__/water-policy.test.ts',
])
const blockedPrefixes = [
  'dekes-saas/',
  'demo/',
  'github-action/',
  'WATER/',
  '_land_dekes_main/',
  '_land_engine_main/',
  'ecobe-engine/ecobe-engine/',
  'ecobe-engine/ecobe-dashboard/',
  'ecobe-engine/github-action/',
]
const designPartnerStatuses = [
  'applied',
  'qualified',
  'accepted',
  'onboarding',
  'active',
  'graduating',
  'converted',
  'declined',
  'churned',
]
const designPartnerStages = [
  'fit_confirmed',
  'agreement_sent',
  'agreement_signed',
  'kickoff_scheduled',
  'technical_setup',
  'first_value',
  'active_pilot',
  'graduation_review',
  'converted_paid',
]

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '')
}

function listFiles(startDir) {
  const files = []
  const stack = [startDir]
  while (stack.length > 0) {
    const current = stack.pop()
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') {
        continue
      }
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      files.push(normalizePath(path.relative(repoRoot, fullPath)))
    }
  }
  return files
}

function getChangedEntries() {
  const baseSha = process.env.GITHUB_BASE_SHA?.trim()
  const candidates = []

  const parseNameStatus = (value) =>
    value
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const parts = line.trim().split(/\s+/)
        const status = parts[0]
        const filePath = normalizePath(parts.at(-1) ?? '')
        return filePath ? { status, filePath } : null
      })
      .filter(Boolean)

  if (baseSha) {
    try {
      const diff = execFileSync('git', ['diff', '--name-status', `${baseSha}...HEAD`], {
        cwd: repoRoot,
        encoding: 'utf8',
      })
      candidates.push(...parseNameStatus(diff))
    } catch {
      // fall through
    }
  }

  if (candidates.length === 0) {
    try {
      const staged = execFileSync('git', ['diff', '--cached', '--name-status'], {
        cwd: repoRoot,
        encoding: 'utf8',
      })
      candidates.push(...parseNameStatus(staged))
    } catch {
      // no-op
    }
  }

  if (candidates.length === 0) {
    const porcelain = execFileSync('git', ['status', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    for (const line of porcelain.split(/\r?\n/).filter(Boolean)) {
      const status = line.slice(0, 2).trim() || 'M'
      const filePath = normalizePath(line.slice(3).trim())
      if (filePath) {
        candidates.push({ status, filePath })
      }
    }
  }

  return Array.from(
    new Map(
      candidates
        .map((entry) => ({
          status: String(entry.status ?? '').trim().toUpperCase(),
          filePath: normalizePath(entry.filePath ?? ''),
        }))
        .filter((entry) => entry.filePath)
        .map((entry) => [entry.filePath, entry])
    ).values()
  )
}

function getTrackedGitlinks() {
  try {
    const output = execFileSync('git', ['ls-files', '--stage'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts[0] === '160000')
      .map((parts) => normalizePath(parts.slice(3).join(' ')))
      .filter(Boolean)
  } catch {
    return []
  }
}

function isAllowedPath(filePath) {
  if (allowlistExactPaths.has(filePath)) return true
  if (blockedPrefixes.some((prefix) => filePath.startsWith(prefix))) return false
  return allowlistPrefixes.some((prefix) => filePath.startsWith(prefix))
}

function hasNestedWorkflow(filePath) {
  return /(^|\/)(ecobe-engine|ecobe-dashboard)(\/.*)?\/\.github\/workflows\/.+\.(ya?ml)$/i.test(filePath)
}

function hasLooseArtifact(filePath) {
  if (!/^(ecobe-engine|ecobe-dashboard)\//.test(filePath)) return false
  return /\/live-.*\.(png|json)$/i.test(filePath) || /\/live-qa-report.*\.json$/i.test(filePath)
}

function assertDesignPartnerSchema() {
  const schemaPath = path.join(repoRoot, 'ecobe-engine', 'prisma', 'schema.prisma')
  const migrationPath = path.join(
    repoRoot,
    'ecobe-engine',
    'prisma',
    'migrations',
    '20260330173000_add_design_partner_program',
    'migration.sql'
  )

  const schema = fs.readFileSync(schemaPath, 'utf8')
  const migration = fs.readFileSync(migrationPath, 'utf8')
  const failures = []

  for (const status of designPartnerStatuses) {
    if (!schema.includes(`@map("${status}")`)) failures.push(`schema missing design-partner status ${status}`)
    if (!migration.includes(`'${status}'`)) failures.push(`migration missing design-partner status ${status}`)
  }

  for (const stage of designPartnerStages) {
    if (!schema.includes(`@map("${stage}")`)) failures.push(`schema missing onboarding stage ${stage}`)
    if (!migration.includes(`'${stage}'`)) failures.push(`migration missing onboarding stage ${stage}`)
  }

  if (!schema.includes('@default(DESIGN) @map("partner_type")')) {
    failures.push('schema missing partner_type default DESIGN')
  }
  if (!schema.includes('@default("v1")')) {
    failures.push('schema missing cohort default v1')
  }
  if (!migration.includes(`DEFAULT 'design'`)) {
    failures.push('migration missing partner_type default design')
  }
  if (!migration.includes(`DEFAULT 'v1'`)) {
    failures.push('migration missing cohort default v1')
  }

  return failures
}

const repoFiles = listFiles(repoRoot)
const changedEntries = getChangedEntries()
const failures = []

const canonicalRepoFiles = repoFiles.filter((file) => !blockedPrefixes.some((prefix) => file.startsWith(prefix)))
const trackedGitlinks = getTrackedGitlinks()

const nestedWorkflowFiles = canonicalRepoFiles.filter(hasNestedWorkflow)
if (nestedWorkflowFiles.length > 0) {
  failures.push(`nested workflow directories still exist:\n${nestedWorkflowFiles.map((file) => ` - ${file}`).join('\n')}`)
}

const looseArtifacts = canonicalRepoFiles.filter(hasLooseArtifact)
if (looseArtifacts.length > 0) {
  failures.push(`loose live artifacts still exist in app directories:\n${looseArtifacts.map((file) => ` - ${file}`).join('\n')}`)
}

const disallowedChanged = changedEntries.filter(
  ({ filePath, status }) => status !== 'D' && !isAllowedPath(filePath)
)
if (disallowedChanged.length > 0) {
  failures.push(
    `non-allowlisted files are present in the freeze branch diff:\n${disallowedChanged
      .map(({ status, filePath }) => ` - ${status} ${filePath}`)
      .join('\n')}`
  )
}

const disallowedGitlinks = trackedGitlinks.filter(
  (file) =>
    file.startsWith('.claude/worktrees/') ||
    blockedPrefixes.some((prefix) => file.startsWith(prefix)) ||
    !isAllowedPath(file)
)
if (disallowedGitlinks.length > 0) {
  failures.push(
    `tracked gitlinks or nested worktree artifacts are present:\n${disallowedGitlinks
      .map((file) => ` - ${file}`)
      .join('\n')}`
  )
}

failures.push(...assertDesignPartnerSchema())

if (failures.length > 0) {
  console.error('Canonical freeze scope check failed:\n')
  for (const failure of failures) {
    console.error(failure)
    console.error('')
  }
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checkedAt: new Date().toISOString(),
      changedFiles: changedEntries,
    },
    null,
    2
  )
)
