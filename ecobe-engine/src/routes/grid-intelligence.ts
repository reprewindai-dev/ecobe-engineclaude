/**
 * Grid Intelligence Routes
 *
 * Exposes the full Electricity Maps signal surface as internal API endpoints.
 * All routes require API key authentication (enforced by the parent middleware in app.ts).
 *
 * Route groups:
 *   GET  /api/v1/grid/snapshot/:zone          → full GridSnapshot (all signals)
 *   GET  /api/v1/grid/mix/:zone               → generation mix
 *   GET  /api/v1/grid/flows/:zone             → electricity flows
 *   GET  /api/v1/grid/netload/:zone           → net load
 *   GET  /api/v1/grid/price/:zone             → day-ahead price
 *   GET  /api/v1/grid/levels/:zone            → high/moderate/low level signals
 *   GET  /api/v1/grid/fossil-spike/:zone      → fossil spike risk assessment
 *   GET  /api/v1/grid/trust/:zone             → zone data trust profile
 *   GET  /api/v1/grid/zones                   → accessible zones
 *   GET  /api/v1/grid/datacenters             → data center → zone mapping
 *   POST /api/v1/grid/optimize/compute        → carbon-aware compute optimizer
 *   POST /api/v1/grid/optimize/charging       → smart charging optimizer
 *   POST /api/v1/grid/compare                 → compare multiple zones
 */

import { Router, Request, Response } from 'express'
import {
  assembleGridSnapshot,
  assembleGridSnapshots,
  findGreenestZone,
  getElectricityMix,
  getElectricityMixForecast,
  getElectricityFlows,
  getElectricityFlowsForecast,
  getNetLoad,
  getNetLoadForecast,
  getDayAheadPrice,
  getDayAheadPriceForecast,
  getZoneLevelSummary,
  isGreenSchedulingWindow,
  evaluateFossilSpikeRisk,
  evaluateFossilSpikeRiskMultiZone,
  getZoneTrustProfile,
  rankZonesByTrust,
  getAccessibleZones,
  getFullAccessZones,
  getDataCenters,
  getZoneForDataCenter,
  optimizeComputeJob,
  optimizeChargingJob,
} from '../lib/electricity-maps'

const router = Router()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function zoneParam(req: Request, res: Response): string | null {
  const zone = req.params.zone?.toUpperCase()
  if (!zone) {
    res.status(400).json({ error: 'zone parameter is required' })
    return null
  }
  return zone
}

function handle<T>(
  res: Response,
  data: T | null,
  notFoundMessage = 'No data available for this zone',
): void {
  if (data === null || data === undefined) {
    res.status(404).json({ error: notFoundMessage })
    return
  }
  res.json({ ok: true, data })
}

// ══════════════════════════════════════════════════════════════════════════════
// GRID SNAPSHOT — primary integration point
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/grid/snapshot/:zone
 * Full normalized GridSnapshot with all configured signals.
 *
 * Query params:
 *   mix=true        include generation mix (default: true)
 *   flows=true      include electricity flows (default: false)
 *   netload=true    include net load (default: false)
 *   fossil=true     include fossil-only carbon intensity (default: false)
 */
router.get('/snapshot/:zone', async (req: Request, res: Response) => {
  const zone = zoneParam(req, res)
  if (!zone) return

  try {
    const snapshot = await assembleGridSnapshot(zone, {
      includeMix: req.query.mix !== 'false',
      includeFlows: req.query.flows === 'true',
      includeNetLoad: req.query.netload === 'true',
      includeFossilCarbon: req.query.fossil === 'true',
    })
    res.json({ ok: true, data: snapshot })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to assemble grid snapshot' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GENERATION MIX
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/grid/mix/:zone
 * Current electricity generation mix.
 *
 * Query params:
 *   forecast=true   return 24h/48h/72h forecast instead
 *   horizonHours=72 forecast horizon (24, 48, 72)
 */
router.get('/mix/:zone', async (req: Request, res: Response) => {
  const zone = zoneParam(req, res)
  if (!zone) return

  try {
    if (req.query.forecast === 'true') {
      const horizonHours = req.query.horizonHours
        ? parseInt(String(req.query.horizonHours), 10)
        : undefined
      const data = await getElectricityMixForecast(zone, horizonHours)
      return handle(res, data.length ? data : null, 'No forecast data for this zone')
    }

    const data = await getElectricityMix(zone)
    handle(res, data)
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to fetch generation mix' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// ELECTRICITY FLOWS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/grid/flows/:zone
 * Current cross-border electricity flows (imports/exports).
 *
 * Query params:
 *   forecast=true   return forecast flows
 *   horizonHours=24
 */
router.get('/flows/:zone', async (req: Request, res: Response) => {
  const zone = zoneParam(req, res)
  if (!zone) return

  try {
    if (req.query.forecast === 'true') {
      const horizonHours = req.query.horizonHours
        ? parseInt(String(req.query.horizonHours), 10)
        : undefined
      const data = await getElectricityFlowsForecast(zone, horizonHours)
      return handle(res, data.length ? data : null, 'No forecast data for this zone')
    }

    const data = await getElectricityFlows(zone)
    handle(res, data)
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to fetch electricity flows' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// NET LOAD
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/grid/netload/:zone
 * Net load = total demand − solar − wind.
 *
 * Query params:
 *   forecast=true   return forecast net load
 *   horizonHours=24
 */
router.get('/netload/:zone', async (req: Request, res: Response) => {
  const zone = zoneParam(req, res)
  if (!zone) return

  try {
    if (req.query.forecast === 'true') {
      const horizonHours = req.query.horizonHours
        ? parseInt(String(req.query.horizonHours), 10)
        : undefined
      const data = await getNetLoadForecast(zone, horizonHours)
      return handle(res, data.length ? data : null, 'No forecast data for this zone')
    }

    const data = await getNetLoad(zone)
    handle(res, data)
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to fetch net load' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// DAY-AHEAD PRICE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/grid/price/:zone
 * Day-ahead electricity price.
 *
 * Query params:
 *   forecast=true   return price forecast
 */
router.get('/price/:zone', async (req: Request, res: Response) => {
  const zone = zoneParam(req, res)
  if (!zone) return

  try {
    if (req.query.forecast === 'true') {
      const data = await getDayAheadPriceForecast(zone)
      return handle(res, data.length ? data : null, 'No price forecast for this zone')
    }

    const data = await getDayAheadPrice(zone)
    handle(res, data)
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to fetch price' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// LEVEL SIGNALS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/grid/levels/:zone
 * High/moderate/low level signals for carbon, renewable, and carbon-free.
 * Also returns composite green/dirty window flags.
 *
 * Quick use: check isGreenWindow to decide whether to run or defer a workload.
 */
router.get('/levels/:zone', async (req: Request, res: Response) => {
  const zone = zoneParam(req, res)
  if (!zone) return

  try {
    const data = await getZoneLevelSummary(zone)
    res.json({ ok: true, data })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to fetch level signals' })
  }
})

/**
 * GET /api/v1/grid/levels/:zone/green
 * Simple boolean: is this zone in a green scheduling window right now?
 */
router.get('/levels/:zone/green', async (req: Request, res: Response) => {
  const zone = zoneParam(req, res)
  if (!zone) return

  try {
    const isGreen = await isGreenSchedulingWindow(zone)
    res.json({ ok: true, zone, isGreenWindow: isGreen })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to check green window' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// FOSSIL SPIKE PREDICTION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/grid/fossil-spike/:zone
 * Evaluate fossil generation spike risk using the 4-signal early-warning system.
 *
 * Returns:
 *   riskLevel      → 'low' | 'moderate' | 'high' | 'critical'
 *   riskScore      → 0–100
 *   leadTimeHours  → estimated hours before spike
 *   recommendation → human-readable action
 */
router.get('/fossil-spike/:zone', async (req: Request, res: Response) => {
  const zone = zoneParam(req, res)
  if (!zone) return

  try {
    const data = await evaluateFossilSpikeRisk(zone)
    res.json({ ok: true, data })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to evaluate fossil spike risk' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// ZONE TRUST SCORING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/grid/trust/:zone
 * Data quality trust profile for a zone.
 *
 * Returns trustScore (0–100), tier (A/B/C), and per-signal coverage.
 */
router.get('/trust/:zone', async (req: Request, res: Response) => {
  const zone = zoneParam(req, res)
  if (!zone) return

  res.json({ ok: true, data: getZoneTrustProfile(zone) })
})

// ══════════════════════════════════════════════════════════════════════════════
// ZONE DISCOVERY
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/grid/zones
 * List zones accessible to the current API token.
 *
 * Query params:
 *   fullAccess=true  only return zones with full endpoint access
 */
router.get('/zones', async (req: Request, res: Response) => {
  try {
    const zones = req.query.fullAccess === 'true'
      ? await getFullAccessZones()
      : await getAccessibleZones()
    res.json({ ok: true, count: zones.length, data: zones })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to fetch zones' })
  }
})

/**
 * GET /api/v1/grid/datacenters
 * List data centers and their Electricity Maps zones.
 *
 * Query params:
 *   provider=gcp|aws|azure
 *   zone=DE
 */
router.get('/datacenters', async (req: Request, res: Response) => {
  try {
    const provider = req.query.provider ? String(req.query.provider) : undefined
    const zone = req.query.zone ? String(req.query.zone).toUpperCase() : undefined
    const data = await getDataCenters({ provider, zone })
    res.json({ ok: true, count: data.length, data })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to fetch data centers' })
  }
})

/**
 * GET /api/v1/grid/datacenters/zone
 * Resolve a cloud provider + region to an Electricity Maps zone key.
 *
 * Query params:
 *   provider=gcp  (required)
 *   region=europe-west1  (required)
 */
router.get('/datacenters/zone', async (req: Request, res: Response) => {
  const provider = req.query.provider ? String(req.query.provider) : null
  const region = req.query.region ? String(req.query.region) : null

  if (!provider || !region) {
    return res.status(400).json({ error: 'provider and region query params are required' })
  }

  try {
    const zoneKey = await getZoneForDataCenter(provider, region)
    if (!zoneKey) {
      return res.status(404).json({ error: `No zone found for ${provider}:${region}` })
    }
    res.json({ ok: true, provider, region, zoneKey })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to resolve datacenter zone' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// OPTIMIZATION ENDPOINTS (Beta)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/grid/optimize/compute
 * Find the optimal time and location to run a compute workload.
 *
 * Body: {
 *   duration: string        ISO8601, e.g. 'PT3H'
 *   startWindow: string     ISO-8601
 *   endWindow: string       ISO-8601
 *   locations: Array<{ dataCenterProvider, dataCenterRegion } | [lon, lat]>
 *   optimizationMetric?: 'flow-traced_carbon_intensity' | 'net_load' | 'flow-traced_renewable_share'
 * }
 */
router.post('/optimize/compute', async (req: Request, res: Response) => {
  const { duration, startWindow, endWindow, locations, optimizationMetric } = req.body

  if (!duration || !startWindow || !endWindow || !Array.isArray(locations) || locations.length === 0) {
    return res.status(400).json({
      error: 'duration, startWindow, endWindow, and locations[] are required',
    })
  }

  try {
    const result = await optimizeComputeJob({
      duration,
      startWindow: new Date(startWindow),
      endWindow: new Date(endWindow),
      locations,
      optimizationMetric,
    })
    handle(res, result, 'Optimizer returned no result')
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Optimizer failed' })
  }
})

/**
 * POST /api/v1/grid/optimize/charging
 * Find the optimal EV charging window.
 *
 * Body: {
 *   duration: string        ISO8601, e.g. 'PT3H'
 *   startWindow: string     ISO-8601
 *   endWindow: string       ISO-8601
 *   locations: Array<[lon, lat]>
 *   powerConsumptionKw?: number
 *   optimizationMetric?: string
 * }
 */
router.post('/optimize/charging', async (req: Request, res: Response) => {
  const { duration, startWindow, endWindow, locations, powerConsumptionKw, optimizationMetric } = req.body

  if (!duration || !startWindow || !endWindow || !Array.isArray(locations) || locations.length === 0) {
    return res.status(400).json({
      error: 'duration, startWindow, endWindow, and locations[] are required',
    })
  }

  try {
    const result = await optimizeChargingJob({
      duration,
      startWindow: new Date(startWindow),
      endWindow: new Date(endWindow),
      locations,
      powerConsumptionKw,
      optimizationMetric,
    })
    handle(res, result, 'Optimizer returned no result')
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Optimizer failed' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// MULTI-ZONE COMPARISON
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/grid/compare
 * Compare multiple zones and return ranked snapshots.
 *
 * Body: {
 *   zones: string[]       list of zone keys
 *   rankBy?: 'carbon' | 'trust' | 'fossil_risk'   default: 'carbon'
 * }
 */
router.post('/compare', async (req: Request, res: Response) => {
  const { zones, rankBy = 'carbon' } = req.body

  if (!Array.isArray(zones) || zones.length === 0) {
    return res.status(400).json({ error: 'zones[] is required' })
  }

  if (zones.length > 20) {
    return res.status(400).json({ error: 'Maximum 20 zones per comparison request' })
  }

  try {
    if (rankBy === 'trust') {
      const ranked = rankZonesByTrust(zones.map((z: string) => z.toUpperCase()))
      return res.json({ ok: true, rankBy, data: ranked })
    }

    if (rankBy === 'fossil_risk') {
      const signals = await evaluateFossilSpikeRiskMultiZone(
        zones.map((z: string) => z.toUpperCase()),
      )
      return res.json({ ok: true, rankBy, data: signals })
    }

    // Default: rank by carbon intensity (lowest first)
    const snapshots = await assembleGridSnapshots(
      zones.map((z: string) => z.toUpperCase()),
    )
    const ranked = [...snapshots].sort(
      (a, b) => (a.carbonIntensity ?? Infinity) - (b.carbonIntensity ?? Infinity),
    )

    const greenest = ranked[0]
      ? { zone: ranked[0].zone, carbonIntensity: ranked[0].carbonIntensity }
      : null

    res.json({ ok: true, rankBy, greenest, count: ranked.length, data: ranked })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Comparison failed' })
  }
})

/**
 * POST /api/v1/grid/greenest
 * Find the greenest zone from a list (lowest carbon intensity).
 *
 * Body: { zones: string[] }
 */
router.post('/greenest', async (req: Request, res: Response) => {
  const { zones } = req.body

  if (!Array.isArray(zones) || zones.length === 0) {
    return res.status(400).json({ error: 'zones[] is required' })
  }

  try {
    const result = await findGreenestZone(zones.map((z: string) => z.toUpperCase()))
    handle(res, result, 'Could not determine greenest zone')
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to find greenest zone' })
  }
})

export default router
