#!/usr/bin/env ts-node

import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'

type VerificationStatus = 'PASS' | 'FAIL' | 'WARN'

interface VerificationResult {
  category: string
  status: VerificationStatus
  message: string
}

class DeploymentVerification {
  private results: VerificationResult[] = []
  private readonly engineRoot = process.cwd()
  private readonly repoRoot = this.resolveRepoRoot()
  private readonly dashboardRoot = this.resolveDashboardRoot()

  async run() {
    await this.verifyEngineBuild()
    await this.verifyDashboardBuild()
    await this.verifyIntegrationContracts()
    await this.verifyAutomationAssets()
    this.printReport()
  }

  private addResult(status: VerificationStatus, category: string, message: string) {
    this.results.push({ status, category, message })
  }

  private resolveRepoRoot() {
    let current = this.engineRoot
    let githubRoot: string | null = null
    for (let i = 0; i < 6; i += 1) {
      if (existsSync(join(current, 'dekes-saas'))) {
        return current
      }
      if (!githubRoot && existsSync(join(current, '.github'))) {
        githubRoot = current
      }
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
    return githubRoot ?? this.engineRoot
  }

  private resolveDashboardRoot() {
    const repoDashboard = join(this.repoRoot, 'ecobe-dashboard')
    if (existsSync(join(repoDashboard, 'package.json'))) {
      return repoDashboard
    }
    return join(this.engineRoot, 'ecobe-dashboard')
  }

  private async verifyEngineBuild() {
    try {
      execSync('npm run build', { cwd: this.engineRoot, stdio: 'pipe' })
      execSync('npm run type-check', { cwd: this.engineRoot, stdio: 'pipe' })
      this.addResult('PASS', 'Engine Build', 'Engine builds and type-checks cleanly.')
    } catch (error) {
      this.addResult('FAIL', 'Engine Build', `Engine verification failed: ${String(error)}`)
    }
  }

  private async verifyDashboardBuild() {
    try {
      if (!existsSync(join(this.dashboardRoot, 'package.json'))) {
        this.addResult('FAIL', 'Dashboard Build', `Canonical dashboard root not found at ${this.dashboardRoot}`)
        return
      }
      const env = {
        ...process.env,
        TURBOPACK: '0',
        NEXT_TURBOPACK: '0',
        NEXT_PRIVATE_WORKSPACE_ROOT: this.dashboardRoot,
      }
      execSync('npm run build', { cwd: this.dashboardRoot, stdio: 'pipe', env })
      execSync('npm run type-check', { cwd: this.dashboardRoot, stdio: 'pipe', env })
      this.addResult('PASS', 'Dashboard Build', 'Dashboard builds and type-checks cleanly.')
    } catch (error) {
      this.addResult('FAIL', 'Dashboard Build', `Dashboard verification failed: ${String(error)}`)
    }
  }

  private async verifyIntegrationContracts() {
    const dashboardApiPath = join(this.dashboardRoot, 'src', 'lib', 'api.ts')
    const dashboardProxyPath = join(
      this.dashboardRoot,
      'src',
      'app',
      'api',
      'ecobe',
      '[...path]',
      'route.ts'
    )
    const commandCenterRoutePath = join(
      this.dashboardRoot,
      'src',
      'app',
      'api',
      'control-surface',
      'command-center',
      'route.ts'
    )

    if (!existsSync(dashboardApiPath) || !existsSync(dashboardProxyPath) || !existsSync(commandCenterRoutePath)) {
      this.addResult('FAIL', 'Contracts', 'Canonical dashboard integration files are missing.')
      return
    }

    const dashboardApi = readFileSync(dashboardApiPath, 'utf8')
    const dashboardProxy = readFileSync(dashboardProxyPath, 'utf8')
    const commandCenterRoute = readFileSync(commandCenterRoutePath, 'utf8')

    const requiredDashboardEndpoints = [
      '/ci/health',
      '/ci/regions',
      '/ci/decisions',
      'getProviderHealth',
    ]

    const missingDashboardEndpoints = requiredDashboardEndpoints.filter(
      (token) => !dashboardApi.includes(token)
    )

    if (missingDashboardEndpoints.length > 0) {
      this.addResult(
        'FAIL',
        'Contracts',
        `Dashboard API is missing: ${missingDashboardEndpoints.join(', ')}`
      )
      return
    }

    if (!dashboardProxy.includes('/api/v1/') || !commandCenterRoute.includes('getCommandCenterSnapshot')) {
      this.addResult(
        'FAIL',
        'Contracts',
        'Canonical dashboard routing is not targeting the engine proxy/composer correctly.'
      )
      return
    }

    this.addResult('PASS', 'Contracts', 'Engine and canonical dashboard integration contracts are aligned.')
  }

  private async verifyAutomationAssets() {
    const workflowDir = join(this.repoRoot, '.github', 'workflows')
    const workflowSets = [
      ['ingest-eia.yml', 'refresh-forecasts.yml', 'verify-signals.yml', 'warm-cache.yml'],
      ['refresh-water-bundle.yml', 'verify-live-dashboard.yml', 'release-proof.yml', 'ci.yml'],
    ]

    if (!existsSync(workflowDir)) {
      this.addResult('WARN', 'Workflows', 'Workflow directory not found; skipping workflow asset verification.')
      return
    }

    const satisfied = workflowSets.find((set) =>
      set.every((name) => existsSync(join(workflowDir, name)))
    )

    if (!satisfied) {
      const present = workflowSets
        .flat()
        .filter((name, idx, self) => self.indexOf(name) === idx)
        .filter((name) => existsSync(join(workflowDir, name)))
      this.addResult(
        'WARN',
        'Workflows',
        `Workflow set incomplete. Present: ${present.length > 0 ? present.join(', ') : 'none'}.`
      )
      return
    }

    this.addResult('PASS', 'Workflows', 'Scheduled GitHub workflow assets are present.')
  }

  private printReport() {
    const failures = this.results.filter((result) => result.status === 'FAIL')
    const warnings = this.results.filter((result) => result.status === 'WARN')
    const overall: VerificationStatus =
      failures.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS'

    console.log(`Deployment verification: ${overall}`)
    for (const result of this.results) {
      console.log(`[${result.status}] ${result.category}: ${result.message}`)
    }

    if (overall === 'FAIL') {
      process.exit(1)
    }
  }
}

if (require.main === module) {
  const verification = new DeploymentVerification()
  verification.run().catch((error) => {
    console.error(`Deployment verification failed to run: ${String(error)}`)
    process.exit(1)
  })
}
