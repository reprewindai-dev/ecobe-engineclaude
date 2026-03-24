import { Router } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'

import { env } from '../config/env'
import { prisma } from '../lib/db'
import {
  buildDisclosureCsv,
  buildDisclosureEnvelope,
  resolveDisclosureScope,
  toDisclosureRecord,
  type DisclosureExportScope,
  type LedgerDisclosureEntry,
} from '../lib/disclosure-exports'
import type { PolicyMode, RoutingMode } from '../lib/methodology'
import { internalServiceGuard } from '../middleware/internal-auth'

const router = Router()
router.use(internalServiceGuard)

const exportQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(['json', 'csv']).default('json'),
  mode: z.enum(['assurance', 'optimize', 'all']).default('all'),
  policyMode: z.enum(['default', 'sec_disclosure_strict', 'eu_24x7_ready']).optional(),
  orgId: z.string().optional(),
  scope: z.enum(['organization', 'system', 'global']).optional(),
})

const batchesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  orgId: z.string().optional(),
  scope: z.enum(['organization', 'system', 'global']).optional(),
})

function resolveWindow(from?: string, to?: string) {
  const end = to ? new Date(to) : new Date()
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
  return { start, end }
}

async function persistExportBatch(input: {
  batchId: string
  orgId: string | null
  scope: DisclosureExportScope
  format: 'json' | 'csv'
  mode: 'assurance' | 'optimize' | 'all'
  policyMode?: PolicyMode
  recordCount: number
  payloadDigest: string
  signature: string | null
  signatureAlgorithm: 'hmac-sha256' | null
  generatedAt: string
  start: Date
  end: Date
}) {
  return prisma.disclosureExportBatch.create({
    data: {
      batchId: input.batchId,
      orgId: input.orgId,
      scope: input.scope,
      format: input.format,
      routingMode: input.mode,
      policyMode: input.policyMode ?? null,
      recordCount: input.recordCount,
      payloadDigest: input.payloadDigest,
      digestAlgorithm: 'sha256',
      signature: input.signature,
      signatureAlgorithm: input.signatureAlgorithm,
      fromTs: input.start,
      toTs: input.end,
      generatedAt: new Date(input.generatedAt),
      metadata: {
        scope: input.scope,
        orgId: input.orgId,
      },
    },
  })
}

router.get('/export', async (req, res) => {
  try {
    const { from, to, format, mode, policyMode, orgId, scope: requestedScope } =
      exportQuerySchema.parse(req.query)
    const { start, end } = resolveWindow(from, to)
    const scope = resolveDisclosureScope(orgId, requestedScope)

    const where: Record<string, unknown> = {
      createdAt: {
        gte: start,
        lte: end,
      },
    }

    if (scope.scope === 'organization' && scope.orgId) {
      where.orgId = scope.orgId
    } else if (scope.scope === 'system') {
      where.orgId = 'system'
    }

    if (mode !== 'all') {
      where.routingMode = mode
    }

    if (policyMode) {
      where.policyMode = policyMode
    }

    const ledgerEntries = (await prisma.carbonLedgerEntry.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        orgId: true,
        decisionFrameId: true,
        createdAt: true,
        chosenStartTs: true,
        jobClass: true,
        workloadType: true,
        baselineRegion: true,
        chosenRegion: true,
        baselineCarbonGPerKwh: true,
        chosenCarbonGPerKwh: true,
        energyEstimateKwh: true,
        baselineCarbonG: true,
        chosenCarbonG: true,
        carbonSavedG: true,
        actualCarbonGPerKwh: true,
        actualCarbonG: true,
        accountingMethod: true,
        sourceUsed: true,
        validationSource: true,
        fallbackUsed: true,
        estimatedFlag: true,
        syntheticFlag: true,
        qualityTier: true,
        confidenceLabel: true,
        disagreementFlag: true,
        disagreementPct: true,
        routingMode: true,
        policyMode: true,
        signalTypeUsed: true,
        referenceTime: true,
        dataFreshnessSeconds: true,
        confidenceBandLow: true,
        confidenceBandMid: true,
        confidenceBandHigh: true,
        lowerHalfBenchmarkGPerKwh: true,
        lowerHalfQualified: true,
        baselineWaterL: true,
        chosenWaterL: true,
        waterSavedL: true,
        baselineWaterScarcityImpact: true,
        chosenWaterScarcityImpact: true,
        baselineWaterIntensityLPerKwh: true,
        chosenWaterIntensityLPerKwh: true,
        waterStressIndex: true,
        waterQualityIndex: true,
        droughtRiskIndex: true,
        waterConfidenceScore: true,
        waterSource: true,
        waterSignalType: true,
        waterDatasetVersion: true,
        waterPolicyProfile: true,
        waterGuardrailTriggered: true,
        waterFallbackUsed: true,
        waterReferenceTime: true,
        metadata: true,
      },
    })) as LedgerDisclosureEntry[]

    const records = ledgerEntries.map(toDisclosureRecord)
    const generatedAt = new Date().toISOString()
    const batchId = `disclosure_${randomUUID()}`
    const envelope = buildDisclosureEnvelope({
      batchId,
      generatedAt,
      scope: scope.scope,
      orgId: scope.orgId,
      records,
      signingSecret: env.DISCLOSURE_EXPORT_SIGNING_SECRET,
    })

    await persistExportBatch({
      batchId,
      orgId: scope.orgId,
      scope: scope.scope,
      format,
      mode,
      policyMode,
      recordCount: records.length,
      payloadDigest: envelope.integrity.payload_digest,
      signature: envelope.integrity.signature,
      signatureAlgorithm: envelope.integrity.signature_algorithm,
      generatedAt,
      start,
      end,
    })

    if (format === 'json') {
      return res.json(envelope)
    }

    const csv = buildDisclosureCsv(records)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="ecobe-disclosure-export.csv"')
    res.setHeader('X-Ecobe-Batch-Id', batchId)
    res.setHeader('X-Ecobe-Export-Digest', envelope.integrity.payload_digest)
    res.setHeader('X-Ecobe-Generated-At', generatedAt)
    if (envelope.integrity.signature) {
      res.setHeader('X-Ecobe-Export-Signature', envelope.integrity.signature)
    }
    return res.send(csv)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    if (error instanceof Error && error.message.includes('scope')) {
      return res.status(400).json({ error: error.message })
    }
    console.error('Disclosure export error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/batches', async (req, res) => {
  try {
    const { limit, orgId, scope: requestedScope } = batchesQuerySchema.parse(req.query)
    const scope = resolveDisclosureScope(orgId, requestedScope)
    const where: Record<string, unknown> = {}

    if (scope.scope === 'organization' && scope.orgId) {
      where.orgId = scope.orgId
    } else {
      where.scope = scope.scope
    }

    const batches = (await prisma.disclosureExportBatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        batchId: true,
        orgId: true,
        scope: true,
        format: true,
        routingMode: true,
        policyMode: true,
        recordCount: true,
        payloadDigest: true,
        digestAlgorithm: true,
        signature: true,
        signatureAlgorithm: true,
        fromTs: true,
        toTs: true,
        generatedAt: true,
        createdAt: true,
        metadata: true,
      },
    })) as Array<{
      batchId: string
      orgId: string | null
      scope: string
      format: string
      routingMode: string
      policyMode: string | null
      recordCount: number
      payloadDigest: string
      digestAlgorithm: string
      signature: string | null
      signatureAlgorithm: string | null
      fromTs: Date
      toTs: Date
      generatedAt: Date
      createdAt: Date
      metadata: Record<string, unknown>
    }>

    return res.json({
      batches: batches.map((batch) => ({
        batchId: batch.batchId,
        orgId: batch.orgId,
        scope: batch.scope,
        format: batch.format,
        routingMode: batch.routingMode as RoutingMode | 'all',
        policyMode: batch.policyMode as PolicyMode | null,
        recordCount: batch.recordCount,
        integrity: {
          payloadDigest: batch.payloadDigest,
          digestAlgorithm: batch.digestAlgorithm,
          signature: batch.signature,
          signatureAlgorithm: batch.signatureAlgorithm,
        },
        window: {
          from: batch.fromTs.toISOString(),
          to: batch.toTs.toISOString(),
        },
        generatedAt: batch.generatedAt.toISOString(),
        createdAt: batch.createdAt.toISOString(),
        metadata: batch.metadata,
      })),
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors })
    }
    if (error instanceof Error && error.message.includes('scope')) {
      return res.status(400).json({ error: error.message })
    }
    console.error('Disclosure batch list error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
