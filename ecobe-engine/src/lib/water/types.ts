export type WaterSignalType =
  | 'average_operational'
  | 'scarcity_weighted_operational'
  | 'site_measured'
  | 'unknown'

export type WaterDataQuality = 'high' | 'medium' | 'low'

export interface WaterSignalInput {
  region: string
  waterIntensityLPerKwh: number
  waterStressIndex: number
  waterQualityIndex?: number | null
  droughtRiskIndex?: number | null
  scarcityCfMonthly?: number | null
  scarcityCfAnnual?: number | null
  siteWaterIntensityLPerKwh?: number | null
  source: string
  referenceTime?: string | null
  dataQuality?: WaterDataQuality
  signalType?: WaterSignalType
  confidence?: number | null
  datasetVersion?: string | null
  metadata?: Record<string, unknown>
}

export interface ResolvedWaterSignal {
  region: string
  waterIntensityLPerKwh: number
  waterStressIndex: number
  waterQualityIndex: number | null
  droughtRiskIndex: number | null
  scarcityCfMonthly: number | null
  scarcityCfAnnual: number | null
  siteWaterIntensityLPerKwh: number | null
  source: string
  referenceTime: string | null
  dataQuality: WaterDataQuality
  signalType: WaterSignalType
  confidence: number | null
  datasetVersion: string | null
  metadata: Record<string, unknown>
}

export interface WaterComputation {
  totalWaterIntensityLPerKwh: number
  waterLiters: number
  scarcityWeightedImpact: number
}

export interface WaterEvaluation extends WaterComputation {
  signal: ResolvedWaterSignal | null
  source: string | null
  confidence: number | null
  fallbackUsed: boolean
  guardrailTriggered: boolean
  hardBlocked: boolean
  reasonCode: string | null
}
