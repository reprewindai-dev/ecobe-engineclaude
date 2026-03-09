/**
 * WattTime provider adapter — scaffold.
 *
 * WattTime (https://www.watttime.org) provides marginal carbon intensity
 * (MOER) which measures the emissions of the next unit of power generated —
 * more accurate than average intensity for demand-response decisions.
 *
 * Status: SCAFFOLD — not yet activated.
 * Enable by setting WATTTIME_API_KEY and CARBON_PROVIDER_WATTTIME_ROLE=fallback.
 *
 * API reference: https://docs.watttime.org/
 * Auth: Basic auth (username + password) to obtain a 30-min JWT, then Bearer.
 */

import { CarbonProvider } from '../provider-interface'
import { ProviderResult } from '../types'

const WATTTIME_REGIONS = ['US-CAL-CISO', 'US-TEX-ERCO', 'US-NW-PACW', 'US-MIDA-PJM', 'US-MIDW-MISO']

export class WattTimeProvider implements CarbonProvider {
  readonly name = 'watttime' as const

  supportsRegion(region: string): boolean {
    return Boolean(process.env.WATTTIME_API_KEY) && WATTTIME_REGIONS.includes(region)
  }

  async getCurrentIntensity(_region: string): Promise<ProviderResult> {
    // TODO: implement WattTime /v3/signal-index endpoint
    // 1. Obtain JWT via POST /login with Basic auth
    // 2. GET /v3/signal-index?region=<ba>&signal_type=co2_moer
    // 3. Normalise to CarbonSignal
    return {
      ok: false,
      signal: null,
      error_code: 'NOT_IMPLEMENTED',
      error_message: 'WattTime adapter is a scaffold — set WATTTIME_API_KEY to activate',
    }
  }

  async getForecast(_region: string, _from: Date, _to: Date): Promise<ProviderResult[]> {
    // TODO: GET /v3/forecast?region=<ba>&signal_type=co2_moer
    return []
  }

  async getHistorical(_region: string, _from: Date, _to: Date): Promise<ProviderResult[]> {
    // TODO: GET /v3/historical?region=<ba>&signal_type=co2_moer&start=...&end=...
    return []
  }
}
