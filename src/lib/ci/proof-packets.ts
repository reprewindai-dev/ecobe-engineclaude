import PDFDocument from 'pdfkit'

import type { TraceEnvelopeRecord } from './trace'

type ExplanationLike = {
  whyAction?: string
  whyTarget?: string
  dominantConstraint?: string
  policyPrecedence?: string[]
  rejectedAlternatives?: Array<{ region?: string; reason?: string }>
  counterfactualCondition?: string
  uncertaintySummary?: string
}

type DecisionTrustLike = {
  signalFreshness?: {
    carbonFreshnessSec?: number | null
    waterFreshnessSec?: number | null
    freshnessSummary?: string
  }
  providerTrust?: {
    carbonProvider?: string
    carbonProviderHealth?: string
    waterAuthorityHealth?: string
    providerTrustTier?: string
  }
  disagreement?: {
    present?: boolean
    pct?: number
    summary?: string
  }
  estimatedFields?: {
    present?: boolean
    fields?: string[]
  }
  replayability?: {
    status?: string
    summary?: string
  }
  fallbackMode?: {
    engaged?: boolean
    summary?: string
  }
  degradedState?: {
    degraded?: boolean
    reasons?: string[]
    summary?: string
  }
}

type ResponseLike = {
  decisionFrameId?: string
  workloadClass?: string
  decision?: string
  decisionMode?: string
  reasonCode?: string
  selectedRegion?: string
  selectedRunner?: string
  operatingMode?: string
  baseline?: {
    region?: string
    carbonIntensity?: number
    waterImpactLiters?: number
    waterScarcityImpact?: number
  }
  selected?: {
    region?: string
    carbonIntensity?: number
    waterImpactLiters?: number
    waterScarcityImpact?: number
  }
  decisionExplanation?: ExplanationLike
  decisionTrust?: DecisionTrustLike
  policyTrace?: Record<string, unknown> & {
    profile?: string
    policyVersion?: string
    reasonCodes?: string[]
  }
  mss?: {
    snapshotId?: string
    carbonProvider?: string
    carbonProviderHealth?: string
    waterAuthorityHealth?: string
    carbonFreshnessSec?: number | null
    waterFreshnessSec?: number | null
    cacheStatus?: string
    disagreement?: {
      flag?: boolean
      pct?: number
    }
    carbonLineage?: string[]
    waterLineage?: string[]
  }
  proofHash?: string
  proofRecord?: {
    proof_hash?: string
    timestamp?: string
    provider_snapshot_refs?: string[]
  }
  decisionEnvelope?: Record<string, unknown>
  proofEnvelope?: Record<string, unknown>
}

export interface ReplayInspectionPacket {
  decisionFrameId: string
  replayedAt: string
  deterministicMatch: boolean
  traceBacked: boolean
  mismatches: string[]
  persistedResponse: Record<string, unknown> | null
  replayedResponse: Record<string, unknown> | null
}

export interface DecisionProofPacket {
  type: 'decision_proof_packet'
  decisionFrameId: string
  exportedAt: string
  workloadClass: string
  decision: {
    action: string
    decisionMode: string
    reasonCode: string
    operatingMode: string
    selectedRegion: string
    selectedRunner: string
  }
  baseline: {
    region: string | null
    carbonIntensity: number | null
    waterImpactLiters: number | null
    waterScarcityImpact: number | null
  }
  selected: {
    region: string | null
    carbonIntensity: number | null
    waterImpactLiters: number | null
    waterScarcityImpact: number | null
  }
  explanation: Required<ExplanationLike>
  trust: Required<DecisionTrustLike>
  policyTraceSummary: {
    profile: string | null
    policyVersion: string | null
    reasonCodes: string[]
  }
  mss: {
    snapshotId: string | null
    cacheStatus: string | null
    carbonProvider: string | null
    carbonProviderHealth: string | null
    waterAuthorityHealth: string | null
    carbonFreshnessSec: number | null
    waterFreshnessSec: number | null
    disagreementPct: number
    carbonLineage: string[]
    waterLineage: string[]
  }
  hashes: {
    proofHash: string | null
    traceHash: string | null
    inputSignalHash: string | null
  }
  replay: {
    available: boolean
    deterministicMatch: boolean | null
    mismatches: string[]
    replayedAt: string | null
  }
  envelopes: {
    decisionEnvelope: Record<string, unknown> | null
    proofEnvelope: Record<string, unknown> | null
  }
}

function normalizedExplanation(response: ResponseLike): Required<ExplanationLike> {
  return {
    whyAction:
      response.decisionExplanation?.whyAction ??
      'Explanation was not present on the stored response.',
    whyTarget:
      response.decisionExplanation?.whyTarget ??
      'Target explanation was not present on the stored response.',
    dominantConstraint:
      response.decisionExplanation?.dominantConstraint ?? 'unknown_constraint',
    policyPrecedence:
      response.decisionExplanation?.policyPrecedence ?? [],
    rejectedAlternatives:
      response.decisionExplanation?.rejectedAlternatives ?? [],
    counterfactualCondition:
      response.decisionExplanation?.counterfactualCondition ??
      'Counterfactual condition unavailable on stored response.',
    uncertaintySummary:
      response.decisionExplanation?.uncertaintySummary ??
      'Uncertainty summary unavailable on stored response.',
  }
}

function normalizedTrust(response: ResponseLike): Required<DecisionTrustLike> {
  return {
    signalFreshness: {
      carbonFreshnessSec: response.decisionTrust?.signalFreshness?.carbonFreshnessSec ?? null,
      waterFreshnessSec: response.decisionTrust?.signalFreshness?.waterFreshnessSec ?? null,
      freshnessSummary:
        response.decisionTrust?.signalFreshness?.freshnessSummary ??
        'Signal freshness summary unavailable.',
    },
    providerTrust: {
      carbonProvider: response.decisionTrust?.providerTrust?.carbonProvider ?? response.mss?.carbonProvider ?? 'unknown',
      carbonProviderHealth:
        response.decisionTrust?.providerTrust?.carbonProviderHealth ??
        response.mss?.carbonProviderHealth ??
        'UNKNOWN',
      waterAuthorityHealth:
        response.decisionTrust?.providerTrust?.waterAuthorityHealth ??
        response.mss?.waterAuthorityHealth ??
        'UNKNOWN',
      providerTrustTier:
        response.decisionTrust?.providerTrust?.providerTrustTier ?? 'guarded',
    },
    disagreement: {
      present:
        response.decisionTrust?.disagreement?.present ??
        Boolean(response.mss?.disagreement?.flag),
      pct:
        response.decisionTrust?.disagreement?.pct ??
        response.mss?.disagreement?.pct ??
        0,
      summary:
        response.decisionTrust?.disagreement?.summary ??
        'Disagreement summary unavailable.',
    },
    estimatedFields: {
      present: response.decisionTrust?.estimatedFields?.present ?? false,
      fields: response.decisionTrust?.estimatedFields?.fields ?? [],
    },
    replayability: {
      status: response.decisionTrust?.replayability?.status ?? 'degraded',
      summary:
        response.decisionTrust?.replayability?.summary ??
        'Replayability summary unavailable.',
    },
    fallbackMode: {
      engaged: response.decisionTrust?.fallbackMode?.engaged ?? false,
      summary:
        response.decisionTrust?.fallbackMode?.summary ??
        'Fallback summary unavailable.',
    },
    degradedState: {
      degraded: response.decisionTrust?.degradedState?.degraded ?? false,
      reasons: response.decisionTrust?.degradedState?.reasons ?? [],
      summary:
        response.decisionTrust?.degradedState?.summary ??
        'Degraded-state summary unavailable.',
    },
  }
}

export function buildDecisionProofPacket(input: {
  storedResponse: ResponseLike
  traceRecord: TraceEnvelopeRecord | null
  replay: ReplayInspectionPacket | null
}): DecisionProofPacket {
  const response = input.storedResponse
  return {
    type: 'decision_proof_packet',
    decisionFrameId: response.decisionFrameId ?? 'unknown',
    exportedAt: new Date().toISOString(),
    workloadClass: response.workloadClass ?? 'interactive',
    decision: {
      action: response.decision ?? 'unknown',
      decisionMode: response.decisionMode ?? 'unknown',
      reasonCode: response.reasonCode ?? 'unknown',
      operatingMode: response.operatingMode ?? 'unknown',
      selectedRegion: response.selectedRegion ?? response.selected?.region ?? 'unknown',
      selectedRunner: response.selectedRunner ?? 'unknown',
    },
    baseline: {
      region: response.baseline?.region ?? null,
      carbonIntensity: response.baseline?.carbonIntensity ?? null,
      waterImpactLiters: response.baseline?.waterImpactLiters ?? null,
      waterScarcityImpact: response.baseline?.waterScarcityImpact ?? null,
    },
    selected: {
      region: response.selected?.region ?? null,
      carbonIntensity: response.selected?.carbonIntensity ?? null,
      waterImpactLiters: response.selected?.waterImpactLiters ?? null,
      waterScarcityImpact: response.selected?.waterScarcityImpact ?? null,
    },
    explanation: normalizedExplanation(response),
    trust: normalizedTrust(response),
    policyTraceSummary: {
      profile: response.policyTrace?.profile ?? null,
      policyVersion: response.policyTrace?.policyVersion ?? null,
      reasonCodes: Array.isArray(response.policyTrace?.reasonCodes)
        ? response.policyTrace.reasonCodes
        : [],
    },
    mss: {
      snapshotId: response.mss?.snapshotId ?? null,
      cacheStatus: response.mss?.cacheStatus ?? null,
      carbonProvider: response.mss?.carbonProvider ?? null,
      carbonProviderHealth: response.mss?.carbonProviderHealth ?? null,
      waterAuthorityHealth: response.mss?.waterAuthorityHealth ?? null,
      carbonFreshnessSec: response.mss?.carbonFreshnessSec ?? null,
      waterFreshnessSec: response.mss?.waterFreshnessSec ?? null,
      disagreementPct: response.mss?.disagreement?.pct ?? 0,
      carbonLineage: response.mss?.carbonLineage ?? [],
      waterLineage: response.mss?.waterLineage ?? [],
    },
    hashes: {
      proofHash: response.proofHash ?? response.proofRecord?.proof_hash ?? null,
      traceHash: input.traceRecord?.traceHash ?? null,
      inputSignalHash: input.traceRecord?.inputSignalHash ?? null,
    },
    replay: {
      available: Boolean(input.replay),
      deterministicMatch: input.replay?.deterministicMatch ?? null,
      mismatches: input.replay?.mismatches ?? [],
      replayedAt: input.replay?.replayedAt ?? null,
    },
    envelopes: {
      decisionEnvelope:
        response.decisionEnvelope && typeof response.decisionEnvelope === 'object'
          ? response.decisionEnvelope
          : null,
      proofEnvelope:
        response.proofEnvelope && typeof response.proofEnvelope === 'object'
          ? response.proofEnvelope
          : null,
    },
  }
}

export function buildReplayProofPacket(input: ReplayInspectionPacket) {
  return {
    type: 'replay_proof_packet' as const,
    decisionFrameId: input.decisionFrameId,
    replayedAt: input.replayedAt,
    deterministicMatch: input.deterministicMatch,
    traceBacked: input.traceBacked,
    mismatches: input.mismatches,
    persistedResponse: input.persistedResponse,
    replayedResponse: input.replayedResponse,
  }
}

function writeKeyValue(doc: any, label: string, value: string) {
  doc.font('Helvetica-Bold').text(label, { continued: true })
  doc.font('Helvetica').text(` ${value}`)
}

export async function renderDecisionProofPacketPdf(packet: DecisionProofPacket): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 48,
      compress: true,
      info: {
        Title: `CO2 Router Decision Proof Packet ${packet.decisionFrameId}`,
        Author: 'CO2 Router',
        Subject: 'Operational decision proof packet',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(20).font('Helvetica-Bold').text('CO2 Router Decision Proof Packet')
    doc.moveDown(0.5)
    doc.fontSize(10).font('Helvetica').fillColor('black')
    writeKeyValue(doc, 'Decision frame:', packet.decisionFrameId)
    writeKeyValue(doc, 'Exported at:', packet.exportedAt)
    writeKeyValue(doc, 'Workload class:', packet.workloadClass)
    doc.moveDown()

    doc.fontSize(14).font('Helvetica-Bold').text('Decision summary')
    doc.fontSize(10).font('Helvetica')
    writeKeyValue(doc, 'Action:', packet.decision.action ?? 'unknown')
    writeKeyValue(doc, 'Reason code:', packet.decision.reasonCode ?? 'unknown')
    writeKeyValue(doc, 'Decision mode:', packet.decision.decisionMode ?? 'unknown')
    writeKeyValue(doc, 'Operating mode:', packet.decision.operatingMode ?? 'unknown')
    writeKeyValue(doc, 'Selected region:', packet.decision.selectedRegion ?? 'unknown')
    writeKeyValue(doc, 'Selected runner:', packet.decision.selectedRunner ?? 'unknown')
    doc.moveDown()

    doc.fontSize(14).font('Helvetica-Bold').text('Explanation')
    doc.fontSize(10).font('Helvetica')
    writeKeyValue(doc, 'Why action:', packet.explanation.whyAction ?? 'unavailable')
    writeKeyValue(doc, 'Why target:', packet.explanation.whyTarget ?? 'unavailable')
    writeKeyValue(
      doc,
      'Dominant constraint:',
      packet.explanation.dominantConstraint ?? 'unavailable'
    )
    writeKeyValue(
      doc,
      'Counterfactual:',
      packet.explanation.counterfactualCondition ?? 'unavailable'
    )
    writeKeyValue(doc, 'Uncertainty:', packet.explanation.uncertaintySummary ?? 'unavailable')
    doc.moveDown()

    doc.fontSize(14).font('Helvetica-Bold').text('Trust contract')
    doc.fontSize(10).font('Helvetica')
    writeKeyValue(
      doc,
      'Provider trust tier:',
      packet.trust.providerTrust.providerTrustTier ?? 'unavailable'
    )
    writeKeyValue(
      doc,
      'Carbon provider:',
      packet.trust.providerTrust.carbonProvider ?? 'unavailable'
    )
    writeKeyValue(
      doc,
      'Freshness:',
      packet.trust.signalFreshness.freshnessSummary ?? 'unavailable'
    )
    writeKeyValue(doc, 'Disagreement:', packet.trust.disagreement.summary ?? 'unavailable')
    writeKeyValue(doc, 'Replayability:', packet.trust.replayability.summary ?? 'unavailable')
    writeKeyValue(doc, 'Fallback mode:', packet.trust.fallbackMode.summary ?? 'unavailable')
    writeKeyValue(doc, 'Degraded state:', packet.trust.degradedState.summary ?? 'unavailable')
    doc.moveDown()

    doc.fontSize(14).font('Helvetica-Bold').text('Proof and replay posture')
    doc.fontSize(10).font('Helvetica')
    writeKeyValue(doc, 'Proof hash:', packet.hashes.proofHash ?? 'unavailable')
    writeKeyValue(doc, 'Trace hash:', packet.hashes.traceHash ?? 'unavailable')
    writeKeyValue(doc, 'Input signal hash:', packet.hashes.inputSignalHash ?? 'unavailable')
    writeKeyValue(
      doc,
      'Replay status:',
      packet.replay.available
        ? packet.replay.deterministicMatch
          ? 'deterministic match'
          : `mismatch: ${packet.replay.mismatches.join(', ') || 'unspecified'}`
        : 'replay not available'
    )

    doc.end()
  })
}
