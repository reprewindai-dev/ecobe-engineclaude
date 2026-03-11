export interface GridSignalSnapshot {
  region: string
  balancingAuthority: string | null
  timestamp: string
  demandMwh: number | null
  demandChangeMwh: number | null
  demandChangePct: number | null
  netGenerationMwh: number | null
  netInterchangeMwh: number | null
  renewableRatio: number | null
  fossilRatio: number | null
  carbonSpikeProbability: number | null
  curtailmentProbability: number | null
  importCarbonLeakageScore: number | null
  signalQuality: 'high' | 'medium' | 'low'
  estimatedFlag: boolean
  syntheticFlag: boolean
  source: 'eia930'
  metadata: Record<string, unknown>
}

export interface EIABalanceData {
  period: string
  respondent: string
  'respondent-name': string
  type: string
  value: number
  'value-units': string
}

export interface EIAInterchangeData {
  period: string
  'from-ba': string
  'from-ba-name': string
  'to-ba': string
  'to-ba-name': string
  type: string
  value: number
  'value-units': string
}

export interface EIASubregionData {
  period: string
  respondent: string
  'respondent-name': string
  parent: string
  'parent-name': string
  subregion: string
  'subregion-name': string
  type: string
  value: number
  'value-units': string
}

export interface GridFeatures {
  demandRampPct: number | null
  fossilRatio: number | null
  renewableRatio: number | null
  carbonSpikeProbability: number | null
  curtailmentProbability: number | null
  importCarbonLeakageScore: number | null
}
