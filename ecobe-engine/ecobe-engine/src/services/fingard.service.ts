// Region grid mapping data for CO₂Router
export const REGION_GRID_MAPPING: Record<string, { zone: string; country: string }> = {
  'US-CAL-CISO': { zone: 'US-CAL-CISO', country: 'US' },
  'US-PJM-PJM': { zone: 'US-PJM-PJM', country: 'US' },
  'US-NEISO': { zone: 'US-NEISO', country: 'US' },
  'US-NYISO': { zone: 'US-NYISO', country: 'US' },
  'US-ERCOT': { zone: 'US-ERCOT', country: 'US' },
  'US-SPP': { zone: 'US-SPP', country: 'US' },
  'US-MISO': { zone: 'US-MISO', country: 'US' },
  'US-NW': { zone: 'US-NW', country: 'US' },
  'FR': { zone: 'FR', country: 'FR' },
  'DE': { zone: 'DE', country: 'DE' },
  'GB': { zone: 'GB', country: 'GB' },
  'IT': { zone: 'IT', country: 'IT' },
  'ES': { zone: 'ES', country: 'ES' },
  'NL': { zone: 'NL', country: 'NL' },
  'BE': { zone: 'BE', country: 'BE' },
  'AT': { zone: 'AT', country: 'AT' },
  'CH': { zone: 'CH', country: 'CH' },
  'DK': { zone: 'DK', country: 'DK' },
  'NO': { zone: 'NO', country: 'NO' },
  'SE': { zone: 'SE', country: 'SE' },
  'FI': { zone: 'FI', country: 'FI' },
  'PL': { zone: 'PL', country: 'PL' },
  'CZ': { zone: 'CZ', country: 'CZ' },
  'GR': { zone: 'GR', country: 'GR' },
  'PT': { zone: 'PT', country: 'PT' },
  'IE': { zone: 'IE', country: 'IE' },
  'HU': { zone: 'HU', country: 'HU' },
  'RO': { zone: 'RO', country: 'RO' },
  'BG': { zone: 'BG', country: 'BG' },
  'HR': { zone: 'HR', country: 'HR' },
  'SI': { zone: 'SI', country: 'SI' },
  'SK': { zone: 'SK', country: 'SK' },
  'EE': { zone: 'EE', country: 'EE' },
  'LV': { zone: 'LV', country: 'LV' },
  'LT': { zone: 'LT', country: 'LT' },
  'JP': { zone: 'JP', country: 'JP' },
  'KR': { zone: 'KR', country: 'KR' },
  'TW': { zone: 'TW', country: 'TW' },
  'SG': { zone: 'SG', country: 'SG' },
  'AU': { zone: 'AU', country: 'AU' },
  'CA': { zone: 'CA', country: 'CA' },
  'BR': { zone: 'BR', country: 'BR' },
  'IN': { zone: 'IN', country: 'IN' },
  'CN': { zone: 'CN', country: 'CN' },
  'MX': { zone: 'MX', country: 'MX' },
  'AR': { zone: 'AR', country: 'AR' },
  'CL': { zone: 'CL', country: 'CL' },
  'CO': { zone: 'CO', country: 'CO' },
  'PE': { zone: 'PE', country: 'PE' },
  'UAE': { zone: 'UAE', country: 'AE' },
  'IL': { zone: 'IL', country: 'IL' },
  'TR': { zone: 'TR', country: 'TR' },
  'EG': { zone: 'EG', country: 'EG' },
  'SA': { zone: 'SA', country: 'SA' },
  'NG': { zone: 'NG', country: 'NG' },
  'KE': { zone: 'KE', country: 'KE' },
}

export function getPrimaryProvider(country: string): string {
  switch (country) {
    case 'US':
      return 'watttime'
    case 'FR':
    case 'DE':
    case 'GB':
    case 'IT':
    case 'ES':
    case 'NL':
    case 'BE':
    case 'AT':
    case 'CH':
    case 'DK':
    case 'NO':
    case 'SE':
    case 'FI':
    case 'PL':
    case 'CZ':
    case 'GR':
    case 'PT':
    case 'IE':
    case 'HU':
    case 'RO':
    case 'BG':
    case 'HR':
    case 'SI':
    case 'SK':
    case 'EE':
    case 'LV':
    case 'LT':
      return 'electricity_maps'
    case 'JP':
    case 'KR':
    case 'TW':
    case 'SG':
    case 'AU':
      return 'electricity_maps'
    case 'CA':
      return 'electricity_maps'
    case 'BR':
    case 'IN':
    case 'CN':
    case 'ZA':
    case 'MX':
    case 'AR':
    case 'CL':
    case 'CO':
    case 'PE':
      return 'electricity_maps'
    case 'AE':
    case 'IL':
    case 'TR':
    case 'EG':
    case 'SA':
      return 'electricity_maps'
    case 'NG':
    case 'KE':
      return 'electricity_maps'
    default:
      return 'electricity_maps'
  }
}
