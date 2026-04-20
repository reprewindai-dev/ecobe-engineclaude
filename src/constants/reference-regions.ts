export interface ReferenceRegion {
  code: string
  name: string
  country: string
}

export const REFERENCE_REGIONS: ReferenceRegion[] = [
  { code: 'US-CAL-CISO', name: 'California (US)', country: 'US' },
  { code: 'FR', name: 'France', country: 'FR' },
  { code: 'DE', name: 'Germany', country: 'DE' },
  { code: 'GB', name: 'United Kingdom', country: 'GB' },
  { code: 'SE', name: 'Sweden', country: 'SE' },
  { code: 'NO', name: 'Norway', country: 'NO' },
]

