/**
 * Intelligence Routes — Temporal Carbon Pattern API
 *
 * Exposes the learned hourly carbon patterns that differentiate CO₂ Router
 * from reactive schedulers (including Google's Carbon-Aware SDK).
 *
 * Endpoints:
 *
 *   GET  /api/v1/intelligence/scorecards
 *     All region reliability scorecards — forecast accuracy, fallback rate,
 *     provider disagreement, reliability tier.
 *
 *   GET  /api/v1/intelligence/patterns?region=FR,SE,DE
 *     168-slot hourly heatmap (Mon 00:00 – Sun 23:00 UTC) for each region.
 *     Suitable for rendering a carbon heat calendar in the dashboard.
 *
 *   POST /api/v1/intelligence/predict-opportunity
 *     Given a region + optional future time window, returns an opportunity
 *     score: how likely is this region to be cleaner than its own average
 *     during that window, based on 90 days of historical patterns.
 *
 *   POST /api/v1/intelligence/best-window
 *     Given a region + workload duration, returns the best upcoming time
 *     window (within lookAheadHours) when the region is historically cleanest.
 *
 *   POST /api/v1/intelligence/refresh-patterns
 *     Triggers an on-demand pattern recompute for a set of regions.
 *     Idempotent — safe to call repeatedly.
 */

import { Router } from 'express'
import { z } from 'zod'
import {
  getAllScorecards,
  getTemporalPatterns,
  predictOpportunityScore,
  getBestWindowForRegion,
  computeTemporalPatterns,
} from '../lib/carbon-intelligence'
import { logger } from '../lib/logger'
import {
  getOrFetchGridSignal,
  assembleGridSignalSnapshot,
  assembleGridSignalSnapshots,
  getCachedGridSignal,
  ingestAllRegions,
  getAllSupportedRegions,
} from '../lib/grid-signals'

const router = Router()

// ─── GET /scorecards ──────────────────────────────────────────────────────────

/**
 * All region reliability scorecards.
 * Shows forecast accuracy, fallback rate, provider disagreement per region.
 * The data that proves your routing is smarter than raw signal-following.
 */
router.get('/scorecards', async (_req, res) => {
  try {
    const scorecards = await getAllScorecards()
    return res.json({ scorecards, count: (scorecards as unknown[]).length })
  } catch (error) {
    logger.error({ err: error }, 'Intelligence scorecards error')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── GET /patterns ────────────────────────────────────────────────────────────

const patternsQuerySchema = z.object({
  region: z.string().min(1).transform((v) => v.split(',').map((r) => r.trim()).filter(Boolean)),
})

/**
 * 168-slot (Mon 00:00 – Sun 23:00 UTC) hourly carbon heatmap per region.
 *
 * Each slot contains avg / p10 / p50 / p90 / stddev — enough to render
 * a full carbon calendar showing when each region is historically cleanest.
 *
 * Query param:
 *   region  comma-separated region codes, e.g. FR,SE,DE-AT-LU  (required)
 */
router.get('/patterns', async (req, res) => {
  try {
    const parsed = patternsQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'region query param required', details: parsed.error.errors })
    }

    const { region: regions } = parsed.data

    const results = await Promise.all(
      regions.map(async (region) => {
        const slots = await getTemporalPatterns(region)
        return { region, slots, slotCount: slots.length }
      }),
    )

    return res.json({ patterns: results })
  } catch (error) {
    logger.error({ err: error }, 'Intelligence patterns error')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── POST /predict-opportunity ────────────────────────────────────────────────

const predictOpportunitySchema = z.object({
  region: z.string().min(1),
  // Optionally provide a target UTC hour (0–23) and day (0=Mon…6=Sun)
  // If omitted, defaults to current hour-of-week + 1h
  targetHourOfWeek: z.number().int().min(0).max(167).optional(),
  durationHours:    z.number().int().min(1).max(72).default(4),
})

/**
 * Predict the carbon opportunity score for a future time window.
 *
 * Returns a score (0–1) and expected intensity statistics based on 90 days
 * of learned historical patterns — not just the current live reading.
 *
 * This is the core intelligence primitive:
 *   "What is the probability that FR will be meaningfully cleaner
 *    than its weekly average during the next 4 hours?"
 *
 * Body:
 *   region            region code (e.g. "FR")
 *   targetHourOfWeek  0–167, 0=Mon 00:00 UTC (optional, defaults to now+1h)
 *   durationHours     window length (default 4)
 */
router.post('/predict-opportunity', async (req, res) => {
  try {
    const body = predictOpportunitySchema.parse(req.body)

    // Default to current hour-of-week + 1h if not specified
    const nowHow = (() => {
      const d = new Date()
      return ((d.getUTCDay() + 6) % 7) * 24 + d.getUTCHours()
    })()
    const fromHourOfWeek = body.targetHourOfWeek ?? (nowHow + 1) % 168

    const prediction = await predictOpportunityScore(body.region, fromHourOfWeek, body.durationHours)

    return res.json(prediction)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    logger.error({ err: error }, 'Intelligence predict-opportunity error')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── POST /best-window ────────────────────────────────────────────────────────

const bestWindowSchema = z.object({
  region:          z.string().min(1),
  durationHours:   z.number().int().min(1).max(72).default(4),
  lookAheadHours:  z.number().int().min(1).max(168).default(48),
})

/**
 * Find the best upcoming time window when a region is historically cleanest.
 *
 * Unlike GET /forecasting/:region/optimal-window (which uses forecast data),
 * this endpoint uses pure historical patterns — no live API call needed.
 * It answers: "When should I schedule this 4-hour workload in the next 48 hours
 * to run during FR's historically cleanest period?"
 *
 * Body:
 *   region           region code
 *   durationHours    workload duration (default 4)
 *   lookAheadHours   how far ahead to search (default 48, max 168)
 */
router.post('/best-window', async (req, res) => {
  try {
    const body = bestWindowSchema.parse(req.body)

    const window = await getBestWindowForRegion(body.region, body.durationHours, body.lookAheadHours)

    if (!window) {
      return res.status(404).json({
        error: 'Insufficient pattern data for region',
        region: body.region,
        hint:   'Call POST /api/v1/intelligence/refresh-patterns to build patterns from historical data.',
      })
    }

    return res.json(window)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    logger.error({ err: error }, 'Intelligence best-window error')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── POST /refresh-patterns ───────────────────────────────────────────────────

const refreshPatternsSchema = z.object({
  regions: z.array(z.string().min(1)).min(1).max(50),
})

/**
 * On-demand pattern recompute for a set of regions.
 * Idempotent — safe to call repeatedly.
 *
 * Typically called:
 *   - nightly via a cron job
 *   - after bulk historical data import
 *   - from the dashboard when "Refresh Patterns" is clicked
 *
 * Body:
 *   regions  array of region codes to refresh
 */
router.post('/refresh-patterns', async (req, res) => {
  try {
    const { regions } = refreshPatternsSchema.parse(req.body)

    const results = await Promise.all(
      regions.map(async (region) => {
        const upserted = await computeTemporalPatterns(region).catch(() => -1)
        return { region, upserted, ok: upserted >= 0 }
      }),
    )

    const succeeded = results.filter((r) => r.ok).length
    const failed    = results.filter((r) => !r.ok).length

    return res.json({
      refreshed: succeeded,
      failed,
      results,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    logger.error({ err: error }, 'Intelligence refresh-patterns error')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── Grid Signal Intelligence endpoints (/grid/*) ─────────────────────────────
//
// These endpoints expose the EIA-930 + WattTime + Electricity Maps enrichment
// layer. All data is READ-ONLY enrichment — never routing truth.
//
// Endpoints:
//   GET  /api/v1/intelligence/grid/hero-metrics    → multi-region key metrics
//   GET  /api/v1/intelligence/grid/summary         → cached snapshot for all US BAs
//   GET  /api/v1/intelligence/grid/opportunities   → regions with curtailment or clean windows
//   GET  /api/v1/intelligence/grid/region/:region  → full snapshot for one region
//   POST /api/v1/intelligence/grid/refresh         → trigger on-demand ingest for all regions

// ─── GET /grid/region/:region ────────────────────────────────────────────────

/**
 * Full GridSignalSnapshot for a single ECOBE region.
 * Returns cached data if available (5-min TTL), otherwise triggers a live fetch.
 *
 * Includes: demand/load, fuel mix, ramp direction, carbonSpikeProbability,
 * curtailmentProbability, importCarbonLeakageScore, data provenance.
 */
router.get('/grid/region/:region', async (req, res) => {
  const { region } = req.params
  try {
    const snapshot = await getOrFetchGridSignal(region, () =>
      assembleGridSignalSnapshot(region),
    )

    if (!snapshot) {
      return res.status(404).json({
        error: 'No grid signal data available for this region',
        region,
        hint: 'Region must be a mapped EIA-930 US balancing authority (e.g. US-MIDA-PJM, US-CAL-CISO)',
      })
    }

    return res.json(snapshot)
  } catch (err) {
    logger.error({ err, region }, '[intelligence] grid/region error')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── GET /grid/hero-metrics ───────────────────────────────────────────────────

const heroMetricsSchema = z.object({
  regions: z.string().optional().transform((v) =>
    v ? v.split(',').map((r) => r.trim()).filter(Boolean) : getAllSupportedRegions(),
  ),
})

/**
 * Key metrics across multiple regions — suitable for a live dashboard hero section.
 *
 * Returns for each region:
 *   - carbonSpikeProbability, curtailmentProbability, importCarbonLeakageScore
 *   - loadRampDirection + loadRampStrength
 *   - renewableRatio, fossilRatio
 *   - signalQuality, estimatedFlag, timestamp
 *
 * Query params:
 *   regions  comma-separated list (default: all supported US regions)
 */
router.get('/grid/hero-metrics', async (req, res) => {
  try {
    const { regions } = heroMetricsSchema.parse(req.query)

    const snapshots = await Promise.all(
      regions.map(async (region) => {
        const snap = await getCachedGridSignal(region)
        return { region, snapshot: snap }
      }),
    )

    const metrics = snapshots.map(({ region, snapshot }) => ({
      region,
      available: snapshot != null,
      timestamp: snapshot?.timestamp ?? null,
      signalQuality: snapshot?.signalQuality ?? null,
      loadRampDirection: snapshot?.loadRampDirection ?? null,
      loadRampStrength: snapshot?.loadRampStrength ?? null,
      renewableRatio: snapshot?.renewableRatio ?? null,
      fossilRatio: snapshot?.fossilRatio ?? null,
      carbonSpikeProbability: snapshot?.carbonSpikeProbability ?? null,
      curtailmentProbability: snapshot?.curtailmentProbability ?? null,
      importCarbonLeakageScore: snapshot?.importCarbonLeakageScore ?? null,
      estimatedFlag: snapshot?.estimatedFlag ?? null,
      syntheticFlag: snapshot?.syntheticFlag ?? null,
    }))

    return res.json({
      metrics,
      count: metrics.length,
      availableCount: metrics.filter((m) => m.available).length,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    logger.error({ err }, '[intelligence] grid/hero-metrics error')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── GET /grid/summary ────────────────────────────────────────────────────────

/**
 * Cached snapshot summary for all supported US regions.
 * Cache-only — no live fetches. Returns what is currently warm in Redis.
 * Use GET /grid/region/:region or POST /grid/refresh for live data.
 */
router.get('/grid/summary', async (_req, res) => {
  try {
    const regions = getAllSupportedRegions()
    const snapshots = await Promise.all(
      regions.map(async (region) => ({
        region,
        snapshot: await getCachedGridSignal(region),
      })),
    )

    const available = snapshots.filter((s) => s.snapshot != null)
    const missing = snapshots.filter((s) => s.snapshot == null).map((s) => s.region)

    return res.json({
      snapshots: available.map(({ region, snapshot }) => ({ region, ...snapshot })),
      availableCount: available.length,
      totalRegions: regions.length,
      missingRegions: missing,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    logger.error({ err }, '[intelligence] grid/summary error')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── GET /grid/opportunities ──────────────────────────────────────────────────

/**
 * Identify regions with favourable scheduling opportunities from cached signals.
 *
 * Returns regions where:
 *   - curtailmentProbability > 0.4 (cheap clean power window)
 *   - carbonSpikeProbability < 0.3 (low risk of fossil ramp)
 *   - renewableRatio > 0.6 (dominant clean supply)
 *
 * Only returns regions with cached data.
 * Sort: curtailmentProbability desc (most favourable first).
 */
router.get('/grid/opportunities', async (_req, res) => {
  try {
    const regions = getAllSupportedRegions()
    const snapshots = await Promise.all(
      regions.map((r) => getCachedGridSignal(r)),
    )

    const opportunities = snapshots
      .filter((s): s is NonNullable<typeof s> => s != null)
      .filter((s) =>
        (s.curtailmentProbability != null && s.curtailmentProbability > 0.4) ||
        (s.renewableRatio != null && s.renewableRatio > 0.6 &&
          (s.carbonSpikeProbability == null || s.carbonSpikeProbability < 0.3)),
      )
      .sort((a, b) => (b.curtailmentProbability ?? 0) - (a.curtailmentProbability ?? 0))
      .map((s) => ({
        region: s.region,
        balancingAuthority: s.balancingAuthority,
        timestamp: s.timestamp,
        renewableRatio: s.renewableRatio,
        curtailmentProbability: s.curtailmentProbability,
        carbonSpikeProbability: s.carbonSpikeProbability,
        loadRampDirection: s.loadRampDirection,
        signalQuality: s.signalQuality,
        recommendation: s.curtailmentProbability != null && s.curtailmentProbability > 0.4
          ? 'Curtailment likely — run flexible workloads now for lowest carbon impact'
          : 'Clean window — high renewable ratio, low fossil pressure',
      }))

    return res.json({
      opportunities,
      count: opportunities.length,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    logger.error({ err }, '[intelligence] grid/opportunities error')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── POST /grid/refresh ───────────────────────────────────────────────────────

/**
 * Trigger on-demand ingest for all mapped US regions.
 * Fetches live EIA-930 data and updates the Redis cache.
 *
 * Use when you need fresh data immediately (e.g., before a scheduling decision).
 * Normal operation: the background poller keeps the cache warm automatically.
 */
router.post('/grid/refresh', async (_req, res) => {
  try {
    const results = await ingestAllRegions()
    const succeeded = results.filter((r) => !r.error).length
    const failed = results.filter((r) => r.error).length

    return res.json({
      refreshed: succeeded,
      failed,
      results: results.map((r) => ({
        region: r.region,
        ba: r.balancingAuthority,
        ok: !r.error,
        timestamp: r.timestamp,
        error: r.error ?? undefined,
      })),
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    logger.error({ err }, '[intelligence] grid/refresh error')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
