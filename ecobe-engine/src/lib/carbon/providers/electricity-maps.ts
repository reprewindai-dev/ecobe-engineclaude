/**
 * Electricity Maps provider adapter.
 *
 * Wraps the existing ElectricityMapsClient and normalises its output into
 * the shared CarbonSignal shape.  No route or business-logic code should
 * call ElectricityMapsClient directly — go through this adapter.
 *
 * Two-time model alignment:
 *   observed_time  → updatedAt from the API (= referenceTime: when EM generated the forecast)
 *   forecast_time  → datetime from the forecast item (= targetTime: the predicted slot)
 *
 * Resolution mapping (temporalGranularity → minutes):
 *   'hourly'         → 60
 *   'half_hourly'    → 30
 *   'quarter_hourly' → 15
 *   anything else    → 60 (conservative default)
 */

import { env } from '../../../config/env'
import { CarbonProvider } from '../provider-interface'
import { CarbonSignal, ProviderResult } from '../types'
import { electricityMaps } from '../../electricity-maps'

function granularityToMinutes(granularity: string | undefined): number {
  switch (granularity) {
    case 'quarter_hourly': return 15
    case 'half_hourly':    return 30
    case 'hourly':         return 60
    default:               return 60
  }
}

export class ElectricityMapsProvider implements CarbonProvider {
  readonly name = 'electricity_maps' as const

  supportsRegion(_region: string): boolean {
    // Electricity Maps has global coverage (with API key)
    return Boolean(env.ELECTRICITY_MAPS_API_KEY)
  }

  async getCurrentIntensity(region: string): Promise<ProviderResult> {
    const start = Date.now()
    try {
      const data = await electricityMaps.getCarbonIntensity(region)
      if (!data) {
        return { ok: false, signal: null, error_code: 'NO_DATA', error_message: 'No data returned' }
      }

      const signal: CarbonSignal = {
        region,
        intensity_gco2_per_kwh: data.carbonIntensity,
        observed_time: data.datetime,
        forecast_time: null,
        fetched_at: new Date().toISOString(),
        source: 'electricity_maps',
        source_latency_ms: Date.now() - start,
        is_forecast: false,
        confidence: 0.9,
        data_quality: 'high',
        fallback_used: false,
        validation_used: false,
        disagreement_flag: false,
        disagreement_pct: null,
        fossil_fuel_pct: data.fossilFuelPercentage,
        renewable_pct: data.renewablePercentage,
        metadata: { zone: data.zone },
      }
      return { ok: true, signal }
    } catch (err: any) {
      return {
        ok: false,
        signal: null,
        error_code: 'FETCH_ERROR',
        error_message: err?.message ?? 'Unknown error',
      }
    }
  }

  async getForecast(region: string, from: Date, to: Date): Promise<ProviderResult[]> {
    const start = Date.now()
    try {
      const raw = await electricityMaps.getForecast(region)
      const latencyMs = Date.now() - start
      const fetchedAt = new Date().toISOString()

      return raw
        .filter((f) => {
          const t = new Date(f.datetime).getTime()
          return t >= from.getTime() && t <= to.getTime()
        })
        .map((f): ProviderResult => ({
          ok: true,
          signal: {
            // region is the routing parameter — f.zone is the same but use the param
            // to guarantee it's never undefined (f.zone could be missing in edge cases)
            region,
            intensity_gco2_per_kwh: f.carbonIntensity,
            // observed_time = updatedAt = when EM generated this forecast run
            // This is CO2 Router's referenceTime in the two-time model.
            // Assembler uses it to select the most recent forecast covering targetTime.
            observed_time: f.updatedAt ?? null,
            forecast_time: f.datetime,
            fetched_at: fetchedAt,
            source: 'electricity_maps',
            source_latency_ms: latencyMs,
            is_forecast: true,
            confidence: 0.75,
            data_quality: 'high',
            fallback_used: false,
            validation_used: false,
            disagreement_flag: false,
            disagreement_pct: null,
            metadata: {
              zone: f.zone,
              temporalGranularity: f.temporalGranularity,
              // resolution_minutes lets assembler skip the historical-table lookup
              // for dataResolutionMinutes when forecast signals carry this info
              resolution_minutes: granularityToMinutes(f.temporalGranularity),
            },
          },
        }))
    } catch {
      return []
    }
  }

  async getHistorical(region: string, from: Date, to: Date): Promise<ProviderResult[]> {
    const start = Date.now()
    try {
      const raw = await electricityMaps.getCarbonIntensityHistory(region, from, to)
      const latencyMs = Date.now() - start
      return raw.map((f): ProviderResult => ({
        ok: true,
        signal: {
          region: f.zone ?? region,  // zone may be per-item on history endpoint
          intensity_gco2_per_kwh: f.carbonIntensity,
          observed_time: f.datetime,
          forecast_time: null,
          fetched_at: new Date().toISOString(),
          source: 'electricity_maps',
          source_latency_ms: latencyMs,
          is_forecast: false,
          confidence: 0.95,
          data_quality: 'high',
          fallback_used: false,
          validation_used: false,
          disagreement_flag: false,
          disagreement_pct: null,
          fossil_fuel_pct: f.fossilFuelPercentage,
          renewable_pct: f.renewablePercentage,
          metadata: {},
        },
      }))
    } catch {
      return []
    }
  }
}
