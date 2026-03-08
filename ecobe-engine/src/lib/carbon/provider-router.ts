/**
 * Provider router — the single orchestration entry point.
 *
 * ALL carbon intensity lookups inside ECOBE must go through here.
 * No route handler, lib module, or integration may call a provider adapter
 * directly (rule #3).
 *
 * Flow for getBestCarbonSignal():
 *   1. Select primary provider from config
 *   2. Check Redis cache; return if fresh
 *   3. Fetch primary signal
 *   4. Validate freshness + shape
 *   5. If validation provider is configured, fetch secondary signal
 *   6. Compare providers; set disagreement_flag if delta > threshold
 *   7. If primary failed/stale and fallback allowed, use secondary as final
 *   8. Populate provenance flags on final signal
 *   9. Cache final signal
 *  10. Audit the decision
 *  11. Return final signal
 */

import { carbonProviderConfig } from '../../config/carbon-providers'
import { getProvider } from './provider-registry'
import { getCached, setCached, isStale } from './provider-cache'
import { validateFreshness, validateShape, calcDisagreementPct } from './provider-validator'
import { auditProviderDecision } from './provider-audit'
import { CarbonSignal, ProviderResult, QueryMode } from './types'
import { env } from '../../config/env'
import { redis } from '../redis'

// ─── Public result ─────────────────────────────────────────────────────────────

export interface RouterResult {
  ok: boolean
  signal: CarbonSignal | null
  error_message?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function diag(msg: string, data?: unknown): void {
  if (carbonProviderConfig.devDiagnostics && env.NODE_ENV !== 'test') {
    console.debug('[carbon-router]', msg, data ?? '')
  }
}

function failResult(msg: string): RouterResult {
  return { ok: false, signal: null, error_message: msg }
}

/** Apply provenance flags to the final signal before returning it */
function stampProvenance(
  signal: CarbonSignal,
  opts: {
    fallbackUsed: boolean
    validationUsed: boolean
    disagreementFlag: boolean
    disagreementPct: number | null
  }
): CarbonSignal {
  return {
    ...signal,
    fallback_used: opts.fallbackUsed,
    validation_used: opts.validationUsed,
    disagreement_flag: opts.disagreementFlag,
    disagreement_pct: opts.disagreementPct,
  }
}

// ─── Core orchestration ───────────────────────────────────────────────────────

/**
 * Fetch the best available carbon intensity signal for a region.
 *
 * @param region   - Zone/country code
 * @param mode     - 'realtime' | 'forecast' | 'historical'
 * @param orgId    - Optional org for audit trail
 */
export async function getBestCarbonSignal(
  region: string,
  mode: QueryMode = 'realtime',
  orgId?: string
): Promise<RouterResult> {
  const cfg = carbonProviderConfig
  const primaryName = cfg.primary

  // ── 1. Get primary provider ───────────────────────────────────────────────
  const primaryProvider = getProvider(primaryName)
  if (!primaryProvider) {
    return failResult(`Primary provider '${primaryName}' not found in registry`)
  }
  if (!primaryProvider.supportsRegion(region)) {
    diag(`Primary ${primaryName} does not support region ${region}`)
  }

  // ── 2. Cache check ────────────────────────────────────────────────────────
  const cached = await getCached(primaryName, region, mode)
  if (cached && !isStale(cached.cachedAt)) {
    diag('Cache hit', { provider: primaryName, region, mode })
    return { ok: true, signal: cached.signal }
  }
  if (cached && isStale(cached.cachedAt)) {
    diag('Cache stale', { provider: primaryName, region, ageMs: Date.now() - cached.cachedAt })
  }

  // ── 3. Fetch primary ──────────────────────────────────────────────────────
  let primaryResult: ProviderResult = { ok: false, signal: null, error_code: 'NOT_ATTEMPTED' }
  if (primaryProvider.supportsRegion(region)) {
    primaryResult = await primaryProvider.getCurrentIntensity(region)
    diag('Primary fetch', { ok: primaryResult.ok, source: primaryName })
  }

  // ── 4. Validate primary ───────────────────────────────────────────────────
  let primaryValid = false
  if (primaryResult.ok && primaryResult.signal) {
    const freshnessCheck = validateFreshness(primaryResult.signal)
    const shapeCheck = validateShape(primaryResult.signal)
    primaryValid = freshnessCheck.valid && shapeCheck.valid
    if (!primaryValid) {
      diag('Primary validation failed', { freshness: freshnessCheck.reason, shape: shapeCheck.reason })
    }
  }

  // ── 5. Validation provider (optional) ────────────────────────────────────
  let validationSignal: CarbonSignal | null = null
  let disagreementFlag = false
  let disagreementPct: number | null = null
  let validationUsed = false

  if (cfg.validation) {
    const valProvider = getProvider(cfg.validation)
    if (valProvider?.supportsRegion(region)) {
      const valResult = await valProvider.getCurrentIntensity(region)
      if (valResult.ok && valResult.signal) {
        const valShape = validateShape(valResult.signal)
        if (valShape.valid) {
          validationSignal = valResult.signal
          validationUsed = true

          // ── 6. Cross-validate if primary also succeeded ─────────────────
          if (primaryResult.ok && primaryResult.signal) {
            disagreementPct = calcDisagreementPct(
              primaryResult.signal.intensity_gco2_per_kwh,
              validationSignal.intensity_gco2_per_kwh
            )
            if (disagreementPct > cfg.disagreementThresholdPct) {
              disagreementFlag = true
              console.warn(
                `[carbon-router] Provider disagreement for ${region}: ` +
                `${primaryName}=${primaryResult.signal.intensity_gco2_per_kwh} vs ` +
                `${cfg.validation}=${validationSignal.intensity_gco2_per_kwh} ` +
                `(${disagreementPct.toFixed(1)}%)`
              )
            }
          }
        }
      }
    }
  }

  // ── 7. Choose final signal ────────────────────────────────────────────────
  let finalSignal: CarbonSignal | null = null
  let fallbackUsed = false

  if (primaryValid && primaryResult.signal) {
    finalSignal = primaryResult.signal
  } else if (cfg.allowFallback) {
    // Try validation signal as fallback
    if (validationSignal) {
      finalSignal = validationSignal
      fallbackUsed = true
      diag('Using validation signal as fallback')
    } else {
      // Try any other enabled provider
      for (const pcfg of cfg.providers) {
        if (pcfg.name === primaryName || pcfg.name === cfg.validation || !pcfg.enabled) continue
        const fallbackProvider = getProvider(pcfg.name)
        if (!fallbackProvider?.supportsRegion(region)) continue
        const fbResult = await fallbackProvider.getCurrentIntensity(region)
        if (fbResult.ok && fbResult.signal && validateShape(fbResult.signal).valid) {
          finalSignal = fbResult.signal
          fallbackUsed = true
          diag('Fallback provider used', { provider: pcfg.name })
          break
        }
      }
    }
  }

  // Use stale cache as last resort if fallback is allowed
  if (!finalSignal && cfg.allowFallback && cached) {
    finalSignal = { ...cached.signal, data_quality: 'low' }
    fallbackUsed = true
    diag('Using stale cache as last resort')
  }

  if (!finalSignal) {
    return failResult(`No valid carbon signal available for region ${region}`)
  }

  // ── 8. Stamp provenance ───────────────────────────────────────────────────
  finalSignal = stampProvenance(finalSignal, {
    fallbackUsed,
    validationUsed,
    disagreementFlag,
    disagreementPct,
  })

  // ── 9. Cache final signal ─────────────────────────────────────────────────
  await setCached(primaryName, region, mode, finalSignal)

  // ── 10. Audit ─────────────────────────────────────────────────────────────
  auditProviderDecision({
    region,
    mode,
    primarySignal: primaryResult.signal,
    finalSignal,
    validationSignal,
    organizationId: orgId,
  })

  return { ok: true, signal: finalSignal }
}

/**
 * Fetch forecast signals for a region via the provider layer.
 * Returns an ordered array of signals (ascending forecastTime).
 *
 * Caching: forecast responses are cached in Redis for MAX_STALENESS_MINUTES
 * so that DEKES batch scheduling (which calls this N times) hits the cache
 * instead of making repeated live API calls for the same window.
 *
 * Freshness gate: signals whose referenceTime (fetched_at) is older than
 * MAX_STALENESS_MINUTES are filtered out before returning.
 */
export async function getForecastSignals(
  region: string,
  from: Date,
  to: Date,
  orgId?: string
): Promise<CarbonSignal[]> {
  const cfg = carbonProviderConfig
  const cacheKey = `carbon:v2:forecast:${region}:${from.toISOString().slice(0, 13)}:${to.toISOString().slice(0, 13)}`
  const staleLimitMs = cfg.maxStalenessMinutes * 60 * 1000

  // ── Cache check ─────────────────────────────────────────────────────────────
  try {
    const cached = await redis.get(cacheKey)
    if (cached) {
      const parsed: { signals: CarbonSignal[]; cachedAt: number } = JSON.parse(cached)
      if (Date.now() - parsed.cachedAt < staleLimitMs) {
        diag('Forecast cache hit', { region, from: from.toISOString(), signalCount: parsed.signals.length })
        return parsed.signals
      }
    }
  } catch {
    // Cache read failure is non-fatal
  }

  // ── Live fetch ──────────────────────────────────────────────────────────────
  const provider = getProvider(cfg.primary)
  let freshSignals: CarbonSignal[] = []

  function applyFreshnessGate(signals: CarbonSignal[]): CarbonSignal[] {
    return signals.filter((s) => {
      const refMs = new Date(s.fetched_at).getTime()
      const fresh = Date.now() - refMs < staleLimitMs
      if (!fresh) {
        console.warn(`[carbon-router] Stale forecast signal excluded region=${region} fetched_at=${s.fetched_at}`)
      }
      return fresh
    })
  }

  if (provider?.supportsRegion(region)) {
    const results = await provider.getForecast(region, from, to)
    const stamped = results.filter((r) => r.ok && r.signal).map((r) =>
      stampProvenance(r.signal!, { fallbackUsed: false, validationUsed: false, disagreementFlag: false, disagreementPct: null })
    )
    // Apply freshness gate BEFORE checking whether to trigger fallback.
    // If primary returns only stale signals, they must be excluded and the
    // validation provider must be tried — same as if primary returned nothing.
    freshSignals = applyFreshnessGate(stamped)
  }

  // Fallback to validation provider if primary returned no FRESH signals
  if (freshSignals.length === 0 && cfg.validation) {
    const fallback = getProvider(cfg.validation)
    if (fallback?.supportsRegion(region)) {
      const results = await fallback.getForecast(region, from, to)
      const stamped = results.filter((r) => r.ok && r.signal).map((r) =>
        stampProvenance(r.signal!, { fallbackUsed: true, validationUsed: false, disagreementFlag: false, disagreementPct: null })
      )
      freshSignals = applyFreshnessGate(stamped)
      if (freshSignals.length > 0) {
        diag('Forecast fallback provider used', { region, provider: cfg.validation })
      }
    }
  }

  // ── Cache result ────────────────────────────────────────────────────────────
  if (freshSignals.length > 0) {
    try {
      await redis.setex(cacheKey, cfg.maxStalenessMinutes * 60, JSON.stringify({ signals: freshSignals, cachedAt: Date.now() }))
    } catch {
      // Cache write failure is non-fatal
    }

    auditProviderDecision({
      region,
      mode: 'forecast',
      primarySignal: freshSignals[0],
      finalSignal: freshSignals[0],
      organizationId: orgId,
    })
  } else {
    console.warn(`[carbon-router] getForecastSignals returned 0 fresh signals for region=${region}`)
  }

  return freshSignals
}
