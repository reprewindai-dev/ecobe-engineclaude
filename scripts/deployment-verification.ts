#!/usr/bin/env ts-node

import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

type VerificationStatus = 'PASS' | 'FAIL' | 'WARN'

interface VerificationResult {
  category: string
  status: VerificationStatus
  message: string
}

class DeploymentVerification {
  private results: VerificationResult[] = []
  private readonly engineRoot = process.cwd()
  private readonly workspaceRoot = join(process.cwd(), '..')
  private readonly dashboardRoot = join(this.workspaceRoot, 'ecobe-dashboard')

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
      execSync('npm run build', { cwd: this.dashboardRoot, stdio: 'pipe' })
      execSync('npm run type-check', { cwd: this.dashboardRoot, stdio: 'pipe' })
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
    const workflows = [
      '.github/workflows/ingest-eia.yml',
      '.github/workflows/refresh-forecasts.yml',
      '.github/workflows/verify-signals.yml',
      '.github/workflows/warm-cache.yml',
    ]

    const missing = workflows.filter((workflow) => !existsSync(join(this.engineRoot, workflow)))

    if (missing.length > 0) {
      this.addResult('FAIL', 'Workflows', `Missing workflow files: ${missing.join(', ')}`)
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
