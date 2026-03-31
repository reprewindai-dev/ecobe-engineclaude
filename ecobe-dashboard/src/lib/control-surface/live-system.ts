import 'server-only'

import { fetchEngineJson, hasInternalApiKey } from './engine'
import type {
  LiveSystemDatasetStatus,
  LiveSystemSnapshot,
  LiveSystemTraceLedger,
  LiveSystemReplayResponse,
  LiveSystemTraceResponse,
} from '@/types/control-surface'

type DecisionFeedResponse = {
  decisions: Array<{
    decisionFrameId: string
    createdAt: string
    action?: string
    decisionAction?: string
    reasonCode: string
    selectedRegion: string
    proofHash?: string | null
    traceAvailable?: boolean
    governanceSource?: string | null
  }>
}

type WaterProvenanceResponse = {
  bundleSchemaVersion?: string
  manifestSchemaVersion?: string
  checkedAt: string
  datasets: Array<{
    name: string
    datasetVersion: string | null
    sourceUrl?: string | null
    manifestHash: string | null
    computedHash: string | null
    verificationStatus: LiveSystemDatasetStatus
  }>
  summary: {
    verified: number
    unverified: number
    missingSource: number
    mismatch: number
  }
}

type SloResponse = {
  samples: number
  p95: {
    totalMs: number
    computeMs: number
  }
  budget: {
    totalP95Ms: number
    computeP95Ms: number
  }
  withinBudget: {
    total: boolean
    compute: boolean
  }
}

const REQUIRED_DATASETS = ['aqueduct', 'aware', 'wwf', 'nrel'] as const

function unavailableTraceLedger(error: string): LiveSystemTraceLedger {
  return {
    available: false,
    error,
    traceAvailable: false,
    traceHash: null,
    inputSignalHash: null,
    sequenceNumber: null,
    proofAvailable: false,
    replayConsistent: null,
  }
}

export async function getLiveSystemSnapshot(): Promise<LiveSystemSnapshot> {
  const [decisionsResult, provenanceResult, sloResult] = await Promise.allSettled([
    fetchEngineJson<DecisionFeedResponse>('/ci/decisions?limit=5'),
    fetchEngineJson<WaterProvenanceResponse>('/water/provenance'),
    fetchEngineJson<SloResponse>('/ci/slo'),
  ])

  const recentDecisions =
    decisionsResult.status === 'fulfilled'
      ? decisionsResult.value.decisions.map((decision) => ({
          decisionFrameId: decision.decisionFrameId,
          createdAt: decision.createdAt,
          action: decision.action ?? decision.decisionAction ?? 'unknown',
          reasonCode: decision.reasonCode,
          selectedRegion: decision.selectedRegion,
          proofHash: decision.proofHash ?? null,
          traceAvailable: Boolean(decision.traceAvailable),
          governanceSource: decision.governanceSource ?? null,
        }))
      : []

  const latestDecision = recentDecisions[0] ?? null

  const traceResult =
    latestDecision && hasInternalApiKey()
      ? await Promise.allSettled([
          fetchEngineJson<LiveSystemTraceResponse>(
            `/ci/decisions/${encodeURIComponent(latestDecision.decisionFrameId)}/trace`,
            undefined,
            { internal: true }
          ),
          fetchEngineJson<LiveSystemReplayResponse>(
            `/ci/decisions/${encodeURIComponent(latestDecision.decisionFrameId)}/replay`,
            undefined,
            { internal: true }
          ),
        ])
      : null

  const traceResponse =
    traceResult?.[0]?.status === 'fulfilled' ? traceResult[0].value : null
  const replayResponse =
    traceResult?.[1]?.status === 'fulfilled' ? traceResult[1].value : null

  const traceError =
    !latestDecision
      ? 'No recent decision is available for trace inspection.'
      : !hasInternalApiKey()
        ? 'Internal trace access is not configured in this environment.'
        : traceResult?.[0]?.status === 'rejected'
          ? traceResult[0].reason instanceof Error
            ? traceResult[0].reason.message
            : 'Failed to load trace data.'
          : null

  const replayError =
    !latestDecision
      ? 'No recent decision is available for replay verification.'
      : !hasInternalApiKey()
        ? 'Internal replay access is not configured in this environment.'
        : traceResult?.[1]?.status === 'rejected'
          ? traceResult[1].reason instanceof Error
            ? traceResult[1].reason.message
            : 'Failed to load replay data.'
          : null

  const provenanceDatasets =
    provenanceResult.status === 'fulfilled'
      ? REQUIRED_DATASETS.map((datasetName) => {
          const match = provenanceResult.value.datasets.find(
            (dataset) => dataset.name.toLowerCase() === datasetName
          )
          return {
            name: datasetName,
            verificationStatus: match?.verificationStatus ?? 'unavailable',
            datasetVersion: match?.datasetVersion ?? null,
            manifestHash: match?.manifestHash ?? null,
            computedHash: match?.computedHash ?? null,
          }
        })
      : REQUIRED_DATASETS.map((datasetName) => ({
          name: datasetName,
          verificationStatus: 'unavailable' as const,
          datasetVersion: null,
          manifestHash: null,
          computedHash: null,
        }))

  const traceLedger =
    traceResponse
      ? {
          available: true,
          error: replayError,
          traceAvailable: Boolean(traceResponse.traceAvailable),
          traceHash: traceResponse.traceHash ?? null,
          inputSignalHash: traceResponse.inputSignalHash ?? null,
          sequenceNumber: traceResponse.sequenceNumber ?? null,
          proofAvailable: Boolean(traceResponse.proofHash),
          replayConsistent:
            replayResponse?.deterministicMatch ?? replayResponse?.consistent ?? null,
        }
      : unavailableTraceLedger(traceError ?? 'Trace is unavailable.')

  return {
    generatedAt: new Date().toISOString(),
    recentDecisions: {
      available: decisionsResult.status === 'fulfilled',
      error:
        decisionsResult.status === 'rejected'
          ? decisionsResult.reason instanceof Error
            ? decisionsResult.reason.message
            : 'Failed to load recent decisions.'
          : null,
      items: recentDecisions,
    },
    traceLedger,
    governance: {
      available: Boolean(traceResponse),
      error: traceError,
      frameworkLabel: 'SAIQ',
      active: traceResponse ? traceResponse.governanceSource !== 'NONE' : null,
      policyState: traceResponse?.governanceSource ?? null,
      latestDecisionAction: traceResponse?.action ?? latestDecision?.action ?? null,
      latestReasonCode: traceResponse?.reasonCode ?? latestDecision?.reasonCode ?? null,
    },
    providers: {
      available: provenanceResult.status === 'fulfilled',
      error:
        provenanceResult.status === 'rejected'
          ? provenanceResult.reason instanceof Error
            ? provenanceResult.reason.message
            : 'Failed to load provenance status.'
          : null,
      datasets: provenanceDatasets,
    },
    latency: {
      available: sloResult.status === 'fulfilled',
      error:
        sloResult.status === 'rejected'
          ? sloResult.reason instanceof Error
            ? sloResult.reason.message
            : 'Failed to load latency metrics.'
          : null,
      samples: sloResult.status === 'fulfilled' ? sloResult.value.samples : null,
      p95TotalMs: sloResult.status === 'fulfilled' ? sloResult.value.p95.totalMs : null,
      p95ComputeMs: sloResult.status === 'fulfilled' ? sloResult.value.p95.computeMs : null,
      budgetTotalP95Ms:
        sloResult.status === 'fulfilled' ? sloResult.value.budget.totalP95Ms : null,
      budgetComputeP95Ms:
        sloResult.status === 'fulfilled' ? sloResult.value.budget.computeP95Ms : null,
      withinBudget:
        sloResult.status === 'fulfilled'
          ? {
              total: sloResult.value.withinBudget.total,
              compute: sloResult.value.withinBudget.compute,
            }
          : {
              total: null,
              compute: null,
            },
    },
  }
}
