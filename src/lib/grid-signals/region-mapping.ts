/**
 * Cloud Region ↔ Balancing Authority Mapping
 *
 * Maps cloud provider regions (AWS, GCP, Azure) to US balancing authorities
 * for EIA-930 grid signal data. Non-US regions return null (use WattTime/EM only).
 *
 * LOCKED REGIONS (from product doctrine):
 * - us-east-1, us-west-2, eu-west-1, eu-central-1, ap-southeast-1, ap-northeast-1
 */

export interface RegionMapping {
  cloudRegion: string
  balancingAuthority: string | null
  eiaRespondent: string | null
  country: string
  hasEia930Coverage: boolean
  notes?: string
}

/**
 * Complete mapping table for locked cloud regions → EIA BAs
 * Plus additional common cloud regions for extensibility
 */
const REGION_MAP: RegionMapping[] = [

  // ══════════════════════════════════════════════════════════
  // CO2 ROUTER CANONICAL REGION CODES (provider-agnostic)
  // ══════════════════════════════════════════════════════════

  // ── North America — US (EIA-930 live coverage) ──
  { cloudRegion: 'us-east-1',      balancingAuthority: 'PJM',   eiaRespondent: 'PJM',  country: 'US', hasEia930Coverage: true,  notes: 'Virginia — PJM Dominion zone. AWS/GCP/Azure primary east.' },
  { cloudRegion: 'us-east-2',      balancingAuthority: 'PJM',   eiaRespondent: 'PJM',  country: 'US', hasEia930Coverage: true,  notes: 'Ohio — PJM West zone. AWS us-east-2.' },
  { cloudRegion: 'us-west-1',      balancingAuthority: 'CISO',  eiaRespondent: 'CISO', country: 'US', hasEia930Coverage: true,  notes: 'N. California — CAISO. WattTime MOER free tier: CAISO_NORTH.' },
  { cloudRegion: 'us-west-2',      balancingAuthority: 'BPAT',  eiaRespondent: 'BPAT', country: 'US', hasEia930Coverage: true,  notes: 'Oregon — BPA. Predominantly hydro+wind. Cleanest US zone.' },
  { cloudRegion: 'us-central-1',   balancingAuthority: 'MISO',  eiaRespondent: 'MISO', country: 'US', hasEia930Coverage: true,  notes: 'Iowa/Midwest — MISO. High wind build-out.' },
  { cloudRegion: 'us-south-1',     balancingAuthority: 'ERCO',  eiaRespondent: 'ERCO', country: 'US', hasEia930Coverage: true,  notes: 'Texas — ERCOT isolated grid. Fast-growing wind.' },
  { cloudRegion: 'us-northeast-1', balancingAuthority: 'ISNE',  eiaRespondent: 'ISNE', country: 'US', hasEia930Coverage: true,  notes: 'New England — ISO-NE. Nuclear + offshore wind.' },

  // ── North America — Canada (Electricity Maps / Ember) ──
  { cloudRegion: 'ca-central-1',   balancingAuthority: null, eiaRespondent: null, country: 'CA', hasEia930Coverage: false, notes: 'Ontario IESO. Nuclear+hydro. 40gCO2/kWh. Use EM zone CA-ON.' },
  { cloudRegion: 'ca-west-1',      balancingAuthority: null, eiaRespondent: null, country: 'CA', hasEia930Coverage: false, notes: 'Quebec Hydro-Quebec. 15gCO2/kWh. Near-zero carbon. EM: CA-QC.' },
  { cloudRegion: 'ca-bc-1',        balancingAuthority: null, eiaRespondent: null, country: 'CA', hasEia930Coverage: false, notes: 'BC Hydro. Run-of-river hydro. 20gCO2/kWh. EM: CA-BC.' },

  // ── South America (Electricity Maps / Ember) ──
  { cloudRegion: 'sa-east-1',      balancingAuthority: null, eiaRespondent: null, country: 'BR', hasEia930Coverage: false, notes: 'Brazil SE — ONS SIN. Hydro+wind+solar. 95gCO2/kWh. EM: BR-SE.' },
  { cloudRegion: 'sa-south-1',     balancingAuthority: null, eiaRespondent: null, country: 'BR', hasEia930Coverage: false, notes: 'Brazil South — ONS SIN. High wind. 110gCO2/kWh. EM: BR-S.' },
  { cloudRegion: 'sa-west-1',      balancingAuthority: null, eiaRespondent: null, country: 'CL', hasEia930Coverage: false, notes: 'Chile CEN. Atacama solar + gas. 230gCO2/kWh. EM: CL-SEN.' },
  { cloudRegion: 'sa-north-1',     balancingAuthority: null, eiaRespondent: null, country: 'CO', hasEia930Coverage: false, notes: 'Colombia XM. Hydro-dominant. El Nino risk. 175gCO2/kWh. EM: CO.' },

  // ── Europe — GB Carbon Intensity API (free, no auth) ──
  { cloudRegion: 'eu-west-2',      balancingAuthority: null, eiaRespondent: null, country: 'GB', hasEia930Coverage: false, notes: 'UK National Grid ESO. GB Carbon API free, 96h forecast. 175gCO2/kWh.' },
  { cloudRegion: 'eu-west-1',      balancingAuthority: null, eiaRespondent: null, country: 'IE', hasEia930Coverage: false, notes: 'Ireland EirGrid. Wind+gas. 290gCO2/kWh. WattTime/EM zone IE.' },
  { cloudRegion: 'eu-west-3',      balancingAuthority: null, eiaRespondent: null, country: 'NL', hasEia930Coverage: false, notes: 'Netherlands TenneT. Gas+offshore wind. 320gCO2/kWh. EM: NL.' },
  { cloudRegion: 'eu-west-4',      balancingAuthority: null, eiaRespondent: null, country: 'BE', hasEia930Coverage: false, notes: 'Belgium Elia. Nuclear+offshore wind. 155gCO2/kWh. EM: BE.' },
  { cloudRegion: 'eu-central-1',   balancingAuthority: null, eiaRespondent: null, country: 'DE', hasEia930Coverage: false, notes: 'Germany ENTSO-E. Lignite+solar/wind. 350gCO2/kWh. EM: DE.' },
  { cloudRegion: 'eu-central-2',   balancingAuthority: null, eiaRespondent: null, country: 'FR', hasEia930Coverage: false, notes: 'France RTE. ~70% nuclear. 55gCO2/kWh. EM: FR.' },
  { cloudRegion: 'eu-central-3',   balancingAuthority: null, eiaRespondent: null, country: 'CH', hasEia930Coverage: false, notes: 'Switzerland Swissgrid. Nuclear+alpine hydro. 45gCO2/kWh. EM: CH.' },
  { cloudRegion: 'eu-central-4',   balancingAuthority: null, eiaRespondent: null, country: 'DK', hasEia930Coverage: false, notes: 'Denmark West DK1. Energi Data Service free API. 155gCO2/kWh.' },
  { cloudRegion: 'eu-central-5',   balancingAuthority: null, eiaRespondent: null, country: 'DK', hasEia930Coverage: false, notes: 'Denmark East DK2. Energi Data Service free API. 130gCO2/kWh.' },
  { cloudRegion: 'eu-north-1',     balancingAuthority: null, eiaRespondent: null, country: 'SE', hasEia930Coverage: false, notes: 'Sweden Svenska Kraftnat. Nuclear+hydro. 22gCO2/kWh. EM: SE.' },
  { cloudRegion: 'eu-north-2',     balancingAuthority: null, eiaRespondent: null, country: 'NO', hasEia930Coverage: false, notes: 'Norway Statnett. ~100% hydro. 18gCO2/kWh. Cleanest in Europe. EM: NO.' },
  { cloudRegion: 'eu-north-3',     balancingAuthority: null, eiaRespondent: null, country: 'FI', hasEia930Coverage: false, notes: 'Finland Fingrid. Nuclear+hydro+wind. 95gCO2/kWh. Fingrid API (key req).' },
  { cloudRegion: 'eu-south-1',     balancingAuthority: null, eiaRespondent: null, country: 'ES', hasEia930Coverage: false, notes: 'Spain REE. Solar+wind+nuclear. 190gCO2/kWh. EM: ES.' },
  { cloudRegion: 'eu-south-2',     balancingAuthority: null, eiaRespondent: null, country: 'IT', hasEia930Coverage: false, notes: 'Italy Terna north zone. Gas+hydro+solar. 275gCO2/kWh. EM: IT-NO.' },
  { cloudRegion: 'eu-east-1',      balancingAuthority: null, eiaRespondent: null, country: 'PL', hasEia930Coverage: false, notes: 'Poland PSE. Coal-dominant. 650gCO2/kWh. Route away when possible.' },

  // ── Middle East & Africa ──
  { cloudRegion: 'me-south-1',     balancingAuthority: null, eiaRespondent: null, country: 'AE', hasEia930Coverage: false, notes: 'UAE TRANSCO. Gas-dominant. 520gCO2/kWh. Low cost. EM: AE.' },
  { cloudRegion: 'af-south-1',     balancingAuthority: null, eiaRespondent: null, country: 'ZA', hasEia930Coverage: false, notes: 'South Africa Eskom. Coal-dominant. 750gCO2/kWh. EM: ZA.' },

  // ── Asia Pacific ──
  { cloudRegion: 'ap-southeast-1', balancingAuthority: null, eiaRespondent: null, country: 'SG', hasEia930Coverage: false, notes: 'Singapore EMA. Gas city-state. 430gCO2/kWh. EM: SG.' },
  { cloudRegion: 'ap-southeast-2', balancingAuthority: null, eiaRespondent: null, country: 'AU', hasEia930Coverage: false, notes: 'Australia NSW AEMO NEM. Coal-heavy transition. 560gCO2/kWh. EM: AU-NSW.' },
  { cloudRegion: 'ap-southeast-3', balancingAuthority: null, eiaRespondent: null, country: 'AU', hasEia930Coverage: false, notes: 'Australia VIC AEMO NEM. Brown coal. 580gCO2/kWh. EM: AU-VIC.' },
  { cloudRegion: 'ap-southeast-4', balancingAuthority: null, eiaRespondent: null, country: 'AU', hasEia930Coverage: false, notes: 'Australia SA AEMO NEM. 72% renewable. 210gCO2/kWh. EM: AU-SA.' },
  { cloudRegion: 'ap-northeast-1', balancingAuthority: null, eiaRespondent: null, country: 'JP', hasEia930Coverage: false, notes: 'Japan Tokyo TEPCO. Post-Fukushima LNG. 480gCO2/kWh. EM: JP-TK.' },
  { cloudRegion: 'ap-northeast-2', balancingAuthority: null, eiaRespondent: null, country: 'KR', hasEia930Coverage: false, notes: 'South Korea KEPCO. Nuclear+coal+gas. 430gCO2/kWh. EM: KR.' },
  { cloudRegion: 'ap-northeast-3', balancingAuthority: null, eiaRespondent: null, country: 'JP', hasEia930Coverage: false, notes: 'Japan Osaka Kansai Electric. More nuclear than TEPCO. 390gCO2/kWh. EM: JP-KN.' },
  { cloudRegion: 'ap-south-1',     balancingAuthority: null, eiaRespondent: null, country: 'IN', hasEia930Coverage: false, notes: 'India Mumbai WRLDC. Coal-dominant. 680gCO2/kWh. EM: IN-WE.' },
  { cloudRegion: 'ap-south-2',     balancingAuthority: null, eiaRespondent: null, country: 'IN', hasEia930Coverage: false, notes: 'India Hyderabad SRLDC. Higher solar. 620gCO2/kWh. EM: IN-SO.' },

  // ══════════════════════════════════════════════════════════
  // CLOUD PROVIDER NATIVE ALIASES (AWS / GCP / Azure)
  // Maps provider-specific codes → canonical CO2 Router region
  // ══════════════════════════════════════════════════════════

  // ── AWS aliases ──
  { cloudRegion: 'us-east-1',        balancingAuthority: 'PJM',  eiaRespondent: 'PJM',  country: 'US', hasEia930Coverage: true  },
  { cloudRegion: 'us-east-2',        balancingAuthority: 'PJM',  eiaRespondent: 'PJM',  country: 'US', hasEia930Coverage: true  },
  { cloudRegion: 'us-west-1',        balancingAuthority: 'CISO', eiaRespondent: 'CISO', country: 'US', hasEia930Coverage: true  },
  { cloudRegion: 'us-west-2',        balancingAuthority: 'BPAT', eiaRespondent: 'BPAT', country: 'US', hasEia930Coverage: true  },

  // ── GCP aliases ──
  { cloudRegion: 'us-central1',      balancingAuthority: 'MISO', eiaRespondent: 'MISO', country: 'US', hasEia930Coverage: true,  notes: 'GCP Iowa → MISO' },
  { cloudRegion: 'us-east4',         balancingAuthority: 'PJM',  eiaRespondent: 'PJM',  country: 'US', hasEia930Coverage: true,  notes: 'GCP N.Virginia → PJM' },
  { cloudRegion: 'us-west1',         balancingAuthority: 'BPAT', eiaRespondent: 'BPAT', country: 'US', hasEia930Coverage: true,  notes: 'GCP Oregon → BPAT' },
  { cloudRegion: 'europe-west1',     balancingAuthority: null,   eiaRespondent: null,   country: 'BE', hasEia930Coverage: false, notes: 'GCP Belgium → Elia' },
  { cloudRegion: 'europe-west9',     balancingAuthority: null,   eiaRespondent: null,   country: 'FR', hasEia930Coverage: false, notes: 'GCP Paris → RTE' },
  { cloudRegion: 'europe-north1',    balancingAuthority: null,   eiaRespondent: null,   country: 'FI', hasEia930Coverage: false, notes: 'GCP Finland → Fingrid' },
  { cloudRegion: 'northamerica-northeast1', balancingAuthority: null, eiaRespondent: null, country: 'CA', hasEia930Coverage: false, notes: 'GCP Montreal → Hydro-Quebec CA-QC' },
  { cloudRegion: 'southamerica-east1', balancingAuthority: null, eiaRespondent: null,   country: 'BR', hasEia930Coverage: false, notes: 'GCP Sao Paulo → ONS BR-SE' },

  // ── Azure aliases ──
  { cloudRegion: 'eastus',           balancingAuthority: 'PJM',  eiaRespondent: 'PJM',  country: 'US', hasEia930Coverage: true,  notes: 'Azure Virginia → PJM' },
  { cloudRegion: 'eastus2',          balancingAuthority: 'PJM',  eiaRespondent: 'PJM',  country: 'US', hasEia930Coverage: true,  notes: 'Azure Virginia2 → PJM' },
  { cloudRegion: 'westus2',          balancingAuthority: 'BPAT', eiaRespondent: 'BPAT', country: 'US', hasEia930Coverage: true,  notes: 'Azure Washington → BPAT' },
  { cloudRegion: 'centralus',        balancingAuthority: 'SPP',  eiaRespondent: 'SPP',  country: 'US', hasEia930Coverage: true,  notes: 'Azure Iowa → SPP' },
  { cloudRegion: 'southcentralus',   balancingAuthority: 'ERCO', eiaRespondent: 'ERCO', country: 'US', hasEia930Coverage: true,  notes: 'Azure Texas → ERCOT' },
  { cloudRegion: 'northeurope',      balancingAuthority: null,   eiaRespondent: null,   country: 'IE', hasEia930Coverage: false, notes: 'Azure Ireland → EirGrid' },
  { cloudRegion: 'westeurope',       balancingAuthority: null,   eiaRespondent: null,   country: 'NL', hasEia930Coverage: false, notes: 'Azure Netherlands → TenneT NL' },
  { cloudRegion: 'swedencentral',    balancingAuthority: null,   eiaRespondent: null,   country: 'SE', hasEia930Coverage: false, notes: 'Azure Sweden → Svenska Kraftnat' },
  { cloudRegion: 'norwayeast',       balancingAuthority: null,   eiaRespondent: null,   country: 'NO', hasEia930Coverage: false, notes: 'Azure Norway → Statnett' },
  { cloudRegion: 'francecentral',    balancingAuthority: null,   eiaRespondent: null,   country: 'FR', hasEia930Coverage: false, notes: 'Azure Paris → RTE' },
  { cloudRegion: 'brazilsouth',      balancingAuthority: null,   eiaRespondent: null,   country: 'BR', hasEia930Coverage: false, notes: 'Azure Brazil → ONS BR-SE' },
  { cloudRegion: 'australiaeast',    balancingAuthority: null,   eiaRespondent: null,   country: 'AU', hasEia930Coverage: false, notes: 'Azure Sydney → AEMO AU-NSW' },
  { cloudRegion: 'japaneast',        balancingAuthority: null,   eiaRespondent: null,   country: 'JP', hasEia930Coverage: false, notes: 'Azure Tokyo → TEPCO JP-TK' },
  { cloudRegion: 'koreacentral',     balancingAuthority: null,   eiaRespondent: null,   country: 'KR', hasEia930Coverage: false, notes: 'Azure Seoul → KEPCO' },
  { cloudRegion: 'canadacentral',    balancingAuthority: null,   eiaRespondent: null,   country: 'CA', hasEia930Coverage: false, notes: 'Azure Toronto → Ontario IESO CA-ON' },
  { cloudRegion: 'canadaeast',       balancingAuthority: null,   eiaRespondent: null,   country: 'CA', hasEia930Coverage: false, notes: 'Azure Quebec → Hydro-Quebec CA-QC' },
]

const regionIndex = new Map(REGION_MAP.map(r => [r.cloudRegion, r]))

/**
 * Look up the balancing authority for a cloud region
 */
export function getRegionMapping(cloudRegion: string): RegionMapping | null {
  return regionIndex.get(cloudRegion) ?? null
}

/**
 * Check if a cloud region has EIA-930 coverage
 */
export function hasEia930Coverage(cloudRegion: string): boolean {
  const mapping = regionIndex.get(cloudRegion)
  return mapping?.hasEia930Coverage ?? false
}

/**
 * Get the EIA respondent code for a cloud region (null if non-US)
 */
export function getEiaRespondent(cloudRegion: string): string | null {
  return regionIndex.get(cloudRegion)?.eiaRespondent ?? null
}

/**
 * Get the balancing authority for a cloud region (null if non-US)
 */
export function getBalancingAuthority(cloudRegion: string): string | null {
  return regionIndex.get(cloudRegion)?.balancingAuthority ?? null
}

/**
 * Get all unique US balancing authorities that have cloud region mappings
 * Used by the ingestion worker to know which BAs to fetch
 */
export function getUsBalancingAuthorities(): Array<{
  region: string
  balancingAuthority: string
  eiaRespondent: string
}> {
  const seen = new Set<string>()
  const result: Array<{ region: string; balancingAuthority: string; eiaRespondent: string }> = []

  for (const mapping of REGION_MAP) {
    if (mapping.hasEia930Coverage && mapping.balancingAuthority && mapping.eiaRespondent) {
      if (!seen.has(mapping.balancingAuthority)) {
        seen.add(mapping.balancingAuthority)
        result.push({
          region: mapping.balancingAuthority,
          balancingAuthority: mapping.balancingAuthority,
          eiaRespondent: mapping.eiaRespondent,
        })
      }
    }
  }

  return result
}

/**
 * Get all cloud regions in the mapping table
 */
export function getAllMappedRegions(): RegionMapping[] {
  return [...REGION_MAP]
}
