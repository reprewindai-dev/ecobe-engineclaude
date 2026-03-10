# CO₂ Router — Dashboard API Contract & Build Plan

> Phase: Freeze engine scope. Contract-grade output only.
> Generated from source audit of all route and lib files.

---

## PART 1 — API CONTRACT

### GROUP: ROUTING

---

#### `POST /api/v1/route/green`

**Used by:** Live Decision Stream, Hero KPI (executes feed), System State, DEKES Impact (via source field), Policy Enforcement

**Auth:** `x-api-key` header

**Request body:**
```json
{
  "preferredRegions": ["string"],        // required unless candidateRegions present
  "candidateRegions": ["string"],        // DEKES alias for preferredRegions; same semantics
  "maxCarbonGPerKwh": 200,              // optional; org policy ceiling applied on top
  "latencyMsByRegion": { "FR": 42 },   // optional; per-region latency hints
  "carbonWeight": 0.5,                  // optional; 0–1; default 0.5
  "latencyWeight": 0.2,                 // optional; 0–1; default 0.2
  "costWeight": 0.3,                    // optional; 0–1; default 0.3
  "targetTime": "2026-03-09T14:00:00Z",// optional; ISO-8601 datetime
  "durationMinutes": 60,                // optional; workload duration
  "source": "DEKES",                    // optional; workload producer tag
  "workloadType": "batch",              // optional; free-text workload classification
  "policyMode": "strict_carbon",        // optional; enum: strict_carbon | balanced_ops | budget_recovery
  "delayToleranceMinutes": 120,         // optional; 0–1440
  "organizationId": "org_abc"          // optional; overridden by x-organization-id header
}
```

**Response 200 — execute:**
```json
{
  "action": "execute",
  "selectedRegion": "FR",                    // realtime; chosen region code
  "carbonIntensity": 58,                     // realtime; gCO2eq/kWh for selectedRegion
  "score": 0.847,                            // derived; 0–1 composite score
  "qualityTier": "high",                     // derived; enum: high | medium | low
  "explanation": "FR selected...",           // derived; human-readable string
  "carbon_delta_g_per_kwh": 165,             // derived; baseline_ci − selected_ci
  "forecast_stability": "stable",            // derived; enum: stable | medium | unstable | null
  "provider_disagreement": {                 // realtime; null when validation disabled
    "flag": false,
    "pct": 3.2
  },
  "confidenceBand": {                        // forecasted; null on live path
    "low": 52,
    "mid": 58,
    "high": 71,
    "empirical": true
  },
  "dataResolutionMinutes": 60,               // realtime; native signal resolution
  "decisionFrameId": "uuid",                 // derived; links snapshot + lease
  "forecastAvailable": true,                 // realtime
  "estimatedLatency": 42,                    // derived; optional
  "alternatives": [                          // realtime
    {
      "region": "DE",
      "carbonIntensity": 223,
      "score": 0.412,
      "reason": "optional string"
    }
  ],
  "predicted_clean_window": {                // forecasted; optional; null when unavailable
    "startTime": "2026-03-09T18:00:00Z",
    "endTime": "2026-03-09T22:00:00Z",
    "avgCarbonIntensity": 41,
    "savings": 29.3
  },
  "lease_id": "uuid",                        // derived; same as decisionFrameId
  "lease_expires_at": "2026-03-09T14:30:00Z", // derived; ISO-8601
  "must_revalidate_after": "2026-03-09T14:20:00Z" // derived; ISO-8601
}
```

**Response 202 — delay (policy violation):**
```json
{
  "action": "delay",
  "reason": "carbon_policy_violation",
  "policy": {
    "maxCarbonGPerKwh": 150,
    "requireGreenRouting": true
  },
  "currentBest": {
    "region": "US-CAL-CISO",
    "carbonIntensity": 312
  },
  "retryAfterMinutes": 120,
  "message": "string"
}
```

**Nullable fields:** `estimatedLatency`, `confidenceBand`, `dataResolutionMinutes`, `decisionFrameId`, `predicted_clean_window`, `provider_disagreement`, `forecast_stability`, `lease_id`, `lease_expires_at`, `must_revalidate_after`

**Enum values:**
- `qualityTier`: `high` | `medium` | `low`
- `forecast_stability`: `stable` | `medium` | `unstable` | `null`
- `action` (202): `delay`
- `policyMode` (req): `strict_carbon` | `balanced_ops` | `budget_recovery`

---

#### `POST /api/v1/route/:id/revalidate`

**Used by:** Execution Integrity panel

**Auth:** `x-api-key`, `x-organization-id`

**Path param:** `id` — lease_id / decisionFrameId

**Request body:** none

**Response 200:**
```json
{
  "action": "execute",
  "reason": "lease_valid",
  "region": "FR",
  "carbonIntensity": 58,
  "driftDetected": false,
  "lease_expires_at": "2026-03-09T14:30:00Z",
  "originalRegion": "FR"
}
```

**Response 200 — reroute:**
```json
{
  "action": "reroute",
  "reason": "cleaner_region_found",
  "region": "SE",
  "carbonIntensity": 12,
  "originalRegion": "FR",
  "driftDetected": true,
  "lease_expires_at": "2026-03-09T14:30:00Z"
}
```

**Response 403:**
```json
{ "action": "deny", "reason": "lease_not_found | access_denied | lease_expired" }
```

**Enum values:**
- `action`: `execute` | `reroute` | `delay` | `deny`
- `reason`: `lease_valid` | `cleaner_region_found` | `decision_confirmed` | `lease_not_found` | `access_denied` | `routing_unavailable`

---

#### `GET /api/v1/route/:id/replay`

**Used by:** Decision Replay panel

**Auth:** `x-api-key`, `x-organization-id`

**Path param:** `id` — decisionFrameId

**Response 200:**
```json
{
  "decisionFrameId": "uuid",
  "replayedAt": "2026-03-09T14:00:00Z",        // realtime; time of replay call
  "request": {
    "regions": ["FR", "DE"],                    // historical; as submitted
    "targetTime": "2026-03-09T12:00:00Z",       // historical; nullable
    "durationMinutes": 60,                       // historical; nullable
    "maxCarbonGPerKwh": 200,                    // historical; nullable
    "weights": { "carbon": 0.5, "latency": 0.2, "cost": 0.3 } // historical
  },
  "signals": {                                  // historical; signal state at decision time
    "FR": {
      "intensity": 58,
      "source": "electricity_maps",
      "fallbackUsed": false,
      "disagreementFlag": false
    }
  },
  "selectedRegion": "FR",                       // historical
  "carbonIntensity": 58,                        // historical
  "baselineIntensity": 223,                     // historical; derived; max across all candidates
  "carbon_delta_g_per_kwh": 165,               // historical
  "qualityTier": "high",                        // historical
  "forecast_stability": "stable",               // historical; nullable
  "score": 0.847,                               // historical
  "explanation": "string",                      // historical
  "sourceUsed": "electricity_maps",             // historical; nullable
  "referenceTime": "2026-03-09T12:00:00Z",     // historical
  "fallbackUsed": false,                        // historical
  "providerDisagreement": false,                // historical
  "source": "DEKES",                            // historical; nullable
  "workloadType": "batch",                      // historical; nullable
  "policyMode": "strict_carbon",               // historical; nullable
  "delayToleranceMinutes": 120,                // historical; nullable
  "predictedCleanWindow": null,                // historical; nullable
  "createdAt": "2026-03-09T12:00:00Z"         // historical
}
```

**404:** `{ "error": "Decision snapshot not found" }`
**403:** `{ "error": "Access denied" }`

---

### GROUP: SCHEDULING (Forecasting)

---

#### `GET /api/v1/forecasting/:region/forecasts`

**Used by:** Carbon Opportunity Timeline

**Query params:**
- `hoursAhead`: integer 1–168, default 24

**Response 200:**
```json
{
  "region": "FR",
  "hoursAhead": 24,
  "forecasts": [
    {
      "forecastTime": "2026-03-09T15:00:00Z",  // forecasted
      "intensity_gco2_per_kwh": 61,             // forecasted
      "source": "electricity_maps"              // realtime
    }
  ]
}
```

**Field meanings:** `forecasts` array is ordered by `forecastTime` ascending. Shape of each item depends on provider (Electricity Maps returns forecast arrays; Ember returns hourly actuals).

---

#### `GET /api/v1/forecasting/:region/optimal-window`

**Used by:** Carbon Opportunity Timeline, DEKES scheduling decisions

**Query params:**
- `durationHours`: integer 1–72, default 4
- `lookAheadHours`: integer 1–168, default 48

**Response 200:**
```json
{
  "region": "FR",
  "durationHours": 4,
  "lookAheadHours": 48,
  "window": {
    "startTime": "2026-03-09T20:00:00Z",   // forecasted
    "endTime": "2026-03-10T00:00:00Z",     // forecasted
    "avgCarbonIntensity": 41,               // forecasted; gCO2/kWh
    "savings": 29.3                         // derived; % vs current intensity
  }
}
```

---

### GROUP: REPLAY

See `GET /api/v1/route/:id/replay` above.

---

### GROUP: BUDGETS

---

#### `POST /api/v1/budgets`

**Used by:** Carbon Budgets panel (create/reset)

**Request body:**
```json
{
  "organizationId": "org_abc",            // required; alphanumeric + _-; max 128
  "budgetCO2Grams": 50000000,             // required; positive float; total CO2 budget in grams
  "budgetPeriod": "monthly",              // optional; enum; default monthly
  "periodStart": "2026-03-01T00:00:00Z", // optional; ISO-8601 datetime; defaults to now
  "warningThresholdPct": 0.8              // optional; 0–1; default 0.8
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "organizationId": "org_abc",
  "budgetPeriod": "monthly",
  "periodStart": "2026-03-01T00:00:00Z",
  "periodEnd": "2026-03-31T00:00:00Z",
  "budgetCO2Grams": 50000000,
  "consumedCO2Grams": 0,
  "warningThresholdPct": 0.8,
  "createdAt": "2026-03-09T12:00:00Z"
}
```

**Enum values:** `budgetPeriod`: `monthly` | `quarterly` | `annual`

---

#### `GET /api/v1/budgets/:organizationId`

**Used by:** Carbon Budgets panel (status bar)

**Response 200:**
```json
{
  "organizationId": "org_abc",
  "status": "within",                    // derived; enum
  "budgetCO2Grams": 50000000,           // historical
  "consumedCO2Grams": 12345678,         // historical; running total
  "remainingCO2Grams": 37654322,        // derived
  "utilizationPct": 24.7,               // derived; 0–100
  "periodStart": "2026-03-01T00:00:00Z",
  "periodEnd": "2026-03-31T00:00:00Z",
  "warningThresholdPct": 0.8
}
```

**404:** `{ "message": "No active budget period for this organization", "organizationId": "org_abc" }`

**Enum values:** `status`: `within` | `warning` | `exceeded`

---

#### `GET /api/v1/budgets/:organizationId/history`

**Used by:** Carbon Budgets panel (history chart)

**Response 200:**
```json
{
  "organizationId": "org_abc",
  "records": [
    {
      "id": "uuid",
      "budgetPeriod": "monthly",
      "periodStart": "2026-02-01T00:00:00Z",
      "periodEnd": "2026-02-28T00:00:00Z",
      "budgetCO2Grams": 50000000,
      "consumedCO2Grams": 48123456,
      "warningThresholdPct": 0.8,
      "createdAt": "2026-02-01T00:00:00Z"
    }
  ]
}
```

Max 24 records, ordered by `periodStart` desc.

---

### GROUP: SCORECARDS

---

#### `GET /api/v1/intelligence/scorecards`

**Used by:** Forecast Accuracy / Scorecards panel

**Response 200:**
```json
{
  "scorecards": [
    {
      "region": "FR",
      "mae24h": 8.2,                    // historical; Mean Absolute Error gCO2/kWh, 24h horizon
      "mae48h": 11.4,                   // historical; nullable
      "mae72h": 15.1,                   // historical; nullable
      "mape24h": 0.082,                 // historical; 0–1 fraction; nullable
      "mape48h": 0.114,                 // historical; nullable
      "mape72h": 0.151,                 // historical; nullable
      "fallbackRate": 0.03,             // historical; fraction of decisions using fallback
      "staleRejectionRate": 0.01,       // historical
      "providerDisagreementRate": 0.05, // historical
      "forecastHitRate": 0.91,          // historical
      "reliabilityTier": "high",        // derived; enum
      "sampleCount": 847,               // historical
      "lastComputedAt": "2026-03-09T06:00:00Z" // historical; nullable
    }
  ],
  "count": 12
}
```

**Nullable fields:** all `mae*`, `mape*`, `lastComputedAt`

**Enum values:** `reliabilityTier`: `high` | `medium` | `low` | `unknown`

---

#### `GET /api/v1/intelligence/patterns`

**Used by:** Carbon Opportunity Timeline (heat calendar)

**Query params:**
- `region`: required; comma-separated region codes, e.g. `FR,SE,DE`

**Response 200:**
```json
{
  "patterns": [
    {
      "region": "FR",
      "slotCount": 168,
      "slots": [
        {
          "hourOfWeek": 0,               // 0=Mon 00:00 UTC … 167=Sun 23:00 UTC
          "label": "Mon 00:00 UTC",
          "avgIntensity": 62.3,          // historical; gCO2/kWh
          "p10Intensity": 41.0,          // historical
          "p50Intensity": 61.5,          // historical
          "p90Intensity": 88.2,          // historical
          "stddev": 14.7,                // historical
          "sampleCount": 82              // historical
        }
      ]
    }
  ]
}
```

---

#### `POST /api/v1/intelligence/predict-opportunity`

**Used by:** Carbon Opportunity Timeline (opportunity score overlay)

**Request body:**
```json
{
  "region": "FR",
  "targetHourOfWeek": 42,   // optional; 0–167; defaults to current hour-of-week + 1
  "durationHours": 4         // optional; 1–72; default 4
}
```

**Response 200:**
```json
{
  "region": "FR",
  "fromHourOfWeek": 42,
  "durationHours": 4,
  "opportunityScore": 0.72,           // derived; 0–1 probability of meaningful drop
  "expectedAvgIntensity": 54.1,       // historical; gCO2/kWh across window
  "expectedP10Intensity": 38.4,       // historical; optimistic bound
  "vsRegionAvg": -18.3,               // derived; negative = cleaner than region average
  "confidence": "high",               // derived; enum
  "bestSlotHourOfWeek": 44,
  "bestSlotLabel": "Tue 20:00 UTC"
}
```

**Enum values:** `confidence`: `high` | `medium` | `low` | `insufficient_data`

---

#### `POST /api/v1/intelligence/best-window`

**Used by:** Carbon Opportunity Timeline (schedule recommendation)

**Request body:**
```json
{
  "region": "FR",
  "durationHours": 4,       // optional; 1–72; default 4
  "lookAheadHours": 48      // optional; 1–168; default 48
}
```

**Response 200:**
```json
{
  "region": "FR",
  "startHourOfWeek": 44,
  "startLabel": "Tue 20:00 UTC",
  "durationHours": 4,
  "expectedAvgIntensity": 41.2,   // historical; gCO2/kWh
  "expectedP10Intensity": 30.1,   // historical
  "vsRegionAvg": -28.1,           // derived; % change vs region 24h avg
  "score": 0.88,                  // derived; 0–1 composite
  "lookAheadMinutes": 480         // derived; minutes from now until window starts
}
```

**404:** `{ "error": "Insufficient pattern data for region", "region": "FR", "hint": "..." }`

---

### GROUP: METHODOLOGY

---

#### `GET /api/v1/methodology`

**Used by:** Methodology panel (static; human-readable trust doc)

**Auth:** None (public)

**Response 200:** Large static JSON doc with fields:
```json
{
  "version": "2d",
  "name": "string",
  "description": "string",
  "design_philosophy": { ... },
  "scoring": {
    "formula": "string",
    "defaults": { "carbonWeight": 0.5, "latencyWeight": 0.2, "costWeight": 0.3 },
    "resolution_penalty": { ... }
  },
  "confidence_bands": { ... },
  "ranking_stability": { ... },
  "quality_tiers": { ... },
  "decision_confidence": { ... },
  "data_model": { ... },
  "forecast_scorecard": { ... },
  "provider_config": {
    "primary": "electricity_maps",
    "validation": "ember",
    "fallback_allowed": true,
    "max_staleness_minutes": 60,
    "disagreement_threshold_pct": 15
  },
  "generated_at": "2026-03-09T14:00:00Z"
}
```

All fields: **historical/static** (config-driven, not realtime).

---

#### `GET /api/v1/methodology/providers`

**Used by:** Provider Health panel

**Auth:** None (public)

**Response 200:**
```json
{
  "providers": [
    {
      "name": "electricity_maps",
      "totalCalls": 12847,         // realtime; rolling since service start
      "successCalls": 12641,       // realtime
      "failureCalls": 206,         // realtime
      "avgLatencyMs": 284,         // realtime
      "lastError": "string",       // realtime; nullable
      "lastSuccessAt": "ISO-8601", // realtime; nullable
      "lastFailureAt": "ISO-8601"  // realtime; nullable
    }
  ],
  "note": "string",
  "generated_at": "2026-03-09T14:00:00Z"
}
```

---

### GROUP: GOVERNANCE

---

#### `GET /api/v1/governance/audit`

**Used by:** Policy Enforcement panel (audit trail table)

**Query params:**
- `organizationId`: optional
- `limit`: default 50
- `offset`: default 0

**Response 200:**
```json
{
  "records": [
    {
      "id": "uuid",
      "sequence": 4821,
      "organizationId": "org_abc",       // nullable
      "actorType": "API_KEY",
      "action": "DECISION_CREATED",
      "entityType": "DashboardRoutingDecision",
      "entityId": "uuid",
      "payload": {},
      "result": "SUCCESS",
      "riskTier": "LOW",
      "carbonSavedG": 12345,             // nullable
      "chainHash": "sha256hex",
      "previousHash": "sha256hex",       // nullable; null for genesis
      "createdAt": "ISO-8601"
    }
  ],
  "count": 50
}
```

**Enum values:**
- `actorType`: `API_KEY` | `SYSTEM`
- `action`: `DECISION_CREATED` | `POLICY_UPDATED` | `CREDIT_PURCHASED` | `CREDIT_RETIRED` | `CREDIT_AUTO_OFFSET` | `ORG_KEY_ISSUED` | `ORG_KEY_REVOKED` | `ANOMALY_DETECTED` | `CHAIN_VERIFIED`
- `result`: `SUCCESS` | `FAILURE` | `BLOCKED`
- `riskTier`: `LOW` | `MEDIUM` | `HIGH`

---

#### `GET /api/v1/governance/audit/verify`

**Used by:** Execution Integrity panel (chain integrity badge)

**Auth:** `x-api-key`

**Response 200:**
```json
{
  "intact": true,
  "brokenAt": null,       // nullable; sequence number where break detected
  "checkedCount": 4821,
  "verifiedAt": "2026-03-09T14:00:00Z"
}
```

---

#### `GET /api/v1/governance/insights`

**Used by:** Carbon Savings / Impact panel, Policy Enforcement panel

**Query params:**
- `organizationId`: required
- `windowDays`: default 30

**Response 200:**
```json
{
  "windowDays": 30,
  "totalDecisions": 1247,
  "totalCO2SavedG": 45231000,
  "totalCO2EmittedG": 12847000,
  "totalCO2OffsetG": 8000000,
  "offsetPercentage": 62.3,
  "credits": {
    "active": 5000000,
    "retired": 8000000
  },
  "complianceScore": 94
}
```

**Field meanings:**
- `totalCO2SavedG`: baseline − chosen across all DashboardRoutingDecision records; **derived from DashboardRoutingDecision table**
- `complianceScore`: 0–100 integer; derived from audit ratio

---

#### `GET /api/v1/governance/policy`

**Used by:** Policy Enforcement panel (current policy state)

**Query params:** `organizationId` required

**Response 200:**
```json
{
  "id": "uuid",
  "organizationId": "org_abc",
  "tier": "STANDARD",
  "maxCarbonGPerKwh": 150,             // nullable
  "requireGreenRouting": false,
  "autoOffsetEnabled": false,
  "autoOffsetThresholdG": null,        // nullable
  "anomalyDetectionEnabled": true,
  "anomalyThresholdSigma": 2.0,        // nullable
  "policyVersion": "2026-03-09",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

**Enum values:** `tier`: `BASIC` | `STANDARD` | `PREMIUM` | `INVESTOR_GRADE`

---

### GROUP: PROVIDER HEALTH

See `GET /api/v1/methodology/providers` above.

---

### GROUP: INTEGRATION SOURCES (including DEKES)

---

#### `GET /api/v1/dekes/health`

**Used by:** Integration Sources panel (status chip)

**Response 200:**
```json
{
  "status": "ok",
  "service": "DEKES Integration",
  "timestamp": "2026-03-09T14:00:00Z"
}
```

---

#### `GET /api/v1/dekes/analytics`

**Used by:** DEKES Impact card, Integration Sources panel

**Response 200:**
```json
{
  "totalWorkloads": 847,
  "completedWorkloads": 801,
  "pendingWorkloads": 46,
  "totalCO2SavedG": 12341.5,       // derived; vs 400 gCO2/kWh baseline; completed workloads only
  "avgActualCO2G": 0.0032,         // historical; average actual CO2 per completed workload (grams)
  "recentWorkloads": [
    {
      "id": "uuid",
      "queryString": "fintech leads UK",   // historical; nullable
      "selectedRegion": "FR",              // historical; nullable
      "actualCO2": 0.0028,                 // historical; nullable; grams
      "status": "COMPLETED",
      "createdAt": "2026-03-09T12:00:00Z"
    }
  ]
}
```

**Field meanings:**
- `totalCO2SavedG`: calculated as `sum( (estimatedResults/1000 * 0.0001 * 400) - actualCO2 )` for completed workloads with actualCO2 set. **NOT in gCO2/kWh — in total gCO2 saved.**
- `avgActualCO2G`: average `actualCO2` column from DekesWorkload table (grams total, not intensity)

**Enum values:** `status`: `PENDING` | `SCHEDULED` | `ROUTED` | `COMPLETED` | `FAILED` | `CANCELLED`

---

#### `POST /api/v1/dekes/optimize`

**Used by:** Integration Sources panel (on-demand optimize action)

**Request body:**
```json
{
  "query": { "id": "q_001", "query": "fintech leads UK", "estimatedResults": 1000 },
  "carbonBudget": 200,     // optional; max gCO2/kWh ceiling
  "regions": ["FR", "DE", "US-CAL-CISO"]
}
```

**Response 200:**
```json
{
  "queryId": "q_001",
  "selectedRegion": "FR",
  "carbonIntensity": 58,         // realtime; gCO2/kWh
  "estimatedCO2": 0.0000058,     // derived; grams total = estimatedKwh × intensity
  "estimatedKwh": 0.0000001,     // derived; = (estimatedResults/1000) × 0.0001
  "withinBudget": true,          // derived; carbonIntensity ≤ carbonBudget
  "savings": 73.9,               // derived; % vs worst candidate
  "alternatives": [
    { "region": "DE", "carbonIntensity": 223, "score": 0.412 }
  ],
  "workloadId": "uuid"           // historical; DekesWorkload row id
}
```

---

#### `POST /api/v1/dekes/schedule`

**Used by:** Integration Sources panel (batch scheduling)

**Request body:**
```json
{
  "queries": [{ "id": "q_001", "query": "string", "estimatedResults": 1000 }],
  "regions": ["FR", "DE"],
  "lookAheadHours": 24   // optional; 1–168; default 24
}
```

**Response 200:**
```json
{
  "totalQueries": 3,
  "schedule": [
    {
      "queryId": "q_001",
      "queryString": "string",
      "selectedRegion": "FR",
      "scheduledTime": "2026-03-09T20:00:00Z",      // forecasted
      "predictedCarbonIntensity": 41,                // forecasted; gCO2/kWh
      "estimatedCO2": 0.0000041,                     // derived
      "estimatedKwh": 0.0000001,                     // derived
      "savings": 29.3,                               // derived; % vs immediate execution
      "workloadId": "uuid",
      "explanation": "FR scheduled at 20:00 UTC: predicted 41 gCO2/kWh — 29% vs immediate..."
    }
  ]
}
```

---

#### `POST /api/v1/dekes/report`

**Used by:** Integration Sources panel (feedback loop close)

**Request body:**
```json
{
  "queryId": "q_001",
  "actualCO2": 0.0028   // actual grams CO2 emitted
}
```

**Response 200:** `{ "ok": true, "queryId": "q_001" }`
**Response 404:** `{ "error": "Workload not found or already completed" }`

---

#### `POST /api/v1/ci/carbon-route`

**Used by:** Integration Sources panel (CI section)

**Request body:**
```json
{
  "runners": [
    { "name": "ubuntu-latest-eu", "region": "FR" },
    { "name": "ubuntu-latest", "region": "US-CAL-CISO" }
  ],
  "workload_type": "build",    // optional; enum; default build
  "max_delay_minutes": 0,      // optional; 0–1440; default 0
  "carbon_weight": 0.7         // optional; 0–1; default 0.7
}
```

**Response 200:**
```json
{
  "selected_runner": "ubuntu-latest-eu",
  "selected_region": "FR",
  "carbon_intensity": 58,           // realtime; gCO2/kWh
  "baseline_intensity": 185,        // derived; average across all candidates
  "savings_pct": 68.6,              // derived
  "recommendation": "run_now",      // derived; enum
  "optimal_window": null,           // forecasted; nullable; present when recommendation=delay
  "workload_type": "build",
  "alternatives": [
    { "runner": "ubuntu-latest", "region": "US-CAL-CISO", "carbon_intensity": 312, "score": 0.22 }
  ],
  "timestamp": "2026-03-09T14:00:00Z"
}
```

**`optimal_window` shape (when non-null):**
```json
{
  "start": "2026-03-09T18:00:00Z",
  "end": "2026-03-09T19:00:00Z",
  "predicted_intensity": 41,
  "savings_pct": 29.3,
  "delay_minutes": 240
}
```

**Enum values:**
- `recommendation`: `run_now` | `delay`
- `workload_type`: `build` | `test` | `deploy` | `batch`

---

### GROUP: DASHBOARD SAVINGS

---

#### `GET /api/v1/dashboard/metrics`

**Used by:** System State, Hero KPI, Provider Health, Execution Integrity

**Query params:**
- `window`: `24h` | `7d`; default `24h`

**Response 200:**
```json
{
  "window": "24h",
  "windowHours": 24,
  "totalDecisions": 1247,          // historical
  "totalRequests": 84213,          // historical; sum of requestCount
  "co2SavedG": 45231000,           // derived; sum(baseline - chosen) where delta > 0
  "co2AvoidedPer1kRequestsG": 537, // derived
  "greenRouteRate": 0.94,          // derived; fraction of decisions where chosen < baseline
  "fallbackRate": 0.03,            // derived; fraction using fallback provider
  "topChosenRegion": "FR",         // derived; most frequently chosen region
  "p95LatencyDeltaMs": 42,         // derived; nullable; p95 of (actual - estimated latency)
  "dataFreshnessMaxSeconds": 180,  // derived; nullable; worst data age across decisions
  "electricityMapsSuccessRate": 0.983, // derived; nullable
  "electricityMaps": {
    "successRate": 0.983,          // derived
    "successCount": 12641,         // realtime
    "failureCount": 206,           // realtime
    "lastSuccessAt": "ISO-8601",   // realtime; nullable
    "lastFailureAt": "ISO-8601",   // realtime; nullable
    "lastError": "string"          // realtime; nullable
  },
  "forecastRefresh": {
    "totalRegions": 12,            // historical
    "successRegions": 11,          // historical
    "failRegions": 1,              // historical
    "lastRun": {
      "timestamp": "ISO-8601",     // historical
      "totalRegions": 12,
      "totalRecords": 2884,
      "totalForecasts": 2884,
      "status": "success",
      "message": null              // nullable
    }
  },
  "executionIntegrity": {
    "totalLeases": 1247,           // historical
    "valid": 1189,                 // historical
    "revalidated": 58,             // historical
    "driftDetected": 3,            // historical
    "driftPreventedPct": 94        // derived; integer
  }
}
```

---

#### `GET /api/v1/dashboard/savings`

**Used by:** Carbon Savings / Impact panel, Hero KPI

**Query params:**
- `window`: `24h` | `7d` | `30d`; default `7d`

**Response 200:**
```json
{
  "window": "7d",
  "windowHours": 168,
  "totalDecisions": 8741,
  "totalCO2SavedG": 312451000,        // derived
  "totalCO2BaselineG": 891230000,     // historical; sum of co2BaselineG
  "totalCO2ActualG": 578779000,       // historical; sum of co2ChosenG
  "savingsPct": 35.1,                 // derived
  "savedEquivalents": {
    "kmDriven": 1487,                 // derived; savedKg / 0.21
    "treeDays": 54411.8,              // derived; savedKg / 0.0575
    "savedKg": 312.45                 // derived
  },
  "byRegion": [
    {
      "region": "FR",
      "decisions": 4218,
      "co2SavedG": 189321000,
      "co2BaselineG": 512100000,
      "savingsPct": 37.0
    }
  ],
  "trend": [
    {
      "date": "2026-03-03",          // historical; YYYY-MM-DD bucket
      "co2SavedG": 44123000,
      "co2BaselineG": 127340000,
      "decisions": 1248
    }
  ]
}
```

---

#### `GET /api/v1/dashboard/decisions`

**Used by:** Live Decision Stream

**Query params:**
- `limit`: 1–500; default 100

**Response 200:**
```json
{
  "decisions": [
    {
      "id": "uuid",
      "organizationId": "org_abc",                // nullable
      "workloadName": "string",                   // nullable
      "opName": "string",                         // nullable
      "baselineRegion": "US-CAL-CISO",
      "chosenRegion": "FR",
      "zoneBaseline": "US-CAL-CISO",              // nullable; EM zone code
      "zoneChosen": "FR",                         // nullable
      "carbonIntensityBaselineGPerKwh": 312,      // nullable
      "carbonIntensityChosenGPerKwh": 58,         // nullable
      "estimatedKwh": 0.5,                        // nullable
      "co2BaselineG": 156000,                     // nullable
      "co2ChosenG": 29000,                        // nullable
      "reason": "string",                         // nullable
      "latencyEstimateMs": 42,                    // nullable
      "latencyActualMs": 45,                      // nullable
      "fallbackUsed": false,
      "dataFreshnessSeconds": 120,                // nullable
      "requestCount": 1,
      "meta": {},
      "createdAt": "2026-03-09T14:00:00Z"
    }
  ]
}
```

---

#### `GET /api/v1/dashboard/regions`

**Used by:** System State, Carbon Opportunity Timeline (region selector)

**Response 200:**
```json
{
  "regions": [
    {
      "code": "FR",
      "name": "France",
      "country": "FR",
      "carbonIntensityGPerKwh": 58,        // realtime; nullable; latest reading
      "fetchedAt": "2026-03-09T13:55:00Z"  // realtime; nullable
    }
  ]
}
```

---

#### `POST /api/v1/dashboard/what-if/intensities`

**Used by:** Carbon Opportunity Timeline (what-if region comparison)

**Request body:** `{ "zones": ["FR", "DE", "SE"] }`
Max 50 zones.

**Response 200:**
```json
{
  "intensities": [
    { "zone": "FR", "carbonIntensity": 58 },
    { "zone": "DE", "carbonIntensity": 223 }
  ]
}
```

---

#### `GET /api/v1/dashboard/region-mapping`

**Used by:** System State (cloud region → EM zone mapping table)

**Response 200:**
```json
{
  "mappings": [
    {
      "cloudRegion": "us-west-2",
      "zone": "US-CAL-CISO",
      "lastSeenAt": "2026-03-09T14:00:00Z",
      "carbonIntensityGPerKwh": 312,         // realtime; nullable
      "fetchedAt": "2026-03-09T13:55:00Z"   // realtime; nullable
    }
  ]
}
```

---

#### `POST /api/v1/workloads/complete`

**Used by:** Execution Integrity panel (completion feedback ingestion)

**Request body:**
```json
{
  "decision_id": "uuid",                            // required; lease_id from POST /route/green
  "organizationId": "org_abc",                      // optional; overridden by header
  "source": "DEKES",                                // optional
  "workloadType": "batch",                          // optional
  "executionRegion": "FR",                          // required
  "executionStart": "2026-03-09T14:00:00Z",        // required; ISO-8601
  "durationMinutes": 45,                            // optional
  "status": "completed",                            // required; enum
  "actualCarbonIntensityGPerKwh": 61               // optional; feeds forecast scorecard
}
```

**Response 200:**
```json
{
  "ok": true,
  "decision_id": "uuid",
  "leaseStatus": "EXECUTED"   // enum: EXECUTED | DRIFT_BLOCKED | not_found
}
```

**Enum values:**
- `status` (req): `completed` | `failed` | `cancelled`
- `leaseStatus` (resp): `EXECUTED` | `DRIFT_BLOCKED` | `not_found`

---

---

## PART 2 — DASHBOARD WIRING PLAN

All sections use base URL `/api/v1`. Refresh behavior assumes a polling dashboard (no WebSocket).

---

### HERO KPI: Carbon Reduction Multiplier

**Component:** `HeroKpi`

**Endpoints:**
- `GET /dashboard/savings?window=30d`
- `GET /dashboard/metrics?window=7d`

**Fields consumed:**
- `savings.totalCO2SavedG`, `savings.savingsPct`, `savings.savedEquivalents.kmDriven`
- `metrics.co2AvoidedPer1kRequestsG`, `metrics.greenRouteRate`, `metrics.totalRequests`

**Derived display value:** `savingsPct` displayed as "X% cleaner than baseline"; `kmDriven` as equivalency callout.

**Chart type:** Large stat card with equivalency strip.

**Refresh:** 60s poll.

**Empty state:** "No routing decisions recorded yet. Send your first request to POST /api/v1/route/green."

**Error state:** Cached last value with staleness indicator; "Data unavailable" banner.

---

### System State

**Component:** `SystemState`

**Endpoints:**
- `GET /dashboard/regions`
- `GET /dashboard/metrics?window=24h`
- `GET /methodology/providers`

**Fields consumed:**
- `regions[].code`, `regions[].carbonIntensityGPerKwh`, `regions[].fetchedAt`
- `metrics.fallbackRate`, `metrics.dataFreshnessMaxSeconds`, `metrics.electricityMaps.successRate`
- `providers[].name`, `providers[].avgLatencyMs`, `providers[].lastError`

**Filters:** None. Show all enabled regions.

**Chart type:** Region grid cards (intensity badge + freshness indicator).

**Refresh:** 30s poll (intensity data can be stale).

**Empty state:** "No regions configured."

**Error state:** Show last known intensity + "Stale" chip per region.

---

### Carbon Opportunity Timeline

**Component:** `CarbonOpportunityTimeline`

**Endpoints:**
- `GET /forecasting/:region/forecasts?hoursAhead=48`
- `GET /intelligence/patterns?region=FR,SE,DE`
- `POST /intelligence/predict-opportunity` (per region, on-demand)
- `POST /intelligence/best-window` (on user action)
- `POST /dashboard/what-if/intensities` (region comparison)

**Fields consumed:**
- `forecasts[].forecastTime`, `forecasts[].intensity_gco2_per_kwh`
- `patterns[].slots[].hourOfWeek`, `slots[].avgIntensity`, `slots[].p10Intensity`, `slots[].p90Intensity`
- `prediction.opportunityScore`, `prediction.vsRegionAvg`, `prediction.expectedAvgIntensity`
- `window.startLabel`, `window.expectedAvgIntensity`, `window.savings`, `window.lookAheadMinutes`

**Filters:** Region selector (multi); duration slider (1–24h).

**Chart type:** Line chart (forecast intensity overlay); heat calendar (168-slot heatmap per region); opportunity score bar.

**Refresh:** Forecast: 5 min poll. Patterns: 1h poll (recomputed nightly). Opportunity score: on filter change.

**Empty state:** "No forecast data available. Patterns require 90 days of historical readings."

**Error state:** Show "Forecast unavailable" per region; fall back to pattern display only.

---

### Live Decision Stream

**Component:** `LiveDecisionStream`

**Endpoints:**
- `GET /dashboard/decisions?limit=100`
- `GET /dashboard/region-mapping`

**Fields consumed:**
- `decisions[].createdAt`, `.chosenRegion`, `.baselineRegion`, `.carbonIntensityChosenGPerKwh`, `.carbonIntensityBaselineGPerKwh`, `.co2BaselineG`, `.co2ChosenG`, `.fallbackUsed`, `.workloadName`, `.opName`, `.requestCount`
- `mappings[].cloudRegion`, `.zone`, `.carbonIntensityGPerKwh`

**Filters:** None by default; optional region filter.

**Chart type:** Scrollable table with per-row CO2 delta chip (green/red).

**Refresh:** 10s poll.

**Empty state:** "No decisions yet. Decisions appear here once POST /api/v1/decisions is called."

**Error state:** Show last batch with staleness indicator.

---

### Integration Sources Panel

**Component:** `IntegrationSources`

**Endpoints:**
- `GET /dekes/health`
- `GET /dekes/analytics`
- `GET /ci/health`
- `GET /methodology/providers`

**Fields consumed:**
- `dekes.health.status`
- `dekes.analytics.totalWorkloads`, `.completedWorkloads`, `.pendingWorkloads`, `.totalCO2SavedG`
- `providers[].name`, `.totalCalls`, `.successCalls`, `.avgLatencyMs`, `.lastError`

**Chart type:** Integration cards grid; per-integration status chip (OK/degraded/down); mini stats.

**Refresh:** 60s poll.

**Empty state:** Show cards in "no data" state for each source.

**Error state:** "Health check failed" chip per integration.

---

### DEKES Impact Card

**Component:** `DekesImpactCard`

**Endpoints:**
- `GET /dekes/analytics`

**Fields consumed:**
- `totalWorkloads`, `completedWorkloads`, `pendingWorkloads`
- `totalCO2SavedG`, `avgActualCO2G`
- `recentWorkloads[].queryString`, `.selectedRegion`, `.actualCO2`, `.status`, `.createdAt`

**Chart type:** Stat card (total CO2 saved, completed vs pending); micro-table of recent workloads.

**Refresh:** 30s poll.

**Empty state:** "No DEKES workloads processed yet."

**Error state:** Cached last value with staleness banner.

---

### Carbon Savings / Impact

**Component:** `CarbonSavings`

**Endpoints:**
- `GET /dashboard/savings?window=7d` (default; user-switchable to 24h, 30d)
- `GET /governance/insights?organizationId=X&windowDays=30`

**Fields consumed:**
- `savings.totalCO2SavedG`, `.totalCO2BaselineG`, `.savingsPct`, `.savedEquivalents`
- `savings.byRegion[].region`, `.co2SavedG`, `.savingsPct`
- `savings.trend[].date`, `.co2SavedG`, `.decisions`
- `insights.totalCO2EmittedG`, `.offsetPercentage`, `.credits.active`, `.credits.retired`

**Filters:** Window selector (24h / 7d / 30d).

**Chart type:** Bar chart (trend by day); table (by region); equivalency cards.

**Refresh:** 5 min poll.

**Empty state:** "No savings data for this window."

**Error state:** Show last successful fetch with staleness indicator.

---

### Carbon Budgets

**Component:** `CarbonBudgets`

**Endpoints:**
- `GET /budgets/:organizationId`
- `GET /budgets/:organizationId/history`

**Fields consumed:**
- `status`, `budgetCO2Grams`, `consumedCO2Grams`, `remainingCO2Grams`, `utilizationPct`
- `periodStart`, `periodEnd`, `warningThresholdPct`
- `records[].budgetPeriod`, `.budgetCO2Grams`, `.consumedCO2Grams`, `.periodStart`, `.periodEnd`

**Filters:** Organization selector (if multi-org dashboard).

**Chart type:** Progress bar (consumed/budget); history line chart (utilization per period).

**Refresh:** 60s poll.

**Empty state:** "No active budget configured for this organization. POST /api/v1/budgets to create one."

**Error state:** 404 → "No active budget period." 500 → "Budget data unavailable."

---

### Provider Health

**Component:** `ProviderHealth`

**Endpoints:**
- `GET /methodology/providers`
- `GET /dashboard/metrics?window=24h` (for electricityMaps integration metric)

**Fields consumed:**
- `providers[].name`, `.totalCalls`, `.successCalls`, `.failureCalls`, `.avgLatencyMs`, `.lastSuccessAt`, `.lastFailureAt`, `.lastError`
- `metrics.electricityMaps.successRate`, `.lastError`
- `metrics.forecastRefresh.lastRun`

**Chart type:** Provider card per source (success rate ring, latency badge, last error tooltip).

**Refresh:** 30s poll.

**Empty state:** "No provider metrics yet. Data accumulates as routing requests are processed."

**Error state:** Show stale data with staleness chip.

---

### Policy Enforcement

**Component:** `PolicyEnforcement`

**Endpoints:**
- `GET /governance/policy?organizationId=X`
- `GET /governance/audit?organizationId=X&limit=50`
- `GET /governance/audit/verify`
- `GET /governance/insights?organizationId=X`

**Fields consumed:**
- `policy.tier`, `.maxCarbonGPerKwh`, `.requireGreenRouting`, `.anomalyDetectionEnabled`, `.anomalyThresholdSigma`
- `audit.records[].action`, `.result`, `.riskTier`, `.payload`, `.createdAt`
- `verify.intact`, `.checkedCount`, `.verifiedAt`
- `insights.complianceScore`

**Chart type:** Policy config display; audit log table (action/result/risk columns); chain integrity badge; compliance score gauge.

**Refresh:** Policy: 5 min. Audit: 30s. Chain verify: 5 min (expensive — do not poll more).

**Empty state:** "No policy configured — defaults apply."

**Error state:** Show last audit batch; chain verify failure → red integrity badge.

---

### Decision Replay

**Component:** `DecisionReplay`

**Endpoints:**
- `GET /route/:id/replay` (on-demand, user-triggered)
- `GET /dashboard/decisions?limit=100` (for decision picker)

**Fields consumed (replay):**
- `request.regions`, `.weights`, `.maxCarbonGPerKwh`
- `signals` (per-region intensity at decision time)
- `selectedRegion`, `carbonIntensity`, `baselineIntensity`, `carbon_delta_g_per_kwh`
- `qualityTier`, `forecast_stability`, `explanation`
- `source`, `workloadType`, `policyMode`, `predictedCleanWindow`
- `createdAt`, `replayedAt`, `fallbackUsed`, `providerDisagreement`

**Filters:** Decision ID input or picker from decisions list.

**Chart type:** Detail card with signal comparison table and signal snapshot per region.

**Refresh:** On-demand only (no poll).

**Empty state:** "Enter a decision ID to replay."

**Error state:** 404 → "Decision not found."; 403 → "Access denied."

---

### Forecast Accuracy / Scorecards

**Component:** `ForecastScorecards`

**Endpoints:**
- `GET /intelligence/scorecards`

**Fields consumed:**
- `scorecards[].region`, `.mape24h`, `.mape48h`, `.mae24h`, `.fallbackRate`, `.reliabilityTier`, `.sampleCount`, `.lastComputedAt`

**Filters:** Region multi-select; reliability tier filter.

**Chart type:** Table (sortable by mape24h); per-region reliability tier badge.

**Refresh:** 10 min poll (scorecards recomputed nightly; no value in faster poll).

**Empty state:** "No scorecard data. Scorecards require reconciled forecast actuals — feed POST /api/v1/workloads/complete with actualCarbonIntensityGPerKwh."

**Error state:** Show stale data with last-computed timestamp.

---

### Execution Integrity

**Component:** `ExecutionIntegrity`

**Endpoints:**
- `GET /dashboard/metrics?window=24h` (for executionIntegrity block)
- `GET /governance/audit/verify`

**Fields consumed:**
- `metrics.executionIntegrity.totalLeases`, `.valid`, `.revalidated`, `.driftDetected`, `.driftPreventedPct`
- `verify.intact`, `.checkedCount`, `.verifiedAt`, `.brokenAt`

**Chart type:** Stat cards (leases / drift detected / drift prevented %); chain integrity badge.

**Refresh:** 30s poll (metrics). 5 min (chain verify).

**Empty state:** "No leases issued yet. Lease data appears after POST /api/v1/route/green."

**Error state:** Chain verify 500 → "Chain verification failed — contact support."

---

---

## PART 3 — DRIFT / INTEGRITY VERIFICATION

### DEKES Execute

**Path:** `POST /api/v1/dekes/optimize` → `optimizeQuery()` in `lib/dekes-integration.ts`

**What happens:**
1. Calls `routeGreen()` directly (not through the routing route handler).
2. Creates `DekesWorkload` row (status: `ROUTED`).
3. Returns `workloadId` + routing result.

**Gaps:**
- `routeGreen()` returns a `decisionFrameId` only on the forecast path. `optimizeQuery()` does NOT call `saveDecisionSnapshot()` — **no DecisionSnapshot is written**.
- `optimizeQuery()` does NOT call `createLease()` — **no DecisionLease is written**.
- `optimizeQuery()` does NOT write to `DashboardRoutingDecision` — **DEKES savings are NOT included in `GET /dashboard/savings`**.

**Classification: BROKEN** (replay via `GET /route/:id/replay` is impossible for DEKES optimize decisions; no lease for integrity tracking; savings gap vs dashboard).

---

### DEKES Delay

**Path:** `POST /api/v1/dekes/schedule` → `scheduleBatchQueries()` in `lib/dekes-integration.ts`

**What happens:**
1. Fetches forecast signals for all regions via `getForecastSignals()`.
2. Scans slots in-memory; picks best region × time.
3. Creates `DekesWorkload` row (status: `SCHEDULED`).
4. Returns `scheduledTime`.

**Gaps:**
- No DecisionSnapshot, no DecisionLease for scheduled workloads.
- `DekesWorkload.status = SCHEDULED` — workload execution must be manually reported via `POST /dekes/report` or `POST /workloads/complete`.
- `POST /dekes/report` updates `DekesWorkload.actualCO2` and status, but does **not** feed `DashboardRoutingDecision`.
- `POST /workloads/complete` with `source=DEKES` updates `DekesWorkload` via `dekesWorkload.updateMany({ where: { dekesQueryId: decision_id } })`. However, the `decision_id` passed to `workloads/complete` is expected to be a `lease_id` (DecisionLease primary key), which DEKES schedule never creates. The `updateMany` will silently match zero rows.

**Classification: RISKY** (completion via `workloads/complete` silently does nothing for scheduled DEKES workloads; only `POST /dekes/report` closes the loop).

---

### CI Execute

**Path:** `POST /api/v1/ci/carbon-route` → `routeGreen()` in `lib/ci.ts`

**What happens:**
1. Calls `routeGreen()` directly.
2. Returns runner recommendation.
3. No snapshot, no lease, no `DashboardRoutingDecision`.

**Gaps:**
- **No DecisionSnapshot written** — CI decisions cannot be replayed.
- **No DecisionLease created** — no execution drift protection for CI workloads.
- **No `DashboardRoutingDecision` written** — CI decisions contribute zero to `GET /dashboard/savings`, `GET /dashboard/metrics`.
- There is no completion feedback endpoint for CI decisions.

**Classification: BROKEN** (CI decisions are completely invisible to the dashboard; no feedback loop exists).

---

### CI Fallback

**Path:** `POST /api/v1/ci/carbon-route` with `max_delay_minutes > 0`, triggers `recommendation: delay`

**What happens:**
1. Finds optimal window via `findOptimalWindow()`.
2. Returns `optimal_window` with `recommendation: delay`.
3. No record of the delay recommendation is stored anywhere.

**Gaps:**
- Caller is expected to honor the delay recommendation client-side.
- No deferred record is created; if the caller ignores the delay and runs immediately, the engine has no knowledge.
- No mechanism to close the CI delay → execution → feedback loop.

**Classification: BROKEN** (CI delay recommendation is fire-and-forget with no server-side tracking).

---

### Replay

**Path:** `GET /api/v1/route/:id/replay`

**What happens:**
1. Reads `DecisionSnapshot` by ID.
2. Returns full historical decision state.

**Confirmed correct for:** Decisions made via `POST /api/v1/route/green` — snapshot is written fire-and-forget in the route handler.

**Gaps:**
- DecisionSnapshot is only written by the `/route/green` route handler (`routing.ts:saveDecisionSnapshot()`).
- DEKES optimize, DEKES schedule, CI route, and Energy equation all call `routeGreen()` directly without saving a snapshot.
- Replay for these paths returns 404.

**Classification: RISKY** (replay works only for direct `/route/green` callers; broken for all other routing entry points).

---

### Dashboard Savings

**Path:** `GET /api/v1/dashboard/savings` → reads `DashboardRoutingDecision` table

**What populates `DashboardRoutingDecision`:**
- **Only** `POST /api/v1/decisions` (the decision ingest endpoint).
- This is a **client-push** model: the routing engine does NOT auto-write to this table.

**Gaps:**
- `POST /route/green` writes to `DecisionSnapshot` and `DecisionLease` — **not** `DashboardRoutingDecision`.
- DEKES writes to `DekesWorkload` — **not** `DashboardRoutingDecision`.
- CI writes nothing.
- Unless SDK users manually call `POST /api/v1/decisions` after every `POST /route/green`, the dashboard shows zero savings.
- `GET /dashboard/savings` and `GET /governance/insights.totalCO2SavedG` **both read from `DashboardRoutingDecision`** — a table that requires explicit client writes. If clients don't push, both endpoints are empty regardless of actual routing activity.

**Classification: RISKY** (the savings pipeline depends on client compliance; there is no engine-side auto-write bridge between routing decisions and the dashboard savings table).

---

### Summary Table

| Flow | Status | File / Function |
|------|--------|----------------|
| DEKES execute → snapshot | **BROKEN** | `routes/dekes.ts` → `lib/dekes-integration.ts:optimizeQuery()` — no `saveDecisionSnapshot()` call |
| DEKES execute → lease | **BROKEN** | `lib/dekes-integration.ts:optimizeQuery()` — no `createLease()` call |
| DEKES execute → dashboard savings | **BROKEN** | `lib/dekes-integration.ts:optimizeQuery()` — writes `DekesWorkload`, not `DashboardRoutingDecision` |
| DEKES delay → completion feedback | **RISKY** | `lib/dekes-integration.ts:scheduleBatchQueries()` — only `POST /dekes/report` closes loop; `POST /workloads/complete` silently no-ops |
| CI execute → all dashboard surfaces | **BROKEN** | `routes/ci.ts` — calls `routeGreen()` with no snapshot, lease, or DashboardRoutingDecision write |
| CI fallback → tracking | **BROKEN** | `routes/ci.ts` — delay recommendation is stateless; no deferred record created |
| Replay (direct /route/green) | **CONFIRMED CORRECT** | `routes/routing.ts` → `lib/decision-snapshot.ts:saveDecisionSnapshot()` |
| Replay (DEKES, CI, energy paths) | **BROKEN** | No snapshot written by any path other than `/route/green` handler |
| Dashboard savings auto-population | **RISKY** | `routes/dashboard.ts:GET /savings` reads `DashboardRoutingDecision` — only populated by explicit `POST /api/v1/decisions`; engine does not auto-write |
| Budget consumption (routing path) | **CONFIRMED CORRECT** | `routes/decisions.ts` → `lib/carbon-budget.ts:consumeBudget()` — non-blocking, after DashboardRoutingDecision write |
| Forecast scorecard feedback | **CONFIRMED CORRECT** | `routes/workloads.ts:POST /complete` → `lib/forecast-scorecard.ts:reconcileForecastActuals()` |
| Audit chain integrity | **CONFIRMED CORRECT** | `lib/governance/audit.ts` — SHA-256 chain written on every decision via `writeAuditLog()` |
| Drift detection | **CONFIRMED CORRECT** | `lib/decision-lease.ts:revalidateLease()` → writes `ExecutionDriftEvent` when region changes |
