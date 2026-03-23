import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db'
import { InterchangeParser } from '../lib/grid-signals/interchange-parser'
import { GridFeatureEngine } from '../lib/grid-signals/grid-feature-engine'
import { env } from '../config/env'
import { getEIAWorker } from '../workers/eia-ingestion'

const router = Router()

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

function authenticateAdminKey(req: Request, res: Response, next: Function) {
  const apiKey = req.headers['x-api-key'] as string
  const headerAuth = req.headers['authorization'] as string

  const expectedKey = env.ECOBE_INTERNAL_API_KEY || env.ECOBE_ENGINE_API_KEY

  if (!expectedKey) {
    return res.status(500).json({ error: 'Admin API key not configured' })
  }

  // Check Bearer token or X-API-Key header
  const token = headerAuth?.startsWith('Bearer ') ? headerAuth.slice('Bearer '.length) : apiKey

  if (!token || token !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' })
  }

  next()
}

// Apply auth middleware to all routes in this router
router.use(authenticateAdminKey)

// ============================================================================
// REQUEST / RESPONSE SCHEMAS
// ============================================================================

const InterchangeRecordSchema = z.object({
  period: z.string(), // ISO timestamp or period identifier
  fromBa: z.string(), // From balancing authority
  fromBaName: z.string().optional(),
  toBa: z.string(), // To balancing authority
  toBaName: z.string().optional(),
  type: z.string().optional(),
  value: z.number(), // MWh of interchange flow
  valueUnits: z.string().optional()
})

const ImportEiaCsvBodySchema = z.object({
  data: z.array(InterchangeRecordSchema).min(1),
  region: z.string().optional(), // Region/zone context
  balancingAuthority: z.string().optional()
})

const ImportResponseSchema = z.object({
  success: z.boolean(),
  rawRecordsStored: z.number(),
  snapshotsProcessed: z.number(),
  snapshotsStored: z.number(),
  timestamp: z.string(),
  details: z.object({
    regionsProcessed: z.array(z.string()),
    errors: z.array(z.string()).optional()
  })
})

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/admin/import-eia-csv
 * Import EIA-930 INTERCHANGE CSV data into the database
 *
 * Request body:
 * {
 *   "data": [
 *     {
 *       "period": "2026-01-15T12:00:00Z",
 *       "fromBa": "PJM",
 *       "fromBaName": "PJM Interconnection",
 *       "toBa": "MISO",
 *       "toBaName": "Midwest ISO",
 *       "type": "ACTUAL",
 *       "value": 1500,
 *       "valueUnits": "MWh"
 *     }
 *   ],
 *   "region": "EASTERN",
 *   "balancingAuthority": "PJM"
 * }
 */
router.post('/import-eia-csv', async (req: Request, res: Response) => {
  try {
    const validation = ImportEiaCsvBodySchema.safeParse(req.body)

    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: validation.error.errors
      })
    }

    const { data: records, region, balancingAuthority } = validation.data
    const errors: string[] = []
    let rawRecordsStored = 0
    let snapshotsProcessed = 0
    let snapshotsStored = 0
    const regionsProcessed = new Set<string>()

    // 1. Store raw EIA-930 interchange records in database
    for (const record of records) {
      try {
        await prisma.eia930InterchangeRaw.create({
          data: {
            period: record.period,
            fromBa: record.fromBa,
            fromBaName: record.fromBaName || record.fromBa,
            toBa: record.toBa,
            toBaName: record.toBaName || record.toBa,
            type: record.type || 'ACTUAL',
            value: record.value,
            valueUnits: record.valueUnits || 'MWh',
            region: region || 'UNKNOWN',
            balancingAuthority: balancingAuthority || null
          }
        })
        rawRecordsStored++
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        errors.push(`Failed to store record ${record.period} (${record.fromBa}->${record.toBa}): ${errMsg}`)
        console.warn(errMsg)
      }
    }

    // 2. Process records through InterchangeParser to create snapshots
    const targetRegion = region || balancingAuthority || 'UNKNOWN'

    // Restructure records to match EIAInterchangeData interface
    const eiaFormatRecords: any[] = records.map(r => ({
      period: r.period,
      'from-ba': r.fromBa,
      'from-ba-name': r.fromBaName || r.fromBa,
      'to-ba': r.toBa,
      'to-ba-name': r.toBaName || r.toBa,
      type: r.type || 'ACTUAL',
      value: r.value
    }))

    // Parse into snapshots
    const snapshots = InterchangeParser.parseInterchangeData(
      eiaFormatRecords,
      targetRegion,
      balancingAuthority || null
    )

    snapshotsProcessed = snapshots.length

    // 3. Run GridFeatureEngine on snapshots to derive intelligence
    let enhancedSnapshots: any[]
    try {
      const withFeatures = GridFeatureEngine.updateSnapshotsWithFeatures(snapshots)
      enhancedSnapshots = GridFeatureEngine.updateSignalQuality(withFeatures)
      for (const s of enhancedSnapshots) {
        regionsProcessed.add(s.region)
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      errors.push(`Failed to derive intelligence: ${errMsg}`)
      console.warn(errMsg)
      enhancedSnapshots = snapshots
      for (const s of snapshots) {
        regionsProcessed.add(s.region)
      }
    }

    // 4. Store snapshots in GridSignalSnapshot table
    for (const snapshot of enhancedSnapshots) {
      try {
        const timestamp = typeof snapshot.timestamp === 'string'
          ? new Date(snapshot.timestamp)
          : snapshot.timestamp

        await prisma.gridSignalSnapshot.upsert({
          where: {
            region_timestamp_source: {
              region: snapshot.region,
              timestamp,
              source: snapshot.source || 'eia930'
            }
          },
          update: {
            demandMwh: snapshot.demandMwh,
            demandChangeMwh: snapshot.demandChangeMwh,
            demandChangePct: snapshot.demandChangePct,
            netGenerationMwh: snapshot.netGenerationMwh,
            netInterchangeMwh: snapshot.netInterchangeMwh,
            renewableRatio: snapshot.renewableRatio,
            fossilRatio: snapshot.fossilRatio,
            carbonSpikeProbability: snapshot.carbonSpikeProbability,
            curtailmentProbability: snapshot.curtailmentProbability,
            importCarbonLeakageScore: snapshot.importCarbonLeakageScore,
            signalQuality: snapshot.signalQuality || 'MEDIUM',
            estimatedFlag: snapshot.estimatedFlag || false,
            syntheticFlag: snapshot.syntheticFlag || false,
            metadata: snapshot.metadata || {}
          },
          create: {
            region: snapshot.region,
            balancingAuthority: snapshot.balancingAuthority || null,
            timestamp,
            demandMwh: snapshot.demandMwh,
            demandChangeMwh: snapshot.demandChangeMwh,
            demandChangePct: snapshot.demandChangePct,
            netGenerationMwh: snapshot.netGenerationMwh,
            netInterchangeMwh: snapshot.netInterchangeMwh,
            renewableRatio: snapshot.renewableRatio,
            fossilRatio: snapshot.fossilRatio,
            carbonSpikeProbability: snapshot.carbonSpikeProbability,
            curtailmentProbability: snapshot.curtailmentProbability,
            importCarbonLeakageScore: snapshot.importCarbonLeakageScore,
            signalQuality: snapshot.signalQuality || 'MEDIUM',
            estimatedFlag: snapshot.estimatedFlag || false,
            syntheticFlag: snapshot.syntheticFlag || false,
            source: snapshot.source || 'eia930',
            metadata: snapshot.metadata || {}
          }
        })
        snapshotsStored++
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        errors.push(`Failed to store snapshot ${snapshot.timestamp}: ${errMsg}`)
        console.warn(errMsg)
      }
    }

    const response = {
      success: errors.length === 0,
      rawRecordsStored,
      snapshotsProcessed,
      snapshotsStored,
      timestamp: new Date().toISOString(),
      details: {
        regionsProcessed: Array.from(regionsProcessed),
        errors: errors.length > 0 ? errors : undefined
      }
    }

    const validated = ImportResponseSchema.parse(response)
    return res.status(200).json(validated)

  } catch (error) {
    console.error('EIA import error:', error)
    return res.status(500).json({
      error: 'Failed to import EIA-930 data',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

/**
 * POST /api/v1/admin/trigger-ingestion
 * Manually trigger the EIA-930 ingestion worker
 * This endpoint initiates a background task to fetch and process latest EIA-930 data
 *
 * Request body (optional):
 * {
 *   "regions": ["PJM", "ERCOT", "CAISO"],
 *   "lookBackHours": 24,
 *   "triggerGridFeatureEngine": true
 * }
 */
router.post('/trigger-ingestion', async (req: Request, res: Response) => {
  try {
    const worker = getEIAWorker()

    if (!worker) {
      return res.status(503).json({
        error: 'EIA ingestion worker is not running',
        note: 'Set ENGINE_BACKGROUND_WORKERS_ENABLED=true to enable the worker'
      })
    }

    const eventId = `ingestion-${Date.now()}`

    // Log the trigger event
    try {
      await prisma.integrationEvent.create({
        data: {
          source: 'EIA_IMPORT_TRIGGER',
          success: true,
          message: JSON.stringify({
            eventId,
            requestedAt: new Date().toISOString(),
            workerStatus: worker.getStatus()
          })
        }
      })
    } catch (err) {
      console.warn('Failed to log ingestion trigger event:', err)
    }

    // Actually trigger the worker (fire and forget)
    worker.start().catch((err: any) => {
      console.error('Manual ingestion trigger failed:', err)
    })

    return res.status(202).json({
      success: true,
      message: 'EIA-930 ingestion triggered',
      eventId,
      workerStatus: worker.getStatus(),
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Trigger ingestion error:', error)
    return res.status(500).json({
      error: 'Failed to trigger ingestion',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

/**
 * GET /api/v1/admin/ingestion-status
 * Check status of recent EIA-930 ingestion events
 *
 * Query parameters:
 * - ?limit=10 (default: 10)
 * - ?hours=24 (default: 24)
 */
router.get('/ingestion-status', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100)
    const hours = parseInt(req.query.hours as string) || 24

    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)

    const events = await prisma.integrationEvent.findMany({
      where: {
        source: 'EIA_IMPORT_TRIGGER',
        createdAt: { gte: startTime }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    })

    const parsed = events.map((e: any) => {
      try {
        return {
          eventId: e.id,
          createdAt: e.createdAt.toISOString(),
          success: e.success,
          payload: typeof e.message === 'string' ? JSON.parse(e.message) : e.message
        }
      } catch {
        return {
          eventId: e.id,
          createdAt: e.createdAt.toISOString(),
          success: e.success,
          payload: e.message
        }
      }
    })

    return res.json({
      timestamp: new Date().toISOString(),
      timeRange: {
        start: startTime.toISOString(),
        end: new Date().toISOString()
      },
      totalEvents: parsed.length,
      events: parsed
    })

  } catch (error) {
    console.error('Ingestion status error:', error)
    return res.status(500).json({
      error: 'Failed to fetch ingestion status',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

export default router
