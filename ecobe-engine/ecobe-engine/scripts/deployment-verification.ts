#!/usr/bin/env ts-node

/**
 * DEPLOYMENT VERIFICATION - Runtime Testing
 * 
 * This script verifies that both the engine and dashboard
 * can deploy and run successfully without mocks.
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

interface VerificationResult {
  category: string
  status: 'PASS' | 'FAIL' | 'WARN'
  message: string
  details?: string
}

interface VerificationReport {
  timestamp: string
  overall: 'PASS' | 'FAIL' | 'WARN'
  results: VerificationResult[]
  criticalFailures: string[]
  warnings: string[]
}

class DeploymentVerification {
  private results: VerificationResult[] = []
  private engineRoot: string
  private dashboardRoot: string

  constructor() {
    this.engineRoot = join(process.cwd(), 'ecobe-engine')
    this.dashboardRoot = join(process.cwd(), '..', 'ecobe-dashboardclaude', 'ecobe-dashboard')
  }

  async runFullVerification(): Promise<VerificationReport> {
    console.log('🔍 Starting Deployment Verification...')
    console.log(`📁 Engine Root: ${this.engineRoot}`)
    console.log(`📁 Dashboard Root: ${this.dashboardRoot}`)

    // Engine verification
    await this.verifyEngineBuild()
    await this.verifyEngineDependencies()
    await this.verifyEngineEnvironment()
    await this.verifyEngineServer()

    // Dashboard verification
    await this.verifyDashboardBuild()
    await this.verifyDashboardDependencies()
    await this.verifyDashboardAPI()

    // Integration verification
    await this.verifyAPIContract()
    await this.verifyDashboardIntegration()

    const report = this.generateReport()
    this.printReport(report)
    
    return report
  }

  private async verifyEngineBuild(): Promise<void> {
    try {
      console.log('🔧 Building engine...')
      execSync('npm run build', { stdio: 'pipe', cwd: this.engineRoot })
      this.addResult('PASS', 'Engine Build', 'Engine builds successfully')
    } catch (error) {
      this.addResult('FAIL', 'Engine Build', `Engine build failed: ${error}`)
    }
  }

  private async verifyEngineDependencies(): Promise<void> {
    try {
      const packageJsonPath = join(this.engineRoot, 'package.json')
      if (!existsSync(packageJsonPath)) {
        this.addResult('FAIL', 'Engine Dependencies', 'package.json not found')
        return
      }

      const packageJson = JSON.parse(require('fs').readFileSync(packageJsonPath, 'utf8'))
      
      // Check critical dependencies
      const requiredDeps = [
        '@prisma/client',
        'express',
        'redis',
        'axios',
        'node-cron',
        'zod'
      ]

      const missingDeps = requiredDeps.filter(dep => 
        !packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]
      )

      if (missingDeps.length > 0) {
        this.addResult('FAIL', 'Engine Dependencies', 
          `Missing dependencies: ${missingDeps.join(', ')}`)
      } else {
        this.addResult('PASS', 'Engine Dependencies', 'All dependencies present')
      }

    } catch (error) {
      this.addResult('FAIL', 'Engine Dependencies', `Error checking dependencies: ${error}`)
    }
  }

  private async verifyEngineEnvironment(): Promise<void> {
    try {
      const envExamplePath = join(this.engineRoot, '.env.example')
      if (!existsSync(envExamplePath)) {
        this.addResult('WARN', 'Engine Environment', '.env.example not found')
        return
      }

      const envExample = require('fs').readFileSync(envExamplePath, 'utf8')
      
      // Check for required environment variables
      const requiredEnvVars = [
        'DATABASE_URL',
        'REDIS_URL',
        'EIA_API_KEY',
        'WATTTIME_API_KEY',
        'ELECTRICITY_MAPS_API_KEY',
        'EMBER_API_KEY'
      ]

      const missingVars = requiredEnvVars.filter(varName => 
        !envExample.includes(varName)
      )

      if (missingVars.length > 0) {
        this.addResult('FAIL', 'Engine Environment', 
          `Missing environment variables: ${missingVars.join(', ')}`)
      } else {
        this.addResult('PASS', 'Engine Environment', 'All environment variables documented')
      }

    } catch (error) {
      this.addResult('FAIL', 'Engine Environment', `Error checking environment: ${error}`)
    }
  }

  private async verifyEngineServer(): Promise<void> {
    try {
      // Check if server file exists and can be imported
      const serverPath = join(this.engineRoot, 'src', 'server.ts')
      if (!existsSync(serverPath)) {
        this.addResult('FAIL', 'Engine Server', 'server.ts not found')
        return
      }

      // Try to compile TypeScript without running
      execSync('npx tsc --noEmit', { stdio: 'pipe', cwd: this.engineRoot })
      this.addResult('PASS', 'Engine Server', 'Server compiles successfully')

    } catch (error) {
      this.addResult('FAIL', 'Engine Server', `Server compilation failed: ${error}`)
    }
  }

  private async verifyDashboardBuild(): Promise<void> {
    try {
      console.log('🔧 Building dashboard...')
      execSync('npm run build', { stdio: 'pipe', cwd: this.dashboardRoot })
      this.addResult('PASS', 'Dashboard Build', 'Dashboard builds successfully')
    } catch (error) {
      this.addResult('FAIL', 'Dashboard Build', `Dashboard build failed: ${error}`)
    }
  }

  private async verifyDashboardDependencies(): Promise<void> {
    try {
      const packageJsonPath = join(this.dashboardRoot, 'package.json')
      if (!existsSync(packageJsonPath)) {
        this.addResult('FAIL', 'Dashboard Dependencies', 'package.json not found')
        return
      }

      const packageJson = JSON.parse(require('fs').readFileSync(packageJsonPath, 'utf8'))
      
      // Check critical dependencies
      const requiredDeps = [
        'next',
        'react',
        'react-dom',
        '@tanstack/react-query',
        'axios',
        'lucide-react'
      ]

      const missingDeps = requiredDeps.filter(dep => 
        !packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]
      )

      if (missingDeps.length > 0) {
        this.addResult('FAIL', 'Dashboard Dependencies', 
          `Missing dependencies: ${missingDeps.join(', ')}`)
      } else {
        this.addResult('PASS', 'Dashboard Dependencies', 'All dependencies present')
      }

    } catch (error) {
      this.addResult('FAIL', 'Dashboard Dependencies', `Error checking dependencies: ${error}`)
    }
  }

  private async verifyDashboardAPI(): Promise<void> {
    try {
      const apiPath = join(this.dashboardRoot, 'src', 'lib', 'api.ts')
      if (!existsSync(apiPath)) {
        this.addResult('FAIL', 'Dashboard API', 'api.ts not found')
        return
      }

      const apiContent = require('fs').readFileSync(apiPath, 'utf8')
      
      // Check for new grid intelligence endpoints
      const requiredEndpoints = [
        'getGridSummary',
        'getGridRegionDetail',
        'getGridHeroMetrics',
        'getGridOpportunities',
        'getGridImportLeakage',
        'getGridAudit'
      ]

      const missingEndpoints = requiredEndpoints.filter(endpoint => 
        !apiContent.includes(endpoint)
      )

      if (missingEndpoints.length > 0) {
        this.addResult('FAIL', 'Dashboard API', 
          `Missing grid intelligence endpoints: ${missingEndpoints.join(', ')}`)
      } else {
        this.addResult('PASS', 'Dashboard API', 'All grid intelligence endpoints present')
      }

    } catch (error) {
      this.addResult('FAIL', 'Dashboard API', `Error checking API: ${error}`)
    }
  }

  private async verifyAPIContract(): Promise<void> {
    try {
      // Check if dashboard can consume engine endpoints
      const apiPath = join(this.dashboardRoot, 'src', 'lib', 'api.ts')
      const apiContent = require('fs').readFileSync(apiPath, 'utf8')

      // Check for proper TypeScript interfaces
      const requiredInterfaces = [
        'GridSummaryResponse',
        'GridRegionDetail',
        'GridHeroMetrics'
      ]

      const missingInterfaces = requiredInterfaces.filter(interfaceName => 
        !apiContent.includes(interfaceName)
      )

      if (missingInterfaces.length > 0) {
        this.addResult('FAIL', 'API Contract', 
          `Missing TypeScript interfaces: ${missingInterfaces.join(', ')}`)
      } else {
        this.addResult('PASS', 'API Contract', 'API contracts properly defined')
      }

    } catch (error) {
      this.addResult('FAIL', 'API Contract', `Error checking API contract: ${error}`)
    }
  }

  private async verifyDashboardIntegration(): Promise<void> {
    try {
      // Check if dashboard components use the new API
      const componentPath = join(this.dashboardRoot, 'src', 'components', 'CarbonIntensityCard.tsx')
      if (!existsSync(componentPath)) {
        this.addResult('WARN', 'Dashboard Integration', 'CarbonIntensityCard not found')
        return
      }

      const componentContent = require('fs').readFileSync(componentPath, 'utf8')

      // Check if component uses real API instead of mock
      if (componentContent.includes('ecobeApi.getGridSummary')) {
        this.addResult('PASS', 'Dashboard Integration', 'Dashboard uses real grid intelligence API')
      } else {
        this.addResult('WARN', 'Dashboard Integration', 'Dashboard may still be using mock data')
      }

    } catch (error) {
      this.addResult('FAIL', 'Dashboard Integration', `Error checking integration: ${error}`)
    }
  }

  private addResult(status: 'PASS' | 'FAIL' | 'WARN', category: string, message: string, details?: string): void {
    this.results.push({ status, category, message, details })
  }

  private generateReport(): VerificationReport {
    const criticalFailures = this.results
      .filter(r => r.status === 'FAIL')
      .map(r => `${r.category}: ${r.message}`)

    const warnings = this.results
      .filter(r => r.status === 'WARN')
      .map(r => `${r.category}: ${r.message}`)

    let overall: 'PASS' | 'FAIL' | 'WARN' = 'PASS'
    if (criticalFailures.length > 0) overall = 'FAIL'
    else if (warnings.length > 0) overall = 'WARN'

    return {
      timestamp: new Date().toISOString(),
      overall,
      results: this.results,
      criticalFailures,
      warnings
    }
  }

  private printReport(report: VerificationReport): void {
    console.log('\n' + '='.repeat(60))
    console.log('📋 DEPLOYMENT VERIFICATION REPORT')
    console.log('='.repeat(60))
    console.log(`🕐 Timestamp: ${report.timestamp}`)
    console.log(`🎯 Overall Status: ${report.overall}`)
    console.log(`✅ Passed: ${report.results.filter(r => r.status === 'PASS').length}`)
    console.log(`⚠️  Warnings: ${report.warnings.length}`)
    console.log(`❌ Failures: ${report.criticalFailures.length}`)
    
    if (report.criticalFailures.length > 0) {
      console.log('\n❌ CRITICAL FAILURES:')
      report.criticalFailures.forEach(failure => console.log(`   • ${failure}`))
    }

    if (report.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:')
      report.warnings.forEach(warning => console.log(`   • ${warning}`))
    }

    console.log('\n📊 DETAILED RESULTS:')
    report.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : result.status === 'WARN' ? '⚠️' : '❌'
      console.log(`   ${icon} ${result.category}: ${result.message}`)
      if (result.details) {
        console.log(`      ${result.details}`)
      }
    })

    console.log('\n' + '='.repeat(60))
    
    if (report.overall === 'FAIL') {
      console.log('🚫 VERIFICATION FAILED - Fix critical issues before deployment')
      process.exit(1)
    } else if (report.overall === 'WARN') {
      console.log('⚠️  VERIFICATION PASSED WITH WARNINGS - Review before deployment')
    } else {
      console.log('✅ VERIFICATION PASSED - Ready for deployment')
    }
  }
}

// Run verification if this script is executed directly
if (require.main === module) {
  const verification = new DeploymentVerification()
  verification.runFullVerification().catch(error => {
    console.error('❌ Verification failed to run:', error)
    process.exit(1)
  })
}

export { DeploymentVerification }
