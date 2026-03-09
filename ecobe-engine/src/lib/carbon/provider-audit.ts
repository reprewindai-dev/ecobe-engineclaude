/**
 * Provider audit.
 *
 * Every routing/forecast decision powered by the multi-provider layer writes
 * a structured log entry here.  When governance audit is enabled the entry
 * is also written to the tamper-evident GovernanceAuditLog chain so the
 * choice of provider for every decision is permanently on-ledger.
 *
 * This satisfies rule #7: every routing/forecast decision must log which
 * provider powered it and whether fallback/validation was used.
 */

import { CarbonSignal } from './types'
import { writeAuditLog } from '../governance/audit'
import { env } from '../../config/env'

export interface ProviderDecisionEvent {
  region: string
  mode: 'realtime' | 'forecast' | 'historical'
  primarySignal: CarbonSignal | null
  finalSignal: CarbonSignal
  validationSignal?: CarbonSignal | null
  organizationId?: string
}

/**
 * Emit a structured console log (always) and a governance audit entry
 * (when GOVERNANCE_AUDIT_ENABLED=true) for a provider decision.
 */
export function auditProviderDecision(event: ProviderDecisionEvent): void {
  const entry = {
    region: event.region,
    mode: event.mode,
    selected_source: event.finalSignal.source,
    fallback_used: event.finalSignal.fallback_used,
    validation_used: event.finalSignal.validation_used,
    disagreement_flag: event.finalSignal.disagreement_flag,
    disagreement_pct: event.finalSignal.disagreement_pct,
    intensity_gco2_per_kwh: event.finalSignal.intensity_gco2_per_kwh,
    confidence: event.finalSignal.confidence,
    data_quality: event.finalSignal.data_quality,
    primary_source: event.primarySignal?.source ?? null,
    primary_intensity: event.primarySignal?.intensity_gco2_per_kwh ?? null,
    validation_source: event.validationSignal?.source ?? null,
    validation_intensity: event.validationSignal?.intensity_gco2_per_kwh ?? null,
  }

  if (env.NODE_ENV !== 'test') {
    console.log('[carbon-provider]', JSON.stringify(entry))
  }

  // Write to tamper-evident chain — fire and forget
  if (env.GOVERNANCE_AUDIT_ENABLED) {
    void writeAuditLog({
      organizationId: event.organizationId ?? 'system',
      actorId: 'carbon-provider-router',
      actorType: 'SYSTEM',
      action: 'CARBON_SIGNAL_SELECTED',
      entityType: 'CarbonSignal',
      entityId: `${event.region}:${event.mode}:${event.finalSignal.fetched_at}`,
      payload: entry,
      result: 'SUCCESS',
    })
  }
}
