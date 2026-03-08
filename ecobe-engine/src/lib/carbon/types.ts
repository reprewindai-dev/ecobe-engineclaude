/**
 * Shared data types for the multi-provider carbon data layer.
 *
 * Every piece of carbon/intensity data returned by the system uses these
 * types regardless of which upstream API provided it.  Nothing downstream
 * (routing, DEKES, governance) should ever touch a raw provider response.
 */

// ─── Provider identity ────────────────────────────────────────────────────────

export type ProviderName = 'electricity_maps' | 'ember' | 'watttime' | 'synthetic'

export type ProviderRole =
  | 'primary_realtime'
  | 'secondary_validation'
  | 'secondary_history'
  | 'fallback'
  | 'disabled'

export type DataQuality = 'high' | 'medium' | 'low'

// ─── Normalized carbon signal ─────────────────────────────────────────────────

/**
 * The canonical shape for any carbon intensity data point inside ECOBE.
 * Every provider adapter must normalise into this shape before returning.
 *
 * Provenance fields (source, fetched_at, fallback_used, etc.) are required —
 * this enforces rule #4: every data point must carry its own audit trail.
 */
export interface CarbonSignal {
  /** Zone / region identifier (e.g. 'US-CAL-CISO', 'FR', 'DE') */
  region: string
  /** Carbon intensity in gCO2eq/kWh */
  intensity_gco2_per_kwh: number

  // ── Time context (two-time model) ─────────────────────────────────────────
  /** ISO-8601: when the data point was observed by the grid operator */
  observed_time: string | null
  /** ISO-8601: the future moment this point predicts (null for realtime) */
  forecast_time: string | null
  /** ISO-8601: when ECOBE fetched this data from the provider */
  fetched_at: string

  // ── Provenance ────────────────────────────────────────────────────────────
  source: ProviderName
  /** Provider-native record / point ID (for cross-referencing) */
  source_record_id?: string
  /** How long the provider API call took, in ms */
  source_latency_ms?: number

  // ── Signal metadata ───────────────────────────────────────────────────────
  is_forecast: boolean
  confidence: number | null           // 0–1
  data_quality: DataQuality

  // ── Multi-provider decision flags ─────────────────────────────────────────
  /** True if this signal came from a secondary/fallback provider */
  fallback_used: boolean
  /** True if a secondary provider was consulted for cross-validation */
  validation_used: boolean
  /** True if primary and secondary differed by more than threshold */
  disagreement_flag: boolean
  /** Absolute % difference between providers (null when validation not used) */
  disagreement_pct: number | null

  // ── Fossil/renewable breakdown (optional) ─────────────────────────────────
  fossil_fuel_pct?: number
  renewable_pct?: number

  /** Arbitrary provider-specific extras — never used for routing decisions */
  metadata: Record<string, unknown>
}

// ─── Provider call result ─────────────────────────────────────────────────────

export interface ProviderResult {
  ok: boolean
  signal: CarbonSignal | null
  /** Provider-specific error code (e.g. 'RATE_LIMITED', 'REGION_NOT_FOUND') */
  error_code?: string
  error_message?: string
  /** True when a cached value was used and it has exceeded staleness threshold */
  stale?: boolean
}

// ─── Query mode ───────────────────────────────────────────────────────────────

export type QueryMode = 'realtime' | 'forecast' | 'historical'
