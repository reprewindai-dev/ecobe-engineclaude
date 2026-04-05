type CanonicalDecisionAction = 'run_now' | 'reroute' | 'delay' | 'throttle' | 'deny'

type HandoffStatus =
  | 'queued'
  | 'processing'
  | 'processed'
  | 'ignored'
  | 'failed'

type HandoffEventType =
  | 'BUDGET_WARNING'
  | 'BUDGET_EXCEEDED'
  | 'POLICY_DELAY'
  | 'POLICY_BLOCK'
  | 'HIGH_CARBON_PATTERN'
  | 'LOW_CONFIDENCE_REGION'
  | 'CLEAN_WINDOW_OPPORTUNITY'
  | 'PROVIDER_DISAGREEMENT_ALERT'
  | 'EXECUTION_DRIFT_RISK'
  | 'ROUTING_POLICY_INSIGHT'

type HandoffSeverity = 'low' | 'medium' | 'high' | 'critical'
type HandoffClassification = 'opportunity' | 'informational' | 'risk' | 'no_action'
type QualityTier = 'high' | 'medium' | 'low'
type ForecastStability = 'stable' | 'medium' | 'unstable' | null

export type DekesLatencyRecord = {
  total: number
  compute: number
}

export type ParsedDekesHandoffNotes = {
  decisionFrameId: string | null
  proofId: string | null
  proofHash: string | null
  decisionMode: string | null
  action: CanonicalDecisionAction | null
  legacyAction: string | null
  reasonCode: string | null
  selectedRegion: string | null
  selectedRunner: string | null
  policyTrace: Record<string, unknown>
  carbonReductionPct: number | null
  waterImpactDeltaLiters: number | null
  latencyMs: DekesLatencyRecord | null
  estimatedEnergyKwh: number | null
}

export type CanonicalDekesDecisionSurfaceInput = {
  decisionFrameId: string
  decision: CanonicalDecisionAction
  decisionMode: string
  selectedRegion: string
  selectedRunner: string
  reasonCode: string
  signalConfidence: number
  notBefore: string | null
  proofHash: string
  proofRecord: {
    job_id: string
  }
  policyTrace: Record<string, unknown>
  savings: {
    carbonReductionPct: number
    waterImpactDeltaLiters: number
  }
  baseline: {
    carbonIntensity: number
  }
  selected: {
    carbonIntensity: number
  }
  latencyMs?: {
    total?: number
    compute?: number
  } | null
  enforcementBundle?: {
    githubActions?: {
      executable?: boolean
      maxParallel?: number
      environment?: string | null
      notBefore?: string | null
    }
    kubernetes?: unknown
  }
}

export function estimateDekesEnergyKwh(input: {
  estimatedResults?: number | null
  estimatedKwh?: number | null
  durationMinutes?: number | null
}) {
  if (typeof input.estimatedKwh === 'number' && Number.isFinite(input.estimatedKwh) && input.estimatedKwh > 0) {
    return Number(input.estimatedKwh.toFixed(6))
  }

  if (
    typeof input.estimatedResults === 'number' &&
    Number.isFinite(input.estimatedResults) &&
    input.estimatedResults > 0
  ) {
    return Number(Math.max(0.01, input.estimatedResults * 0.001).toFixed(6))
  }

  if (
    typeof input.durationMinutes === 'number' &&
    Number.isFinite(input.durationMinutes) &&
    input.durationMinutes > 0
  ) {
    return Number(Math.max(0.01, input.durationMinutes * 0.02).toFixed(6))
  }

  return 0.05
}

export function buildDekesArtifactLinks(decisionFrameId: string | null | undefined) {
  if (!decisionFrameId) {
    return null
  }

  const encoded = encodeURIComponent(decisionFrameId)
  return {
    trace: `/api/v1/ci/decisions/${encoded}/trace`,
    rawTrace: `/api/v1/ci/decisions/${encoded}/trace/raw`,
    replay: `/api/v1/ci/decisions/${encoded}/replay`,
    replayPacketJson: `/api/v1/ci/decisions/${encoded}/replay-packet.json`,
    proofPacketJson: `/api/v1/ci/decisions/${encoded}/proof-packet.json`,
    proofPacketPdf: `/api/v1/ci/decisions/${encoded}/proof-packet.pdf`,
  }
}

export function parseDekesHandoffNotes(notes: string | null | undefined): ParsedDekesHandoffNotes {
  if (!notes) {
    return {
      decisionFrameId: null,
      proofId: null,
      proofHash: null,
      decisionMode: null,
      action: null,
      legacyAction: null,
      reasonCode: null,
      selectedRegion: null,
      selectedRunner: null,
      policyTrace: {},
      carbonReductionPct: null,
      waterImpactDeltaLiters: null,
      latencyMs: null,
      estimatedEnergyKwh: null,
    }
  }

  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>
    const latency =
      parsed.latencyMs &&
      typeof parsed.latencyMs === 'object' &&
      typeof (parsed.latencyMs as Record<string, unknown>).total === 'number' &&
      typeof (parsed.latencyMs as Record<string, unknown>).compute === 'number'
        ? {
            total: Number((parsed.latencyMs as Record<string, number>).total),
            compute: Number((parsed.latencyMs as Record<string, number>).compute),
          }
        : null

    const action = parsed.action
    const typedAction: CanonicalDecisionAction | null =
      action === 'run_now' ||
      action === 'reroute' ||
      action === 'delay' ||
      action === 'throttle' ||
      action === 'deny'
        ? action
        : null

    return {
      decisionFrameId:
        typeof parsed.decisionFrameId === 'string' && parsed.decisionFrameId.length > 0
          ? parsed.decisionFrameId
          : null,
      proofId: typeof parsed.proofId === 'string' && parsed.proofId.length > 0 ? parsed.proofId : null,
      proofHash:
        typeof parsed.proofHash === 'string' && parsed.proofHash.length > 0 ? parsed.proofHash : null,
      decisionMode:
        typeof parsed.decisionMode === 'string' && parsed.decisionMode.length > 0
          ? parsed.decisionMode
          : null,
      action: typedAction,
      legacyAction:
        typeof parsed.legacyAction === 'string' && parsed.legacyAction.length > 0
          ? parsed.legacyAction
          : null,
      reasonCode:
        typeof parsed.reasonCode === 'string' && parsed.reasonCode.length > 0 ? parsed.reasonCode : null,
      selectedRegion:
        typeof parsed.selectedRegion === 'string' && parsed.selectedRegion.length > 0
          ? parsed.selectedRegion
          : null,
      selectedRunner:
        typeof parsed.selectedRunner === 'string' && parsed.selectedRunner.length > 0
          ? parsed.selectedRunner
          : null,
      policyTrace:
        parsed.policyTrace && typeof parsed.policyTrace === 'object'
          ? (parsed.policyTrace as Record<string, unknown>)
          : {},
      carbonReductionPct:
        typeof parsed.carbonReductionPct === 'number' ? parsed.carbonReductionPct : null,
      waterImpactDeltaLiters:
        typeof parsed.waterImpactDeltaLiters === 'number' ? parsed.waterImpactDeltaLiters : null,
      latencyMs: latency,
      estimatedEnergyKwh:
        typeof parsed.estimatedEnergyKwh === 'number' ? parsed.estimatedEnergyKwh : null,
    }
  } catch {
    return {
      decisionFrameId: null,
      proofId: null,
      proofHash: null,
      decisionMode: null,
      action: null,
      legacyAction: null,
      reasonCode: null,
      selectedRegion: null,
      selectedRunner: null,
      policyTrace: {},
      carbonReductionPct: null,
      waterImpactDeltaLiters: null,
      latencyMs: null,
      estimatedEnergyKwh: null,
    }
  }
}

export function toLegacyExecutionAction(action: CanonicalDecisionAction) {
  return action === 'run_now' ? 'execute' : action
}

export function buildDekesDecisionSurface(response: CanonicalDekesDecisionSurfaceInput) {
  return {
    decisionId: response.decisionFrameId,
    decisionFrameId: response.decisionFrameId,
    action: response.decision,
    legacyAction: toLegacyExecutionAction(response.decision),
    decisionMode: response.decisionMode,
    selectedRegion: response.selectedRegion,
    target: response.selectedRegion,
    selectedRunner: response.selectedRunner,
    reasonCode: response.reasonCode,
    signalConfidence: response.signalConfidence,
    predicted_clean_window: response.notBefore,
    carbonDelta: Number(
      (response.baseline.carbonIntensity - response.selected.carbonIntensity).toFixed(6)
    ),
    carbonReductionPct: response.savings.carbonReductionPct,
    waterImpactDeltaLiters: response.savings.waterImpactDeltaLiters,
    proofHash: response.proofHash,
    proofId: response.proofRecord.job_id,
    policyAction: response.decision,
    policyTrace: response.policyTrace,
    executable:
      response.decisionMode === 'runtime_authorization'
        ? Boolean(response.enforcementBundle?.githubActions?.executable)
        : false,
    enforcement: response.enforcementBundle ?? null,
    latencyMs: response.latencyMs ?? null,
    artifactLinks: buildDekesArtifactLinks(response.decisionFrameId),
    timestamp: new Date().toISOString(),
  }
}

export function toDekesHandoffStatus(status: string | null | undefined): HandoffStatus {
  const normalized = status?.trim().toUpperCase()
  if (!normalized) return 'queued'
  if (['FAILED', 'DENIED', 'ERROR'].includes(normalized)) return 'failed'
  if (['IGNORED', 'NO_ACTION', 'SKIPPED'].includes(normalized)) return 'ignored'
  if (['ROUTED', 'SENT', 'ACCEPTED', 'PROOFED', 'CONVERTED', 'COMPLETED', 'REPORTED'].includes(normalized)) {
    return 'processed'
  }
  if (['PROCESSING', 'PENDING_DELIVERY'].includes(normalized)) return 'processing'
  return 'queued'
}

export function toDekesQualityTier(signalConfidence: number | null | undefined): QualityTier {
  if (signalConfidence == null) return 'low'
  if (signalConfidence >= 0.85) return 'high'
  if (signalConfidence >= 0.68) return 'medium'
  return 'low'
}

export function toDekesForecastStability(input: {
  fallbackUsed?: boolean | null
  lowConfidence?: boolean | null
  signalConfidence?: number | null
}): ForecastStability {
  if (input.fallbackUsed || input.lowConfidence) return 'unstable'
  const tier = toDekesQualityTier(input.signalConfidence)
  if (tier === 'high') return 'stable'
  if (tier === 'medium') return 'medium'
  return 'unstable'
}

export function toDekesHandoffEventType(input: {
  action?: string | null
  fallbackUsed?: boolean | null
  lowConfidence?: boolean | null
  signalConfidence?: number | null
  baselineCarbonIntensity?: number | null
  selectedCarbonIntensity?: number | null
}) : HandoffEventType {
  if (input.action === 'delay') return 'POLICY_DELAY'
  if (input.action === 'deny') return 'POLICY_BLOCK'
  if (input.fallbackUsed || input.lowConfidence) return 'LOW_CONFIDENCE_REGION'

  if (
    input.baselineCarbonIntensity != null &&
    input.selectedCarbonIntensity != null &&
    input.baselineCarbonIntensity - input.selectedCarbonIntensity >= 100
  ) {
    return 'CLEAN_WINDOW_OPPORTUNITY'
  }

  if (input.selectedCarbonIntensity != null && input.selectedCarbonIntensity >= 400) {
    return 'HIGH_CARBON_PATTERN'
  }

  return 'ROUTING_POLICY_INSIGHT'
}

export function toDekesHandoffSeverity(
  eventType: HandoffEventType,
  action?: string | null
): HandoffSeverity {
  if (eventType === 'POLICY_BLOCK' || action === 'deny') return 'critical'
  if (eventType === 'LOW_CONFIDENCE_REGION' || eventType === 'HIGH_CARBON_PATTERN') return 'high'
  if (eventType === 'POLICY_DELAY' || action === 'throttle') return 'medium'
  return 'low'
}

export function toDekesHandoffClassification(
  eventType: HandoffEventType
): HandoffClassification {
  if (
    eventType === 'POLICY_BLOCK' ||
    eventType === 'LOW_CONFIDENCE_REGION' ||
    eventType === 'HIGH_CARBON_PATTERN' ||
    eventType === 'EXECUTION_DRIFT_RISK'
  ) {
    return 'risk'
  }

  if (eventType === 'CLEAN_WINDOW_OPPORTUNITY') {
    return 'opportunity'
  }

  return 'informational'
}
