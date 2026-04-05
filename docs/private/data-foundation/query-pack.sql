-- CO2 Router canonical query pack
-- Target database: Postgres backing the canonical ecobe-engine Prisma schema
-- Purpose: internal analytics, design-partner evidence, and operational review

-- 1. Daily decision volume, action mix, and signal confidence
SELECT
  DATE_TRUNC('day', "createdAt") AS day,
  COALESCE("decisionAction", 'unknown') AS decision_action,
  COUNT(*) AS decisions,
  ROUND(AVG("carbonIntensity")::numeric, 2) AS avg_carbon_intensity_g_per_kwh,
  ROUND(AVG("savings")::numeric, 2) AS avg_savings_pct,
  ROUND(AVG(COALESCE("signalConfidence", 0))::numeric, 3) AS avg_signal_confidence
FROM "CIDecision"
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- 2. Region mix and fallback rate by day
SELECT
  DATE_TRUNC('day', "createdAt") AS day,
  "selectedRegion" AS selected_region,
  COUNT(*) AS decisions,
  SUM(CASE WHEN "fallbackUsed" THEN 1 ELSE 0 END) AS fallback_decisions,
  ROUND(
    AVG(CASE WHEN "fallbackUsed" THEN 1.0 ELSE 0.0 END)::numeric,
    4
  ) AS fallback_rate
FROM "CIDecision"
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- 3. Governance zone and reason-code distribution from persisted policy trace
SELECT
  DATE_TRUNC('day', "createdAt") AS day,
  COALESCE("policyTrace" -> 'sekedPolicy' ->> 'zone', 'none') AS seked_zone,
  COALESCE("reasonCode", 'unknown') AS reason_code,
  COUNT(*) AS decisions
FROM "CIDecision"
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;

-- 4. Water authority posture and stress by day
SELECT
  DATE_TRUNC('day', "createdAt") AS day,
  COALESCE("waterAuthorityMode", 'unknown') AS water_authority_mode,
  COUNT(*) AS decisions,
  ROUND(AVG(COALESCE("waterStressIndex", 0))::numeric, 3) AS avg_water_stress_index,
  ROUND(AVG(COALESCE("waterImpactLiters", 0))::numeric, 3) AS avg_water_impact_liters
FROM "CIDecision"
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- 5. Trace and proof coverage for decision frames
SELECT
  DATE_TRUNC('day', d."createdAt") AS day,
  COUNT(*) AS decisions,
  SUM(CASE WHEN d."proofHash" IS NOT NULL THEN 1 ELSE 0 END) AS proof_attached,
  SUM(CASE WHEN t."decisionFrameId" IS NOT NULL THEN 1 ELSE 0 END) AS trace_attached,
  ROUND(
    AVG(CASE WHEN t."decisionFrameId" IS NOT NULL THEN 1.0 ELSE 0.0 END)::numeric,
    4
  ) AS trace_coverage_rate
FROM "CIDecision" d
LEFT JOIN "DecisionTraceEnvelope" t
  ON t."decisionFrameId" = d."decisionFrameId"
GROUP BY 1
ORDER BY 1 DESC;

-- 6. Trace hash-chain continuity check
SELECT
  current_trace."sequenceNumber" AS sequence_number,
  current_trace."decisionFrameId" AS decision_frame_id,
  current_trace."previousTraceHash" AS recorded_previous_trace_hash,
  previous_trace."traceHash" AS expected_previous_trace_hash
FROM "DecisionTraceEnvelope" current_trace
LEFT JOIN "DecisionTraceEnvelope" previous_trace
  ON previous_trace."sequenceNumber" = current_trace."sequenceNumber" - 1
WHERE current_trace."sequenceNumber" > 1
  AND current_trace."previousTraceHash" IS DISTINCT FROM previous_trace."traceHash"
ORDER BY current_trace."sequenceNumber" DESC;

-- 7. Outbox delivery health and retry pressure
SELECT
  "status",
  COUNT(*) AS rows,
  ROUND(AVG("attemptCount")::numeric, 2) AS avg_attempts,
  MAX("createdAt") AS latest_created_at,
  MAX("processedAt") AS latest_processed_at
FROM "DecisionEventOutbox"
GROUP BY "status"
ORDER BY rows DESC;

-- 8. Carbon savings ledger by org and day
SELECT
  DATE_TRUNC('day', "createdAt") AS day,
  "orgId" AS org_id,
  COUNT(*) AS ledger_rows,
  ROUND(SUM("carbonSavedG")::numeric / 1000, 3) AS carbon_saved_kg,
  ROUND(SUM(COALESCE("verifiedSavingsG", 0))::numeric / 1000, 3) AS verified_savings_kg,
  ROUND(AVG(COALESCE("confidenceScore", 0))::numeric, 3) AS avg_confidence_score,
  ROUND(
    AVG(CASE WHEN "fallbackUsed" THEN 1.0 ELSE 0.0 END)::numeric,
    4
  ) AS fallback_rate
FROM "CarbonLedgerEntry"
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- 9. Candidate rejection reasons and feasible-region pressure
SELECT
  DATE_TRUNC('day', "createdAt") AS day,
  COALESCE("rejectionReason", 'selected_or_unrejected') AS rejection_reason,
  COUNT(*) AS candidates,
  ROUND(AVG(COALESCE("latencyEstimateMs", 0))::numeric, 2) AS avg_latency_estimate_ms,
  ROUND(AVG(COALESCE("carbonEstimateGPerKwh", 0))::numeric, 2) AS avg_carbon_estimate
FROM "RoutingCandidate"
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- 10. Provider freshness and confidence from mirrored/provider snapshots
SELECT
  "provider",
  "zone",
  "signalType",
  MAX("observedAt") AS latest_observed_at,
  ROUND(EXTRACT(EPOCH FROM NOW() - MAX("observedAt"))::numeric, 0) AS freshness_sec,
  ROUND(AVG(COALESCE("confidence", 0))::numeric, 3) AS avg_confidence
FROM "ProviderSnapshot"
GROUP BY 1, 2, 3
ORDER BY freshness_sec DESC NULLS LAST, "provider", "zone";

-- 11. Water-provider coverage and dataset freshness
SELECT
  "provider",
  "region",
  "scenario",
  "authorityMode",
  MAX("observedAt") AS latest_observed_at,
  ROUND(EXTRACT(EPOCH FROM NOW() - MAX("observedAt"))::numeric, 0) AS freshness_sec,
  ROUND(AVG(COALESCE("confidence", 0))::numeric, 3) AS avg_confidence
FROM "WaterProviderSnapshot"
GROUP BY 1, 2, 3, 4
ORDER BY freshness_sec DESC NULLS LAST, "provider", "region";
