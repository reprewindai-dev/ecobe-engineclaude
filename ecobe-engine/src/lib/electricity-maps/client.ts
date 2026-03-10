/**
 * Electricity Maps — full API client for Kobe/ECOBE.
 *
 * Covers all 8 capability modules:
 *   carbon · renewable/carbon-free · generation · flows · net-load · price · zones · optimizers
 *
 * Every public method:
 *   - injects auth-token header automatically
 *   - records integration success/failure metrics
 *   - returns null / empty array on failure (never throws)
 *   - uses the correct v3 (or beta) base path
 *
 * The client does NOT implement caching or polling — those live in service modules above it.
 */

import axios, { AxiosInstance } from 'axios'
import { env } from '../../config/env'
import { recordIntegrationFailure, recordIntegrationSuccess } from '../integration-metrics'
import type {
  EM_CarbonIntensityResponse,
  EM_CarbonIntensityForecastResponse,
  EM_CarbonIntensityLevelResponse,
  EM_RenewablePercentageLevelResponse,
  EM_CarbonFreePercentageLevelResponse,
  EM_RenewableEnergyResponse,
  EM_CarbonFreeEnergyResponse,
  EM_ElectricityMixResponse,
  EM_SourceResponse,
  EM_ElectricityFlowsResponse,
  EM_NetLoadResponse,
  EM_NetLoadLatestResponse,
  EM_DayAheadPriceResponse,
  EM_ZonesResponse,
  EM_ZoneInfo,
  EM_DataCenter,
  EM_UpdatedSinceResponse,
  EM_CarbonAwareOptimizerRequest,
  EM_CarbonAwareOptimizerResponse,
  EM_SmartChargingOptimizerRequest,
  EM_SmartChargingOptimizerResponse,
  ElectricitySource,
} from './types'

const PROVIDER = 'ELECTRICITY_MAPS'

export class ElectricityMapsFullClient {
  private readonly http: AxiosInstance

  constructor() {
    this.http = axios.create({
      baseURL: env.ELECTRICITY_MAPS_BASE_URL,
      headers: env.ELECTRICITY_MAPS_API_KEY
        ? { 'auth-token': env.ELECTRICITY_MAPS_API_KEY }
        : {},
      timeout: 10_000,
    })
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  private get hasKey(): boolean {
    return Boolean(env.ELECTRICITY_MAPS_API_KEY)
  }

  private async ok(label: string): Promise<void> {
    try { await recordIntegrationSuccess(PROVIDER) } catch { /* non-blocking */ }
  }

  private async fail(label: string, message: string): Promise<void> {
    try { await recordIntegrationFailure(PROVIDER, `${label}: ${message}`) } catch { /* non-blocking */ }
  }

  private async get<T>(path: string, params?: Record<string, unknown>): Promise<T | null> {
    if (!this.hasKey) {
      await this.fail(path, 'Missing API key')
      return null
    }
    try {
      const res = await this.http.get<T>(path, { params })
      await this.ok(path)
      return res.data
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Unknown error'
      await this.fail(path, msg)
      return null
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    if (!this.hasKey) {
      await this.fail(path, 'Missing API key')
      return null
    }
    try {
      const res = await this.http.post<T>(path, body)
      await this.ok(path)
      return res.data
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Unknown error'
      await this.fail(path, msg)
      return null
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODULE 1 — Carbon Signals
  // ══════════════════════════════════════════════════════════════════════════════

  getCarbonIntensityLatest(zone: string) {
    return this.get<EM_CarbonIntensityResponse>('/v3/carbon-intensity/latest', { zone })
  }

  getCarbonIntensityHistory(zone: string) {
    return this.get<{ zone: string; history: any[] }>('/v3/carbon-intensity/history', { zone })
  }

  getCarbonIntensityPastRange(zone: string, start: string, end: string) {
    return this.get<{ zone: string; data: any[] }>('/v3/carbon-intensity/past-range', { zone, start, end })
  }

  getCarbonIntensityForecast(zone: string, horizonHours?: number) {
    return this.get<EM_CarbonIntensityForecastResponse>(
      '/v3/carbon-intensity/forecast',
      horizonHours ? { zone, horizonHours } : { zone },
    )
  }

  /** Fossil-only carbon intensity (excludes nuclear) */
  getCarbonIntensityFossilLatest(zone: string) {
    return this.get<EM_CarbonIntensityResponse>('/v3/carbon-intensity-fossil-only/latest', { zone })
  }

  getCarbonIntensityFossilForecast(zone: string, horizonHours?: number) {
    return this.get<EM_CarbonIntensityForecastResponse>(
      '/v3/carbon-intensity-fossil-only/forecast',
      horizonHours ? { zone, horizonHours } : { zone },
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODULE 2 — Level Signals  (high / moderate / low relative signals)
  // ══════════════════════════════════════════════════════════════════════════════

  getCarbonIntensityLevel(zone: string) {
    return this.get<EM_CarbonIntensityLevelResponse>('/v3/carbon-intensity-level/latest', { zone })
  }

  getRenewablePercentageLevel(zone: string) {
    return this.get<EM_RenewablePercentageLevelResponse>('/v3/renewable-percentage-level/latest', { zone })
  }

  getCarbonFreePercentageLevel(zone: string) {
    return this.get<EM_CarbonFreePercentageLevelResponse>('/v3/carbon-free-percentage-level/latest', { zone })
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODULE 3 — Clean-Energy Signals  (renewable %, carbon-free %)
  // ══════════════════════════════════════════════════════════════════════════════

  getRenewableEnergyLatest(zone: string) {
    return this.get<EM_RenewableEnergyResponse>('/v3/renewable-energy/latest', { zone })
  }

  getRenewableEnergyForecast(zone: string, horizonHours?: number) {
    return this.get<{ zone: string; data: any[] }>(
      '/v3/renewable-energy/forecast',
      horizonHours ? { zone, horizonHours } : { zone },
    )
  }

  getCarbonFreeEnergyLatest(zone: string) {
    return this.get<EM_CarbonFreeEnergyResponse>('/v3/carbon-free-energy/latest', { zone })
  }

  getCarbonFreeEnergyForecast(zone: string, horizonHours?: number) {
    return this.get<{ zone: string; data: any[] }>(
      '/v3/carbon-free-energy/forecast',
      horizonHours ? { zone, horizonHours } : { zone },
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODULE 4 — Generation Intelligence  (electricity mix + per-source)
  // ══════════════════════════════════════════════════════════════════════════════

  getElectricityMixLatest(zone: string) {
    return this.get<EM_ElectricityMixResponse>('/v3/electricity-mix/latest', { zone })
  }

  getElectricityMixHistory(zone: string) {
    return this.get<EM_ElectricityMixResponse>('/v3/electricity-mix/history', { zone })
  }

  getElectricityMixPastRange(zone: string, start: string, end: string) {
    return this.get<EM_ElectricityMixResponse>('/v3/electricity-mix/past-range', { zone, start, end })
  }

  getElectricityMixForecast(zone: string, horizonHours?: number) {
    return this.get<EM_ElectricityMixResponse>(
      '/v3/electricity-mix/forecast',
      horizonHours ? { zone, horizonHours } : { zone },
    )
  }

  getElectricitySourceLatest(zone: string, source: ElectricitySource) {
    return this.get<EM_SourceResponse>(`/v3/electricity-mix/${source}/latest`, { zone })
  }

  getElectricitySourceHistory(zone: string, source: ElectricitySource) {
    return this.get<EM_SourceResponse>(`/v3/electricity-mix/${source}/history`, { zone })
  }

  getElectricitySourceForecast(zone: string, source: ElectricitySource, horizonHours?: number) {
    return this.get<EM_SourceResponse>(
      `/v3/electricity-mix/${source}/forecast`,
      horizonHours ? { zone, horizonHours } : { zone },
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODULE 5 — Interconnection Intelligence  (electricity flows)
  // ══════════════════════════════════════════════════════════════════════════════

  getElectricityFlowsLatest(zone: string) {
    return this.get<EM_ElectricityFlowsResponse>('/v3/electricity-flows/latest', { zone })
  }

  getElectricityFlowsHistory(zone: string) {
    return this.get<EM_ElectricityFlowsResponse>('/v3/electricity-flows/history', { zone })
  }

  getElectricityFlowsPastRange(zone: string, start: string, end: string) {
    return this.get<EM_ElectricityFlowsResponse>('/v3/electricity-flows/past-range', { zone, start, end })
  }

  getElectricityFlowsForecast(zone: string, horizonHours?: number) {
    return this.get<EM_ElectricityFlowsResponse>(
      '/v3/electricity-flows/forecast',
      horizonHours ? { zone, horizonHours } : { zone },
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODULE 6 — Load Intelligence  (net load = demand − solar − wind)
  // ══════════════════════════════════════════════════════════════════════════════

  getNetLoadLatest(zone: string) {
    return this.get<EM_NetLoadLatestResponse>('/v3/net-load/latest', { zone })
  }

  getNetLoadHistory(zone: string) {
    return this.get<EM_NetLoadResponse>('/v3/net-load/history', { zone })
  }

  getNetLoadPastRange(zone: string, start: string, end: string) {
    return this.get<EM_NetLoadResponse>('/v3/net-load/past-range', { zone, start, end })
  }

  getNetLoadForecast(zone: string, horizonHours?: number) {
    return this.get<EM_NetLoadResponse>(
      '/v3/net-load/forecast',
      horizonHours ? { zone, horizonHours } : { zone },
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODULE 7 — Market Intelligence  (day-ahead price)
  // ══════════════════════════════════════════════════════════════════════════════

  getDayAheadPriceLatest(zone: string) {
    // The /latest endpoint is part of price-day-ahead — falls back to /past with no datetime
    return this.get<EM_DayAheadPriceResponse>('/v3/price-day-ahead/latest', { zone })
  }

  getDayAheadPricePast(zone: string, datetime: string) {
    return this.get<EM_DayAheadPriceResponse>('/v3/price-day-ahead/past', { zone, datetime })
  }

  getDayAheadPricePastRange(zone: string, start: string, end: string) {
    return this.get<{ zone: string; data: EM_DayAheadPriceResponse[] }>(
      '/v3/price-day-ahead/past-range',
      { zone, start, end },
    )
  }

  getDayAheadPriceForecast(zone: string) {
    return this.get<{ zone: string; data: EM_DayAheadPriceResponse[] }>(
      '/v3/price-day-ahead/forecast',
      { zone },
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODULE 1 — Identity + Access  (zones, zone, data-centers)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Returns full zone access map for the current token.
   * Without auth-token returns all known zones (public endpoint).
   */
  getZones() {
    return this.get<EM_ZonesResponse>('/v3/zones')
  }

  getZone(zone: string) {
    return this.get<EM_ZoneInfo>('/v3/zone', { zone })
  }

  getZoneByCoords(lat: number, lon: number) {
    return this.get<EM_ZoneInfo>('/v3/zone', { lat, lon })
  }

  getDataCenters(filters?: { zone?: string; dataCenterProvider?: string; page?: number; limit?: number }) {
    return this.get<EM_DataCenter[]>('/v3/data-centers', filters)
  }

  // ─── Updated-since (backfill support) ───────────────────────────────────────

  getUpdatedSince(params: {
    zone: string
    since: string
    start?: string
    end?: string
    limit?: number
    threshold?: string
  }) {
    return this.get<EM_UpdatedSinceResponse>('/v3/updated-since', params)
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODULE 8 — Optimization  (beta endpoints)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Carbon-Aware Compute Optimizer.
   * Finds the optimal time AND location to run a compute workload.
   */
  runCarbonAwareOptimizer(body: EM_CarbonAwareOptimizerRequest) {
    return this.post<EM_CarbonAwareOptimizerResponse>('/beta/carbon-aware-optimizer', body)
  }

  /**
   * Smart Charging Optimizer.
   * Finds optimal EV charging window based on grid carbon / renewable share.
   */
  runSmartChargingOptimizer(body: EM_SmartChargingOptimizerRequest) {
    return this.post<EM_SmartChargingOptimizerResponse>('/beta/smart-charging-optimizer', body)
  }
}

// Singleton — use this everywhere; do not construct new instances per-request.
export const emClient = new ElectricityMapsFullClient()
