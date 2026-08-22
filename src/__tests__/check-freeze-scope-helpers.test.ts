/**
 * Tests for helper functions in .github/scripts/check-freeze-scope.mjs
 *
 * Key changes in this PR:
 * 1. The nested workflow / loose artifact checks now use `canonicalRepoFiles`
 *    (all repo files filtered by blockedPrefixes) instead of `changedFiles`
 *    (only files in the current diff). This means scope checks run against the
 *    entire repository state, not just what changed.
 * 2. `package.json` was removed from `allowlistExactPaths`, meaning top-level
 *    `package.json` changes are now blocked by the freeze scope check.
 *
 * Since the helper functions in check-freeze-scope.mjs are not exported (ESM
 * module-level, not accessible via CJS require), we test the same logic inline
 * by re-implementing the pure functions here. The tests serve as a specification
 * of the required behavior.
 */

// ─── Re-implementations of pure helpers from check-freeze-scope.mjs ─────────
// These functions mirror the implementations in check-freeze-scope.mjs exactly.
// Any change to the originals must be reflected here.

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '')
}

const allowlistPrefixes = [
  'ecobe-engine/',
  'ecobe-dashboard/',
  '.github/',
  'src/',
  'prisma/',
  'scripts/',
  'data/',
  'docs/public/',
  'docs/private/design-partner-program/',
]

const allowlistExactPaths = new Set([
  'Dockerfile',
  'railway.json',
  'start.sh',
  // NOTE: 'package.json' was removed from this set in this PR
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

function isAllowedPath(filePath: string): boolean {
  if (blockedPrefixes.some((prefix) => filePath.startsWith(prefix))) return false
  if (allowlistExactPaths.has(filePath)) return true
  return allowlistPrefixes.some((prefix) => filePath.startsWith(prefix))
}

function hasNestedWorkflow(filePath: string): boolean {
  return /(^|\/)(ecobe-engine|ecobe-dashboard)(\/.*)?\/\.github\/workflows\/.+\.(ya?ml)$/i.test(
    filePath
  )
}

function hasLooseArtifact(filePath: string): boolean {
  if (!/^(ecobe-engine|ecobe-dashboard)\//.test(filePath)) return false
  return (
    /\/live-.*\.(png|json)$/i.test(filePath) ||
    /\/live-qa-report.*\.json$/i.test(filePath)
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('normalizePath', () => {
  it('replaces backslashes with forward slashes', () => {
    expect(normalizePath('ecobe-engine\\src\\foo.ts')).toBe('ecobe-engine/src/foo.ts')
  })

  it('strips leading ./ prefix', () => {
    expect(normalizePath('./src/server.ts')).toBe('src/server.ts')
  })

  it('does not double-strip', () => {
    expect(normalizePath('src/server.ts')).toBe('src/server.ts')
  })

  it('handles paths without changes', () => {
    expect(normalizePath('Dockerfile')).toBe('Dockerfile')
  })
})

describe('isAllowedPath', () => {
  describe('allowlisted prefixes', () => {
    it('allows files under ecobe-engine/', () => {
      expect(isAllowedPath('ecobe-engine/src/server.ts')).toBe(true)
    })

    it('allows files under ecobe-dashboard/', () => {
      expect(isAllowedPath('ecobe-dashboard/src/app/page.tsx')).toBe(true)
    })

    it('allows files under .github/', () => {
      expect(isAllowedPath('.github/workflows/ci.yml')).toBe(true)
    })

    it('allows files under src/', () => {
      expect(isAllowedPath('src/server.ts')).toBe(true)
    })

    it('allows files under prisma/', () => {
      expect(isAllowedPath('prisma/schema.prisma')).toBe(true)
    })

    it('allows files under scripts/', () => {
      expect(isAllowedPath('scripts/verify-canonical-root.cjs')).toBe(true)
    })

    it('allows files under data/', () => {
      expect(isAllowedPath('data/water-bundle.json')).toBe(true)
    })

    it('allows files under docs/public/', () => {
      expect(isAllowedPath('docs/public/api-reference.md')).toBe(true)
    })

    it('allows files under docs/private/design-partner-program/', () => {
      expect(isAllowedPath('docs/private/design-partner-program/overview.md')).toBe(true)
    })
  })

  describe('allowlisted exact paths', () => {
    it('allows Dockerfile', () => {
      expect(isAllowedPath('Dockerfile')).toBe(true)
    })

    it('allows railway.json', () => {
      expect(isAllowedPath('railway.json')).toBe(true)
    })

    it('allows start.sh', () => {
      expect(isAllowedPath('start.sh')).toBe(true)
    })
  })

  describe('package.json removed from allowlist (PR change)', () => {
    it('rejects top-level package.json (removed from allowlist in this PR)', () => {
      expect(isAllowedPath('package.json')).toBe(false)
    })

    it('still allows package.json under ecobe-engine/ (prefix match)', () => {
      expect(isAllowedPath('ecobe-engine/package.json')).toBe(true)
    })

    it('still allows package-lock.json under root (wait - it is not in allowlist)', () => {
      // package-lock.json at root is NOT in the allowlist exact paths and not under any prefix
      expect(isAllowedPath('package-lock.json')).toBe(false)
    })
  })

  describe('blocked prefixes take precedence over allowlist', () => {
    it('rejects files under dekes-saas/', () => {
      expect(isAllowedPath('dekes-saas/src/index.ts')).toBe(false)
    })

    it('rejects files under demo/', () => {
      expect(isAllowedPath('demo/example.ts')).toBe(false)
    })

    it('rejects files under github-action/', () => {
      expect(isAllowedPath('github-action/index.ts')).toBe(false)
    })

    it('rejects files under WATER/', () => {
      expect(isAllowedPath('WATER/data.json')).toBe(false)
    })

    it('rejects files under _land_dekes_main/', () => {
      expect(isAllowedPath('_land_dekes_main/README.md')).toBe(false)
    })

    it('rejects files under _land_engine_main/', () => {
      expect(isAllowedPath('_land_engine_main/config.json')).toBe(false)
    })

    it('rejects nested ecobe-engine/ecobe-engine/ path', () => {
      expect(isAllowedPath('ecobe-engine/ecobe-engine/src/server.ts')).toBe(false)
    })

    it('rejects nested ecobe-engine/ecobe-dashboard/ path', () => {
      expect(isAllowedPath('ecobe-engine/ecobe-dashboard/src/app/page.tsx')).toBe(false)
    })

    it('rejects nested ecobe-engine/github-action/ path', () => {
      expect(isAllowedPath('ecobe-engine/github-action/index.ts')).toBe(false)
    })
  })

  describe('disallowed paths', () => {
    it('rejects README.md at root', () => {
      expect(isAllowedPath('README.md')).toBe(false)
    })

    it('rejects tsconfig.json at root', () => {
      // Not in allowlist despite .github/ scripts referencing tsconfig*.json
      expect(isAllowedPath('tsconfig.json')).toBe(false)
    })

    it('rejects .env files at root', () => {
      expect(isAllowedPath('.env')).toBe(false)
    })

    it('rejects docs/private/ files outside design-partner-program', () => {
      expect(isAllowedPath('docs/private/internal-notes.md')).toBe(false)
    })

    it('does not allow partial prefix match (docs/pub is not docs/public/)', () => {
      expect(isAllowedPath('docs/pub/something.md')).toBe(false)
    })
  })
})

describe('hasNestedWorkflow', () => {
  describe('detects nested GitHub Actions workflow files', () => {
    it('detects nested workflow in ecobe-engine/.github/workflows/', () => {
      expect(
        hasNestedWorkflow('ecobe-engine/.github/workflows/ci.yml')
      ).toBe(true)
    })

    it('detects nested workflow in ecobe-dashboard/.github/workflows/', () => {
      expect(
        hasNestedWorkflow('ecobe-dashboard/.github/workflows/deploy.yaml')
      ).toBe(true)
    })

    it('detects deeply nested workflow in ecobe-engine/sub/.github/workflows/', () => {
      expect(
        hasNestedWorkflow('ecobe-engine/sub/dir/.github/workflows/ci.yml')
      ).toBe(true)
    })

    it('detects .yaml extension (not just .yml)', () => {
      expect(
        hasNestedWorkflow('ecobe-engine/.github/workflows/ci.yaml')
      ).toBe(true)
    })
  })

  describe('does not flag non-workflow files', () => {
    it('does not flag root .github/workflows/ (expected location)', () => {
      expect(hasNestedWorkflow('.github/workflows/ci.yml')).toBe(false)
    })

    it('does not flag non-workflow yaml under ecobe-engine/', () => {
      expect(hasNestedWorkflow('ecobe-engine/.github/CODEOWNERS')).toBe(false)
    })

    it('does not flag .ts files', () => {
      expect(hasNestedWorkflow('ecobe-engine/src/server.ts')).toBe(false)
    })

    it('does not flag workflow files in other directories (not ecobe-engine or ecobe-dashboard)', () => {
      expect(hasNestedWorkflow('src/.github/workflows/ci.yml')).toBe(false)
    })

    it('does not flag a .yml file that is not in .github/workflows/', () => {
      expect(hasNestedWorkflow('ecobe-engine/.github/dependabot.yml')).toBe(false)
    })
  })
})

describe('hasLooseArtifact', () => {
  describe('detects live artifacts in app directories', () => {
    it('detects live-*.png in ecobe-engine/', () => {
      expect(hasLooseArtifact('ecobe-engine/screenshots/live-dashboard.png')).toBe(true)
    })

    it('detects live-*.json in ecobe-engine/', () => {
      expect(hasLooseArtifact('ecobe-engine/artifacts/live-report.json')).toBe(true)
    })

    it('detects live-*.png in ecobe-dashboard/', () => {
      expect(hasLooseArtifact('ecobe-dashboard/public/live-preview.png')).toBe(true)
    })

    it('detects live-*.json in ecobe-dashboard/', () => {
      expect(hasLooseArtifact('ecobe-dashboard/data/live-data.json')).toBe(true)
    })

    it('detects live-qa-report*.json in ecobe-engine/', () => {
      expect(hasLooseArtifact('ecobe-engine/qa/live-qa-report-2026.json')).toBe(true)
    })

    it('detects live-qa-report*.json in ecobe-dashboard/', () => {
      expect(hasLooseArtifact('ecobe-dashboard/qa/live-qa-report.json')).toBe(true)
    })
  })

  describe('does not flag non-artifact files', () => {
    it('does not flag regular .json in ecobe-engine/', () => {
      expect(hasLooseArtifact('ecobe-engine/package.json')).toBe(false)
    })

    it('does not flag regular .ts files', () => {
      expect(hasLooseArtifact('ecobe-engine/src/server.ts')).toBe(false)
    })

    it('does not flag live-*.png outside of app directories', () => {
      expect(hasLooseArtifact('data/live-artifact.png')).toBe(false)
    })

    it('does not flag live-*.json at root', () => {
      expect(hasLooseArtifact('live-data.json')).toBe(false)
    })

    it('does not flag files in src/ even with live- prefix', () => {
      expect(hasLooseArtifact('src/live-data.json')).toBe(false)
    })

    it('does not flag .jpg files (only png/json)', () => {
      expect(hasLooseArtifact('ecobe-engine/screenshots/live-preview.jpg')).toBe(false)
    })
  })
})

describe('canonicalRepoFiles vs changedFiles — behavior change', () => {
  /**
   * The key behavior change in this PR:
   * Before: nestedWorkflowFiles and looseArtifacts were filtered from `changedFiles`
   *         (only files in the current PR diff, status !== 'D')
   * After:  nestedWorkflowFiles and looseArtifacts are filtered from `canonicalRepoFiles`
   *         (all repo files, excluding blocked prefixes)
   *
   * This means that pre-existing violations in the repo (not just newly added files)
   * will now cause the freeze scope check to fail.
   */

  it('blockedPrefixes filtering correctly excludes blocked directories', () => {
    const allFiles = [
      'src/server.ts',
      'ecobe-engine/src/main.ts',
      'dekes-saas/index.ts',         // blocked
      '_land_dekes_main/config.json', // blocked
      'demo/example.ts',              // blocked
    ]

    const canonicalFiles = allFiles.filter(
      (file) => !blockedPrefixes.some((prefix) => file.startsWith(prefix))
    )

    expect(canonicalFiles).toEqual(['src/server.ts', 'ecobe-engine/src/main.ts'])
    expect(canonicalFiles).not.toContain('dekes-saas/index.ts')
    expect(canonicalFiles).not.toContain('_land_dekes_main/config.json')
    expect(canonicalFiles).not.toContain('demo/example.ts')
  })

  it('checking canonical repo files catches pre-existing nested workflow violations', () => {
    // Simulate: a nested workflow file exists in the repo but is NOT in the current diff
    const canonicalRepoFiles = [
      'src/server.ts',
      'ecobe-engine/.github/workflows/nested-ci.yml', // violation!
      '.github/workflows/ci.yml', // valid
    ]

    const violations = canonicalRepoFiles.filter(hasNestedWorkflow)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toBe('ecobe-engine/.github/workflows/nested-ci.yml')
  })

  it('checking canonical repo files catches pre-existing loose artifact violations', () => {
    // Simulate: a loose artifact exists in the repo but is NOT in the current diff
    const canonicalRepoFiles = [
      'src/server.ts',
      'ecobe-engine/screenshots/live-preview.png', // violation!
      'ecobe-engine/package.json', // fine
    ]

    const violations = canonicalRepoFiles.filter(hasLooseArtifact)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toBe('ecobe-engine/screenshots/live-preview.png')
  })

  it('clean canonical repo files produce no violations', () => {
    const canonicalRepoFiles = [
      'src/server.ts',
      'src/config/env.ts',
      'ecobe-engine/src/main.ts',
      'ecobe-dashboard/src/app/page.tsx',
      '.github/workflows/ci.yml',
      'Dockerfile',
      'prisma/schema.prisma',
    ]

    const nestedWorkflowViolations = canonicalRepoFiles.filter(hasNestedWorkflow)
    const looseArtifactViolations = canonicalRepoFiles.filter(hasLooseArtifact)

    expect(nestedWorkflowViolations).toHaveLength(0)
    expect(looseArtifactViolations).toHaveLength(0)
  })
})

describe('disallowedChanged — isAllowedPath used for changed entries', () => {
  /**
   * The check for disallowedChanged still uses changedEntries (unchanged).
   * Only the canonical artifact/workflow checks moved to canonicalRepoFiles.
   */
  it('deleted files (status D) are not flagged regardless of path', () => {
    const changedEntries = [
      { status: 'D', filePath: 'dekes-saas/index.ts' },
      { status: 'D', filePath: 'demo/example.ts' },
    ]

    const disallowed = changedEntries.filter(
      ({ filePath, status }) => status !== 'D' && !isAllowedPath(filePath)
    )

    expect(disallowed).toHaveLength(0)
  })

  it('non-deleted files with blocked paths are flagged', () => {
    const changedEntries = [
      { status: 'M', filePath: 'dekes-saas/index.ts' },
      { status: 'A', filePath: 'src/server.ts' },
    ]

    const disallowed = changedEntries.filter(
      ({ filePath, status }) => status !== 'D' && !isAllowedPath(filePath)
    )

    expect(disallowed).toHaveLength(1)
    expect(disallowed[0].filePath).toBe('dekes-saas/index.ts')
  })

  it('package.json modification is now flagged (no longer in allowlist)', () => {
    const changedEntries = [{ status: 'M', filePath: 'package.json' }]

    const disallowed = changedEntries.filter(
      ({ filePath, status }) => status !== 'D' && !isAllowedPath(filePath)
    )

    expect(disallowed).toHaveLength(1)
    expect(disallowed[0].filePath).toBe('package.json')
  })

  it('Dockerfile modification is still allowed (remains in allowlist)', () => {
    const changedEntries = [{ status: 'M', filePath: 'Dockerfile' }]

    const disallowed = changedEntries.filter(
      ({ filePath, status }) => status !== 'D' && !isAllowedPath(filePath)
    )

    expect(disallowed).toHaveLength(0)
  })
})