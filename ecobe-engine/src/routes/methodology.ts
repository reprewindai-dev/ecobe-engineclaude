/**
 * Methodology endpoint — machine-readable model card for CO2 Router's routing engine.
 *
 * Inspired by CarbonCast's methodology page and Carbon Aware SDK's transparency goals.
 * Returns a versioned JSON document that:
 *   - Documents the scoring formula (carbon + latency + cost weights)
 *   - Describes how confidence bands are derived (empirical vs estimated)
 *   - Explains ranking stability semantics (stable/medium/unstable)
 *   - Lists quality tier criteria
 *   - Identifies data sources, provider roles, and fallback ordering
 *   - States resolution semantics (native-resolution storage, query-time alignment)
 *
 * This route is intentionally public (no auth) — transparency builds trust.
 * Registered in app.ts BEFORE requireApiKey middleware.
 */

import { Router } from 'express'
import { carbonProviderConfig } from '../config/carbon-providers'
import { getAllProviderMetrics } from '../lib/provider-monitor'

const router = Router()

// Static model card — describes the decision methodology
const METHODOLOGY_DOC = {
  version: '2c',
  name: 'CO2 Router — Carbon-Aware Routing Engine',
  description:
    'CO2 Router routes compute workloads to cleaner energy grids automatically, ' +
    'minimizing carbon emissions using real-time and forecast carbon intensity signals, ' +
    'weighted multi-objective scoring, and transparent uncertainty quantification.',

  scoring: {
    formula: 'score = wC × (1 − ci/maxCI) + wL × (1 − lat/maxLat) + wCo × (1 − cost/maxCost)',
    formula_note:
      'All three objective scores are normalized 0–1 across candidates in the same decision. ' +
      'Higher score is better. Weights are normalized to sum to 1.',
    defaults: {
      carbonWeight:  0.5,
      latencyWeight: 0.2,
      costWeight:    0.3,
    },
    customization:
      'Callers may override weights per request. costPerKwhByRegion enables real price-based ' +
      'cost scoring; when omitted, cost proxies the carbon score (cost ∝ carbon).',
    resolution_penalty: {
      description:
        'When forecast data resolution exceeds the workload duration, the carbon score ' +
        'is multiplied by a resolution confidence factor (0.85–1.0). This reflects that ' +
        'coarser data (e.g. 60-min forecast for a 15-min workload) is less precise.',
      formula: 'resolutionFactor = 0.85 + 0.15 × (durationMinutes / resolutionMinutes), capped at 1.0',
      example: 'resolution=60min, workload=15min → factor=0.888 (11% penalty on carbon score)',
    },
  },

  confidence_bands: {
    description:
      'Every forecast decision includes a p10/p50/p90 intensity band representing ' +
      'the uncertainty in the carbon intensity estimate.',
    empirical: {
      when: 'Three or more forecast signals are available for the target window.',
      method:
        'Real percentiles of the signal distribution: p10 = 10th percentile, ' +
        'p50 = median, p90 = 90th percentile.',
    },
    estimated: {
      when: 'Fewer than three signals available, or on historical fallback path.',
      method:
        'Spread derived from confidence score: spreadPct = (1 − confidence) × 0.25. ' +
        'low = intensity × (1 − spread), high = intensity × (1 + spread).',
      note: 'Treat estimated bands as indicative; empirical=false is exposed in the API.',
    },
    scorecard_adjustment: {
      description:
        'Confidence scores are adjusted down for regions with poor forecast history, ' +
        'widening the uncertainty band.',
      multipliers: {
        high:    1.0,
        medium:  0.85,
        low:     0.65,
        unknown: 0.80,
      },
    },
    bandWidthPct: 'Reported as (p90 − p10) / p50 × 100 — useful for comparing relative uncertainty across regions.',
  },

  ranking_stability: {
    description:
      'Answers: "Is the chosen region robustly the best, or could another region win ' +
      'given forecast uncertainty?" Computed from confidence band overlap.',
    levels: {
      stable:         'Winner p90 < all alternatives p10 — wins even in worst-case scenario.',
      medium:         'Winner p10 < all alternatives p10 but ranges overlap (winner p90 ≥ some alt p10).',
      unstable:       'Winner p10 ≥ any alternative p10 — ranking could plausibly reverse.',
      sole_candidate: 'Only one region considered; no comparison possible.',
    },
    note:
      'Rankings use carbon intensity (lower = better). All comparisons are on intensity ' +
      'values (gCO2eq/kWh), not scores.',
  },

  quality_tiers: {
    description: 'Summarizes the overall reliability of a routing decision for API consumers.',
    levels: {
      high:   'Live real-time signal present + providers agree, OR forecast with empirical band + stable/sole_candidate ranking.',
      medium: 'Forecast with estimated band, OR overlapping (medium) stability, OR provider disagreement detected on live path.',
      low:    'Historical fallback used, OR unstable ranking, OR all providers failed.',
    },
  },

  decision_confidence: {
    description:
      'Every routing decision now includes three explicit confidence signals ' +
      'beyond the scalar score, so API consumers can build trust UIs without ' +
      'parsing the explanation string.',
    fields: {
      carbon_delta_g_per_kwh: {
        description: 'Absolute CO₂ intensity savings: baseline_ci − selected_ci in gCO2eq/kWh.',
        note: 'Pairs with expected_savings_pct to provide both relative and absolute impact. ' +
              'Useful for ESG reporting where absolute numbers (not percentages) are required.',
        example: '{ "carbon_delta_g_per_kwh": 165 } → running in FR saves 165 gCO2/kWh vs baseline',
      },
      forecast_stability: {
        description: 'Whether the winning region\'s ranking is stable across adjacent forecast slots.',
        values: {
          stable:   'Winner dominates even under worst-case intensity estimates.',
          medium:   'Winner leads but intensity bands overlap with at least one alternative.',
          unstable: 'An alternative could plausibly have lower intensity; treat with caution.',
          null:     'Live path — no multi-slot forecast to compare against.',
        },
      },
      provider_disagreement: {
        description: 'Cross-provider signal disagreement for the selected region on the live path.',
        fields: {
          flag: 'true when providers disagree by more than CARBON_PROVIDER_DISAGREEMENT_THRESHOLD_PCT (default 15%).',
          pct:  'Absolute percentage difference between primary and validation provider.',
        },
        note: 'Disagreement downgrades quality_tier from high → medium. null when validation is disabled.',
      },
    },
  },

  data_model: {
    two_time_model: {
      referenceTime: 'When a forecast was generated or a live reading was observed.',
      targetTime:    'When the workload is scheduled to execute.',
      significance:
        'CO2 Router always selects the most recent forecast (referenceTime ≤ now) that ' +
        'covers the targetTime window. This prevents stale forecasts from influencing decisions.',
    },
    native_resolution:
      'Carbon signals are stored at source granularity (5min, 15min, 60min). ' +
      'Normalization only happens at query time to avoid data distortion. ' +
      'dataResolutionMinutes in responses reflects the actual underlying granularity.',
    lazy_query_planning:
      'DecisionQueryPlan is built before any I/O, filtering partitions before loading rows. ' +
      'This minimizes database and API calls for multi-region decisions.',
    freshness_gate:
      'Signals older than maxStalenessMinutes are excluded BEFORE fallback is triggered. ' +
      'This ensures stale primary signals always cause a fallback to the validation provider.',
  },

  forecast_scorecard: {
    description:
      'CO2 Router backtests its own forecast predictions against actuals to compute ' +
      'rolling regional accuracy metrics.',
    metrics: ['MAE by horizon (24h/48h/72h)', 'MAPE by horizon', 'fallbackRate', 'staleRejectionRate'],
    rolling_window_days: 30,
    reliability_tiers: {
      high:    'mape24h < 10% AND fallbackRate < 15%',
      medium:  'mape24h 10–25% OR fallbackRate 15–35%',
      low:     'mape24h > 25% OR fallbackRate > 35%',
      unknown: 'fewer than 10 reconciled predictions',
    },
  },
}

// GET /api/v1/methodology — returns static model card
router.get('/', (_req, res) => {
  res.json({
    ...METHODOLOGY_DOC,
    provider_config: {
      primary:    carbonProviderConfig.primary,
      validation: carbonProviderConfig.validation ?? null,
      fallback_allowed:           carbonProviderConfig.allowFallback,
      max_staleness_minutes:      carbonProviderConfig.maxStalenessMinutes,
      disagreement_threshold_pct: carbonProviderConfig.disagreementThresholdPct,
    },
    generated_at: new Date().toISOString(),
  })
})

// GET /api/v1/methodology/providers — live provider performance metrics
router.get('/providers', async (_req, res) => {
  const metrics = await getAllProviderMetrics()
  res.json({
    providers: metrics,
    note: 'Metrics are rolling counts since service start or last reset. ' +
          'avgLatencyMs = totalLatencyMs / totalCalls.',
    generated_at: new Date().toISOString(),
  })
})

export default router
