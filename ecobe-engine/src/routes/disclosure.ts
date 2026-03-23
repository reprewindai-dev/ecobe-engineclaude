import { Router } from 'express'
import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '../lib/db'
import {
  inferSignalType,
  POLICY_MODES,
  STANDARDS_MAPPING,
  type PolicyMode,
  type RoutingMode,
  type SignalType,
} from '../lib/methodology'

const router = Router()

const exportQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(['json', 'csv']).default('json'),
  mode: z.enum(['assurance', 'optimize', 'all']).default('assurance'),
  policyMode: z.enum(['default', 'sec_disclosure_strict', 'eu_24x7_ready']).optional(),
})

const batchesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

type ExportDecision = {
  id: string
  createdAt: Date
  workloadName: string | null
  opName: string | null
  baselineRegion: string
  chosenRegion: string
  carbonIntensityBaselineGPerKwh: number | null
  carbonIntensityChosenGPerKwh: number | null
  estimatedKwh: number | null
  co2BaselineG: number | null
  co2ChosenG: number | null
  fallbackUsed: boolean
  dataFreshnessSeconds: number | null
  sourceUsed: string | null
  validationSource: string | null
  referenceTime: Date | null
  disagreementFlag: boolean | null
  disagreementPct: number | null
  meta: Record<string, any>
}

type DisclosureRecord = {
  timestamp: string
  workload_name: string | null
  operation: string | null
  decision_id: string
  decision_frame_id: string | null
  region: string
  baseline_region: string
  estimated_kwh: number | null
  emissions_gco2: number | null
  intensity_gco2_per_kwh: number | null
  signal_type: SignalType
  source: string | null
  validation_source: string | null
  mode: RoutingMode
  policy_mode: PolicyMode
  assurance_mode: boolean
  quality_tier: string | null
  confidence_label: string | null
  fallback_used: boolean
  disagreement_flag: boolean
  disagreement_pct: number | null
  reference_time: string | null
  data_freshness_seconds: number | null
  location_based_scope2_gco2: number | null
  market_based_scope2_gco2: number | null
}

function resolveWindow(from?: string, to?: string) {
  const end = to ? new Date(to) : new Date()
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
  return { start, end }
}

function toDisclosureRecord(decision: ExportDecision): DisclosureRecord {
  const mode = (decision.meta?.mode ?? 'optimize') as RoutingMode
  const policyMode = (decision.meta?.policyMode ?? 'default') as PolicyMode
  const signalType = (decision.meta?.signalTypeUsed ?? inferSignalType(decision.sourceUsed)) as SignalType
  const assurance = decision.meta?.assurance as
    | { enabled?: boolean; confidenceLabel?: string }
    | undefined

  return {
    timestamp: decision.createdAt.toISOString(),
    workload_name: decision.workloadName,
    operation: decision.opName,
    decision_id: decision.id,
    decision_frame_id: decision.meta?.decisionFrameId ?? null,
    region: decision.chosenRegion,
    baseline_region: decision.baselineRegion,
    estimated_kwh: decision.estimatedKwh,
    emissions_gco2: decision.co2ChosenG,
    intensity_gco2_per_kwh: decision.carbonIntensityChosenGPerKwh,
    signal_type: signalType,
    source: decision.sourceUsed,
    validation_source: decision.validationSource,
    mode,
    policy_mode: policyMode,
    assurance_mode: assurance?.enabled ?? mode === 'assurance',
    quality_tier: decision.meta?.qualityTier ?? null,
    confidence_label: assurance?.confidenceLabel ?? decision.meta?.confidenceLabel ?? null,
    fallback_used: decision.fallbackUsed,
    disagreement_flag: decision.disagreementFlag ?? false,
    disagreement_pct: decision.disagreementPct ?? null,
    reference_time: decision.referenceTime?.toISOString() ?? null,
    data_freshness_seconds: decision.dataFreshnessSeconds,
    location_based_scope2_gco2: decision.co2ChosenG,
    market_based_scope2_gco2: null,
  }
}

function persistExportBatch(batchId: string, hash: string, generatedAt: string, recordCount: number, format: 'json' | 'csv', start: Date, end: Date, mode: string, policyMode?: PolicyMode) {
  return prisma.emissionLog.create({
    data: {
      organizationId: null,
      workloadRequestId: batchId,
      emissionCO2: 0,
      offsetCO2: 0,
      region: 'GLOBAL',
      source: 'DISCLOSURE_EXPORT_BATCH',
      timestamp: new Date(generatedAt),
      metadata: {
        kind: 'disclosure_export_batch',
        batchId,
        hash,
        generatedAt,
        recordCount,
        format,
        mode,
        policyMode: policyMode ?? null,
        from: start.toISOString(),
        to: end.toISOString(),
      },
    },
  })
}

router.get('/export', async (req, res) => {
  try {
    const { from, to, format, mode, policyMode } = exportQuerySchema.parse(req.query)
    const { start, end } = resolveWindow(from, to)

    const decisions = (await prisma.dashboardRoutingDecision.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        workloadName: true,
        opName: true,
        baselineRegion: true,
        chosenRegion: true,
        carbonIntensityBaselineGPerKwh: true,
        carbonIntensityChosenGPerKwh: true,
        estimatedKwh: true,
        co2BaselineG: true,
        co2ChosenG: true,
        fallbackUsed: true,
        dataFreshnessSeconds: true,
        sourceUsed: true,
        validationSource: true,
        referenceTime: true,
        disagreementFlag: true,
        disagreementPct: true,
        meta: true,
      },
    })) as ExportDecision[]

    const filtered = decisions.filter((decision) => {
      const decisionMode = (decision.meta?.mode ?? 'optimize') as RoutingMode
      const decisionPolicyMode = (decision.meta?.policyMode ?? 'default') as PolicyMode

      if (mode !== 'all' && decisionMode !== mode) return false
      if (policyMode && decisionPolicyMode !== policyMode) return false
      return true
    })

    const records = filtered.map(toDisclosureRecord)
    const generatedAt = new Date().toISOString()
    const batchId = `disclosure_${randomUUID()}`

    if (format === 'json') {
      const payload = {
        batch_id: batchId,
        hash: '',
        generated_at: generatedAt,
        record_count: records.length,
        standards_mapping: STANDARDS_MAPPING,
        policy_modes: POLICY_MODES,
        records,
      }
      const unsigned = JSON.stringify(payload, null, 2)
      const hash = createHash('sha256').update(unsigned).digest('hex')
      payload.hash = hash
      await persistExportBatch(batchId, hash, generatedAt, records.length, format, start, end, mode, policyMode)
      return res.json(payload)
    }

    const columns: Array<keyof DisclosureRecord> = [
      'timestamp',
      'workload_name',
      'operation',
      'decision_id',
      'decision_frame_id',
      'region',
      'baseline_region',
      'estimated_kwh',
      'emissions_gco2',
      'intensity_gco2_per_kwh',
      'signal_type',
      'source',
      'validation_source',
      'mode',
      'policy_mode',
      'assurance_mode',
      'quality_tier',
      'confidence_label',
      'fallback_used',
      'disagreement_flag',
      'disagreement_pct',
      'reference_time',
      'data_freshness_seconds',
      'location_based_scope2_gco2',
      'market_based_scope2_gco2',
    ]

    const escape = (value: unknown) => {
      if (value === null || value === undefined) return ''
      const text = String(value)
      if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
      return text
    }

    const lines = [columns.join(',')]
    for (const record of records) {
      lines.push(columns.map((column) => escape(record[column])).join(','))
    }

    const csv = lines.join('\n')
    const hash = createHash('sha256').update(csv).digest('hex')
    await persistExportBatch(batchId, hash, generatedAt, records.length, format, start, end, mode, policyMode)

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="ecobe-disclosure-export.csv"')
    res.setHeader('X-Ecobe-Batch-Id', batchId)
    res.setHeader('X-Ecobe-Export-Hash', hash)
    res.setHeader('X-Ecobe-Generated-At', generatedAt)
    return res.send(csv)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Disclosure export error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/batches', async (req, res) => {
  try {
    const { limit } = batchesQuerySchema.parse(req.query)
    const batches = await prisma.emissionLog.findMany({
      where: { source: 'DISCLOSURE_EXPORT_BATCH' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        workloadRequestId: true,
        timestamp: true,
        metadata: true,
      },
    })

    return res.json({
      batches: batches.map((batch: { workloadRequestId: string | null; timestamp: Date; metadata: any }) => ({
        batchId: batch.workloadRequestId,
        generatedAt: batch.timestamp.toISOString(),
        metadata: batch.metadata,
      })),
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    console.error('Disclosure batch list error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
