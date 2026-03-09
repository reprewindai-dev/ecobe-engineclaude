/**
 * CarbonProvider — the interface every provider adapter must implement.
 *
 * Rules enforced here:
 * - All methods return ProviderResult (never throw to the caller)
 * - All returned signals must be normalised to CarbonSignal
 * - Providers declare which regions they support; the router respects that
 */

import { ProviderName, ProviderResult } from './types'

export interface CarbonProvider {
  readonly name: ProviderName

  /**
   * Returns true if this provider can serve data for at least one of the
   * given regions.  Used by the router to skip providers before making
   * any network calls.
   */
  supportsRegion(region: string): boolean

  /**
   * Fetch the most recent (real-time) carbon intensity for a region.
   * Never throws — errors are returned inside ProviderResult.
   */
  getCurrentIntensity(region: string): Promise<ProviderResult>

  /**
   * Fetch forecast data points between [from, to] for a region.
   * Returns an empty array on failure, not a thrown error.
   */
  getForecast(region: string, from: Date, to: Date): Promise<ProviderResult[]>

  /**
   * Fetch historical data points between [from, to] for a region.
   * Primarily used for back-testing and model training.
   */
  getHistorical(region: string, from: Date, to: Date): Promise<ProviderResult[]>
}
