/**
 * Ember Climate provider adapter.
 *
 * Ember (https://ember-climate.org) publishes country-level electricity
 * generation and carbon intensity data.  ECOBE uses it as:
 *   - secondary validation against Electricity Maps
 *   - historical enrichment for back-testing
 *   - fallback when primary is unavailable
 *
 * API reference: https://api.ember-climate.org/v2/
 *
 * Auth: Bearer token via EMBER_ENERGY_API_KEY env var.
 *
 * Zone mapping: Ember uses ISO 3166-1 alpha-2 country codes (e.g. 'US', 'FR').
 * ECOBE regions may be more granular (e.g. 'US-CAL-CISO').  The adapter
 * maps region → country for Ember queries and records a quality downgrade
 * ('medium') when a sub-national region is approximated by country average.
 */

import axios from 'axios'
import { CarbonProvider } from '../provider-interface'
import { CarbonSignal, DataQuality, ProviderResult } from '../types'
import { recordIntegrationFailure, recordIntegrationSuccess } from '../../integration-metrics'

const EMBER_BASE_URL = process.env.EMBER_BASE_URL ?? 'https://api.ember-climate.org/v2'

/**
 * Maps ECOBE region codes to Ember country codes.
 * Sub-national regions lose precision; this is flagged in data_quality.
 */
const REGION_TO_COUNTRY: Record<string, string> = {
  // North America
  'US-CAL-CISO': 'US', 'US-TEX-ERCO': 'US', 'US-NW-PACW': 'US', 'US-MIDA-PJM': 'US',
  'US-MIDW-MISO': 'US', 'US-SE-SERC': 'US', 'US-SW-AZPS': 'US', 'US-NE-ISNE': 'US',
  CA: 'CA',
  // Europe
  FR: 'FR', DE: 'DE', GB: 'GB', ES: 'ES', IT: 'IT', NL: 'NL', PL: 'PL',
  PT: 'PT', SE: 'SE', NO: 'NO', DK: 'DK', FI: 'FI', AT: 'AT', CH: 'CH',
  BE: 'BE', CZ: 'CZ', HU: 'HU', RO: 'RO', GR: 'GR',
  // Asia-Pacific
  AU: 'AU', JP: 'JP', KR: 'KR', IN: 'IN', CN: 'CN',
  // Other
  BR: 'BR', ZA: 'ZA',
}

function toCountry(region: string): string | null {
  // Direct country code match
  if (/^[A-Z]{2}$/.test(region)) return region
  return REGION_TO_COUNTRY[region] ?? null
}

function qualityForRegion(region: string): DataQuality {
  // If region maps to itself (country-level), quality is high; sub-national → medium
  return /^[A-Z]{2}$/.test(region) ? 'high' : 'medium'
}

export class EmberProvider implements CarbonProvider {
  readonly name = 'ember' as const
  private apiKey: string | undefined

  constructor() {
    this.apiKey = process.env.EMBER_ENERGY_API_KEY
  }

  supportsRegion(region: string): boolean {
    if (!this.apiKey) return false
    return toCountry(region) !== null
  }

  async getCurrentIntensity(region: string): Promise<ProviderResult> {
    const country = toCountry(region)
    if (!country) {
      return { ok: false, signal: null, error_code: 'REGION_NOT_FOUND', error_message: `Ember has no mapping for ${region}` }
    }
    if (!this.apiKey) {
      return { ok: false, signal: null, error_code: 'NO_API_KEY', error_message: 'EMBER_ENERGY_API_KEY not set' }
    }

    const start = Date.now()
    try {
      // Ember v2 carbon intensity endpoint — returns latest observed value
      const response = await axios.get(`${EMBER_BASE_URL}/electricity-data/carbon-intensity/monthly`, {
        params: {
          entity_code: country,
          is_aggregate_entity: false,
          start_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7), // 3 months back
          end_date: new Date().toISOString().slice(0, 7),
          series: 'Carbon intensity of electricity',
        },
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 8000,
      })

      const rows: any[] = (response.data as any)?.data ?? []
      if (rows.length === 0) {
        return { ok: false, signal: null, error_code: 'NO_DATA', error_message: 'Ember returned no rows' }
      }

      // Most recent row first
      const latest = rows.sort((a, b) => b.date?.localeCompare(a.date ?? '') ?? 0)[0]
      const intensity = Number(latest?.value ?? latest?.carbon_intensity ?? 0)

      await recordIntegrationSuccess('EMBER')
      const signal: CarbonSignal = {
        region,
        intensity_gco2_per_kwh: intensity,
        observed_time: latest.date ? `${latest.date}-01T00:00:00Z` : null,
        forecast_time: null,
        fetched_at: new Date().toISOString(),
        source: 'ember',
        source_record_id: `${country}-${latest.date}`,
        source_latency_ms: Date.now() - start,
        is_forecast: false,
        // Ember monthly data is country-average — lower confidence than real-time grid readings
        confidence: 0.65,
        data_quality: qualityForRegion(region),
        fallback_used: false,
        validation_used: false,
        disagreement_flag: false,
        disagreement_pct: null,
        metadata: { country, ember_date: latest.date, unit: 'gCO2eq/kWh' },
      }
      return { ok: true, signal }
    } catch (err: any) {
      const msg = err?.message ?? 'Unknown Ember error'
      await recordIntegrationFailure('EMBER', msg).catch(() => {})
      return { ok: false, signal: null, error_code: 'FETCH_ERROR', error_message: msg }
    }
  }

  async getForecast(_region: string, _from: Date, _to: Date): Promise<ProviderResult[]> {
    // Ember does not publish short-term forecasts (it is a historical/monthly dataset).
    // Returning empty here tells the router to rely on another provider for forecasts.
    return []
  }

  async getHistorical(region: string, from: Date, to: Date): Promise<ProviderResult[]> {
    const country = toCountry(region)
    if (!country || !this.apiKey) return []

    const start = Date.now()
    try {
      const startMonth = from.toISOString().slice(0, 7)
      const endMonth = to.toISOString().slice(0, 7)

      const response = await axios.get(`${EMBER_BASE_URL}/electricity-data/carbon-intensity/monthly`, {
        params: {
          entity_code: country,
          is_aggregate_entity: false,
          start_date: startMonth,
          end_date: endMonth,
          series: 'Carbon intensity of electricity',
        },
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 10000,
      })

      const rows: any[] = (response.data as any)?.data ?? []
      const latencyMs = Date.now() - start
      await recordIntegrationSuccess('EMBER').catch(() => {})

      return rows.map((row): ProviderResult => ({
        ok: true,
        signal: {
          region,
          intensity_gco2_per_kwh: Number(row?.value ?? row?.carbon_intensity ?? 0),
          observed_time: row.date ? `${row.date}-01T00:00:00Z` : null,
          forecast_time: null,
          fetched_at: new Date().toISOString(),
          source: 'ember',
          source_record_id: `${country}-${row.date}`,
          source_latency_ms: latencyMs,
          is_forecast: false,
          confidence: 0.7,
          data_quality: qualityForRegion(region),
          fallback_used: false,
          validation_used: false,
          disagreement_flag: false,
          disagreement_pct: null,
          metadata: { country, ember_date: row.date },
        },
      }))
    } catch (err: any) {
      await recordIntegrationFailure('EMBER', err?.message ?? 'Unknown error').catch(() => {})
      return []
    }
  }
}
