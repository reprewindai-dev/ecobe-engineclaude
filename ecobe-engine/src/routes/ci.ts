/**
 * CI/CD Carbon-Aware Routing
 *
 * Specialized endpoint for GitHub Actions, GitLab CI, and similar
 * CI/CD systems that need a simple "which runner should I use?"
 * decision backed by real-time grid carbon data.
 *
 * POST /api/v1/ci/carbon-route
 */

import { Router } from 'express'
import { z } from 'zod'
import { routeGreen } from '../lib/green-routing'
import { saveDecisionSnapshot } from '../lib/decision-snapshot'
import { createLease } from '../lib/decision-lease'
import { ingestDecision } from '../lib/decision-ingest'
import { findOptimalWindow } from '../lib/carbon-forecasting'

const router = Router()

// ─── Schema ──────────────────────────────────────────────────────────────────

const runnerSchema = z.object({
  name: z.string(),    // e.g. "ubuntu-latest", "ubuntu-22.04-4core"
  region: z.string(),  // e.g. "US-CAL-CISO", "FR", "DE"
})

const carbonRouteBodySchema = z.object({
  runners: z.array(runnerSchema).min(1),
  workload_type: z.enum(['build', 'test', 'deploy', 'batch']).optional().default('build'),
  max_delay_minutes: z.number().int().min(0).max(1440).optional().default(0),
  carbon_weight: z.number().min(0).max(1).optional().default(0.7),
})

// ─── Endpoints ───────────────────────────────────────────────────────────────

/**
 * POST /api/v1/ci/carbon-route
 *
 * Accepts a list of available CI runners with their mapped regions,
 * returns the recommended runner based on live carbon intensity.
 *
 * Example request:
 * {
 *   "runners": [
 *     { "name": "ubuntu-latest",      "region": "US-CAL-CISO" },
 *     { "name": "ubuntu-latest-eu",   "region": "FR" },
 *     { "name": "ubuntu-latest-de",   "region": "DE" }
 *   ],
 *   "workload_type": "build",
 *   "max_delay_minutes": 0,
 *   "carbon_weight": 0.7
 * }
 *
 * Example response:
 * {
 *   "selected_runner": "ubuntu-latest-eu",
 *   "selected_region": "FR",
 *   "carbon_intensity": 58,
 *   "baseline_intensity": 220,
 *   "savings_pct": 73.6,
 *   "recommendation": "run_now",
 *   "alternatives": [...],
 *   "optimal_window": null
 * }
 */
router.post('/carbon-route', async (req, res) => {
  try {
    const body = carbonRouteBodySchema.parse(req.body)
    const { runners, carbon_weight, max_delay_minutes } = body

    // Deduplicate regions while preserving runner↔region mapping
    const regionToRunner = new Map<string, string>()
    for (const r of runners) {
      if (!regionToRunner.has(r.region)) {
        regionToRunner.set(r.region, r.name)
      }
    }
    const regions = Array.from(regionToRunner.keys())

    const routingResult = await routeGreen({
      preferredRegions: regions,
      carbonWeight: carbon_weight,
      latencyWeight: (1 - carbon_weight) / 2,
      costWeight: (1 - carbon_weight) / 2,
    })

    // Compute baseline intensity = simple average across all candidates
    const allIntensities = [
      routingResult.carbonIntensity,
      ...routingResult.alternatives.map((a) => a.carbonIntensity),
    ]
    const baselineIntensity = allIntensities.reduce((s, v) => s + v, 0) / allIntensities.length
    const savingsPct =
      baselineIntensity > 0
        ? ((baselineIntensity - routingResult.carbonIntensity) / baselineIntensity) * 100
        : 0

    const selectedRunner = regionToRunner.get(routingResult.selectedRegion) ?? runners[0]!.name

    // Wire into integrity system — snapshot, lease, and dashboard savings.
    // All three are fire-and-forget so they never block the CI response.
    const maxCI = Math.max(...allIntensities)
    const baselineRegion =
      routingResult.alternatives.find((a) => a.carbonIntensity === maxCI)?.region ?? regions[0]!

    const ciSignalSnapshot = Object.fromEntries(
      regions.map((r) => [r, {
        intensity: r === routingResult.selectedRegion
          ? routingResult.carbonIntensity
          : (routingResult.alternatives.find((a) => a.region === r)?.carbonIntensity ?? 0),
        source: null,
        fallbackUsed: false,
        disagreementFlag: null,
      }]),
    )

    let ciLeaseFields: import('../lib/decision-lease').LeaseFields | null = null

    if (routingResult.decisionFrameId) {
      void saveDecisionSnapshot({
        decisionFrameId: routingResult.decisionFrameId,
        request: {
          preferredRegions: regions,
          carbonWeight: carbon_weight,
          latencyWeight: (1 - carbon_weight) / 2,
          costWeight: (1 - carbon_weight) / 2,
        },
        result: routingResult,
        signalSnapshot: ciSignalSnapshot,
        source: 'CI',
        workloadType: body.workload_type,
      })

      ciLeaseFields = await createLease(
        routingResult.decisionFrameId,
        undefined,
        routingResult,
        { preferredRegions: regions },
        { source: 'CI', workloadType: body.workload_type },
      ).catch(() => null)

      void ingestDecision({
        decisionFrameId: routingResult.decisionFrameId,
        baselineRegion,
        chosenRegion: routingResult.selectedRegion,
        carbonIntensityBaselineGPerKwh: Math.round(maxCI),
        carbonIntensityChosenGPerKwh: Math.round(routingResult.carbonIntensity),
        workloadName: 'CI',
        meta: { source: 'CI', workload_type: body.workload_type, selected_runner: selectedRunner },
      })
    }

    // Optionally find a better time window if caller allows delay
    let optimalWindow = null
    let recommendation: 'run_now' | 'delay' = 'run_now'

    if (max_delay_minutes > 0) {
      const lookAheadHours = Math.ceil(max_delay_minutes / 60)
      const window = await findOptimalWindow(routingResult.selectedRegion, 1, lookAheadHours)

      // Only recommend delay if savings > 10 % and window isn't immediate
      const delayMs = window.startTime.getTime() - Date.now()
      const windowSavings = window.savings

      if (windowSavings > 10 && delayMs > 5 * 60 * 1000) {
        recommendation = 'delay'
        optimalWindow = {
          start: window.startTime.toISOString(),
          end: window.endTime.toISOString(),
          predicted_intensity: Math.round(window.avgCarbonIntensity),
          savings_pct: Math.round(window.savings * 10) / 10,
          delay_minutes: Math.round(delayMs / 60_000),
        }
      }
    }

    res.json({
      selected_runner: selectedRunner,
      selected_region: routingResult.selectedRegion,
      carbon_intensity: routingResult.carbonIntensity,
      baseline_intensity: Math.round(baselineIntensity),
      savings_pct: Math.round(savingsPct * 10) / 10,
      recommendation,
      optimal_window: optimalWindow,
      workload_type: body.workload_type,
      alternatives: routingResult.alternatives.map((a) => ({
        runner: regionToRunner.get(a.region) ?? a.region,
        region: a.region,
        carbon_intensity: a.carbonIntensity,
        score: Math.round(a.score * 1000) / 1000,
      })),
      timestamp: new Date().toISOString(),
      ...(routingResult.decisionFrameId ? { decision_id: routingResult.decisionFrameId } : {}),
      ...(ciLeaseFields ?? {}),
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('CI carbon-route error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/ci/health
 * Simple liveness check for the CI integration layer.
 */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'CO2 Router CI Integration', timestamp: new Date().toISOString() })
})

export default router
