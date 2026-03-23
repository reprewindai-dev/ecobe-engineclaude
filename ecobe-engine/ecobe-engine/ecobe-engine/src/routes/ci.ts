/**
 * Carbon-Aware CI/CD Runner Routing
 * 
 * Provides routing decisions for GitHub Actions and other CI/CD systems
 * to select optimal runners based on real-time carbon intensity
 */

import { Router } from 'express'
import { z } from 'zod'
import { routeGreen } from '../lib/green-routing'
import { prisma } from '../lib/db'

const router = Router()

// GitHub Actions runner mapping by region
const RUNNER_REGIONS = {
  'us-east-1': ['ubuntu-latest', 'windows-latest', 'macos-latest'],
  'us-west-2': ['ubuntu-latest', 'windows-latest'],
  'us-central-1': ['ubuntu-latest'],
  'eu-west-1': ['ubuntu-latest', 'windows-latest'],
  'eu-west-2': ['ubuntu-latest'],
  'eu-central-1': ['ubuntu-latest'],
  'ap-southeast-1': ['ubuntu-latest'],
  'ap-northeast-1': ['ubuntu-latest'],
  'ap-south-1': ['ubuntu-latest']
}

const ciRoutingRequestSchema = z.object({
  preferredRegions: z.array(z.string()).min(1),
  carbonWeight: z.number().min(0).max(1).default(0.7),
  jobType: z.enum(['standard', 'heavy', 'light']).default('standard'),
  timestamp: z.string().optional(),
  metadata: z.record(z.any()).optional()
})

/**
 * POST /api/v1/ci/route
 * Get carbon-aware runner recommendation
 */
router.post('/route', async (req, res) => {
  try {
    const data = ciRoutingRequestSchema.parse(req.body)
    
    console.log(`🌱 CI routing request: regions=${data.preferredRegions.join(',')}, weight=${data.carbonWeight}, type=${data.jobType}`)
    
    // Map job type to routing parameters
    const carbonWeight = data.jobType === 'heavy' ? Math.max(data.carbonWeight, 0.8) :
                       data.jobType === 'light' ? Math.min(data.carbonWeight, 0.5) :
                       data.carbonWeight
    
    // Get routing decision from green routing engine
    const routingResult = await routeGreen({
      preferredRegions: data.preferredRegions,
      carbonWeight,
      // CI workloads are typically latency-sensitive but not critical
      latencyWeight: 0.3,
      costWeight: 0.1
    })
    
    // Select optimal runner for the chosen region
    const selectedRegion = routingResult.selectedRegion
    const availableRunners = RUNNER_REGIONS[selectedRegion as keyof typeof RUNNER_REGIONS] || ['ubuntu-latest']
    const selectedRunner = availableRunners[0] // Prefer Ubuntu for consistency
    
    // Calculate carbon savings vs baseline (using worst-case baseline)
    const baselineCarbon = 500 // gCO2/kWh (worst-case baseline)
    const actualCarbon = routingResult.carbonIntensity
    const savings = Math.max(0, ((baselineCarbon - actualCarbon) / baselineCarbon) * 100)
    
    // Create CI-specific response
    const ciResponse = {
      selectedRunner,
      selectedRegion,
      carbonIntensity: actualCarbon,
      baseline: baselineCarbon,
      savings: Math.round(savings * 10) / 10, // Round to 1 decimal
      recommendation: 'Standard carbon-aware routing applied',
      decisionFrameId: routingResult.decisionFrameId,
      alternatives: routingResult.alternatives?.map(alt => ({
        region: alt.region,
        runner: RUNNER_REGIONS[alt.region as keyof typeof RUNNER_REGIONS]?.[0] || 'ubuntu-latest',
        carbonIntensity: alt.carbonIntensity,
        score: alt.score
      })) || [],
      metadata: {
        jobType: data.jobType,
        carbonWeight,
        routingScore: routingResult.carbon_delta_g_per_kwh,
        confidence: 0.8,
        timestamp: new Date().toISOString()
      }
    }
    
    // Log the decision for audit
    console.log(`🌱 CI routing decision: ${selectedRunner} (${selectedRegion}) - ${actualCarbon} gCO2/kWh (${savings.toFixed(1)}% savings)`)
    
    // Store decision in database for audit/replay
    try {
      await prisma.cIDecision.create({
        data: {
          decisionFrameId: routingResult.decisionFrameId || '',
          selectedRunner,
          selectedRegion,
          carbonIntensity: actualCarbon,
          baseline: baselineCarbon,
          savings,
          jobType: data.jobType,
          preferredRegions: data.preferredRegions,
          carbonWeight,
          recommendation: 'Standard carbon-aware routing applied',
          metadata: ciResponse.metadata,
          createdAt: new Date()
        }
      })
    } catch (dbError) {
      console.warn('Failed to store CI decision in database:', dbError)
      // Continue without failing the request
    }
    
    res.json(ciResponse)
    
  } catch (error) {
    console.error('CI routing error:', error)
    
    // Return fallback response
    res.json({
      selectedRunner: 'ubuntu-latest',
      selectedRegion: 'us-east-1',
      carbonIntensity: 450,
      baseline: 500,
      savings: 10.0,
      recommendation: 'Fallback routing due to error',
      decisionFrameId: `fallback-${Date.now()}`,
      alternatives: [],
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
        fallbackUsed: true,
        timestamp: new Date().toISOString()
      }
    })
  }
})

/**
 * GET /api/v1/ci/health
 * Health check for CI routing service
 */
router.get('/health', async (req, res) => {
  try {
    // Test routing with a simple request
    const testResult = await routeGreen({
      preferredRegions: ['us-east-1'],
      carbonWeight: 0.7
    })
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      regions: Object.keys(RUNNER_REGIONS).length,
      testRouting: {
        success: true,
        carbonIntensity: testResult.carbonIntensity
      }
    })
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

/**
 * GET /api/v1/ci/regions
 * List available runner regions and their runners
 */
router.get('/regions', async (req, res) => {
  res.json({
    regions: Object.entries(RUNNER_REGIONS).map(([region, runners]) => ({
      region,
      runners,
      defaultRunner: runners[0]
    })),
    totalRegions: Object.keys(RUNNER_REGIONS).length
  })
})

/**
 * GET /api/v1/ci/decisions
 * Get recent CI routing decisions (for audit/monitoring)
 */
router.get('/decisions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const decisions = await prisma.cIDecision.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        decisionFrameId: true,
        selectedRunner: true,
        selectedRegion: true,
        carbonIntensity: true,
        savings: true,
        jobType: true,
        createdAt: true
      }
    })
    
    res.json({
      decisions,
      total: decisions.length,
      limit
    })
  } catch (error) {
    console.error('Failed to fetch CI decisions:', error)
    res.status(500).json({
      error: 'Failed to fetch decisions',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

export default router
