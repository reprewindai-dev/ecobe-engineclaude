/**
 * Provider registry.
 *
 * Instantiates and holds provider adapters.  The router calls this to get
 * a provider by name; nothing else should instantiate providers directly.
 *
 * Provider priority is NOT set here — it comes from carbon-providers.ts config.
 */

import { CarbonProvider } from './provider-interface'
import { ProviderName } from './types'
import { ElectricityMapsProvider } from './providers/electricity-maps'
import { EmberProvider } from './providers/ember'
import { WattTimeProvider } from './providers/watttime'

const _registry = new Map<ProviderName, CarbonProvider>([
  ['electricity_maps', new ElectricityMapsProvider()],
  ['ember', new EmberProvider()],
  ['watttime', new WattTimeProvider()],
])

export function getProvider(name: ProviderName): CarbonProvider | undefined {
  return _registry.get(name)
}

export function getAllProviders(): CarbonProvider[] {
  return Array.from(_registry.values())
}
