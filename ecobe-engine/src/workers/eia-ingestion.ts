import * as cron from 'node-cron'
import { eia930 } from '../lib/grid-signals/eia-client'
import { gridStatus } from '../lib/grid-signals/gridstatus-client'
import { BalanceParser } from '../lib/grid-signals/balance-parser'
import { InterchangeParser } from '../lib/grid-signals/interchange-parser'
import { FuelMixParser } from '../lib/grid-signals/fuel-mix-parser'
import { GridFeatureEngine } from '../lib/grid-signals/grid-feature-engine'
import { GridSignalCache } from '../lib/grid-signals/grid-signal-cache'
import { GridSignalAudit } from '../lib/grid-signals/grid-signal-audit'
import { getUsBalancingAuthorities } from '../lib/grid-signals/region-mapping'
import { TaskAlreadyRunningError, withTaskLock } from '../lib/task-lock'
import { setWorkerStatus } from '../routes/system'
import { prisma } from '../lib/db'

interface RegionConfig {
  region: string
  balancingAuthority: string
  eiaRespondent: string
}

type IngestionRunResult = {
  startedAt: string
  finishedAt: string
  successCount: number
  failureCount: number
  dataSource: 'gridstatus' | 'eia_direct' | 'mixed'
}

type RegionIngestionResult = {
  snapshotsProcessed: number
  rawRecordsStored: number
  featuresCalculated: number
  dataSource: 'gridstatus' | 'eia_direct'
}

// Default region configurations — now sourced from region-mapping.ts
// with fallback to hardcoded list if mapping returns empty
const DEFAULT_REGIONS: RegionConfig[] = (() => {
  const mapped = getUsBalancingAuthorities()
  if (mapped.length > 0) return mapped

  // Fallback: original hardcoded list
  return [
    { region: 'PJM', balancingAuthority: 'PJM', eiaRespondent: 'PJM' },
    { region: 'ERCOT', balancingAuthority: 'ERCO', eiaRespondent: 'ERCO' },
    { region: 'CAISO', balancingAuthority: 'CISO', eiaRespondent: 'CISO' },
    { region: 'MISO', balancingAuthority: 'MISO', eiaRespondent: 'MISO' },
    { region: 'NYISO', balancingAuthority: 'NYISO', eiaRespondent: 'NYISO' },
    { region: 'ISO-NE', balancingAuthority: 'ISNE', eiaRespondent: 'ISNE' },
    { region: 'SWPP', balancingAuthority: 'SWPP', eiaRespondent: 'SWPP' },
  ]
})()

const MAX_CONCURRENT_REGION_INGESTIONS = 2

export class EIAIngestionWorker {
  private isRunning = false
  private ingestionTask?: cron.ScheduledTask
  private useGridStatus: boolean
  private activeRun: Promise<IngestionRunResult> | null = null
  private activeRunId: string | null = null

  constructor() {
    this.useGridStatus = gridStatus.isAvailable
    if (this.useGridStatus) {
      console.log('EIA ingestion: GridStatus.io adapter active (real fuel mix data)')
    } else {
      console.log('EIA ingestion: Using direct EIA API (fuel mix via subregion heuristic)')
    }
  }

  /**
   * Start the EIA-930 ingestion worker
   */
  async start(schedule: string = '0 */15 * * * *'): Promise<void> {
    if (this.isRunning) {
      console.warn('EIA ingestion worker is already running')
      return
    }

    console.log('Starting EIA-930 ingestion worker...')
    this.isRunning = true

    setWorkerStatus('eiaIngestion', {
      running: true,
      lastRun: null,
      nextRun: null,
      activeRunId: null,
    })

    // Run initial ingestion
    await this.runIngestion()

    // Schedule recurring ingestion
    this.ingestionTask = cron.schedule(schedule, async () => {
      try {
        await this.runIngestion()
      } catch (error) {
        console.error('EIA ingestion failed:', error)
      }
    })

    console.log(`EIA-930 ingestion worker started with schedule: ${schedule}`)
  }

  /**
   * Stop the EIA-930 ingestion worker
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    console.log('Stopping EIA-930 ingestion worker...')
    this.isRunning = false
    setWorkerStatus('eiaIngestion', {
      running: false,
      activeRunId: null,
    })

    if (this.ingestionTask) {
      this.ingestionTask.stop()
      this.ingestionTask = undefined
    }

    console.log('EIA-930 ingestion worker stopped')
  }

  /**
   * Run the ingestion process
   */
  async runOnce(): Promise<IngestionRunResult> {
    return this.runIngestion()
  }

  private async runIngestion(): Promise<IngestionRunResult> {
    if (this.activeRun) {
      throw new TaskAlreadyRunningError('eia_ingestion', this.activeRunId)
    }

    this.activeRun = withTaskLock('eia_ingestion', 15 * 60, async (runId) => {
      this.activeRunId = runId ?? `local-eia-${Date.now()}`
      setWorkerStatus('eiaIngestion', {
        running: true,
        activeRunId: this.activeRunId,
      })

      return this.executeIngestion()
    }).then(({ result }) => result)

    try {
      return await this.activeRun
    } finally {
      this.activeRun = null
      this.activeRunId = null
      setWorkerStatus('eiaIngestion', {
        running: this.isRunning,
        activeRunId: null,
      })
    }
  }

  private async executeIngestion(): Promise<IngestionRunResult> {
    const runStart = new Date()
    console.log(`Starting EIA-930 ingestion at ${runStart.toISOString()} [source: ${this.useGridStatus ? 'GridStatus.io' : 'EIA Direct'}]`)

    try {
      // Get time window for ingestion (last 48 hours)
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 48 * 60 * 60 * 1000)

      const results = await this.ingestRegionsWithConcurrency(DEFAULT_REGIONS, startTime, endTime)

      // Log results
      let successCount = 0
      let failureCount = 0
      const dataSourcesUsed = new Set<'gridstatus' | 'eia_direct'>()

      for (const result of results) {
        if (result.status === 'fulfilled') {
          successCount++
          dataSourcesUsed.add(result.value.dataSource)
        } else {
          failureCount++
          console.error('Region ingestion failed:', result.reason)
        }
      }

      console.log(`EIA-930 ingestion completed: ${successCount} successful, ${failureCount} failed`)

      // Update worker status
      setWorkerStatus('eiaIngestion', {
        running: true,
        lastRun: runStart.toISOString(),
        nextRun: null,
        activeRunId: this.activeRunId,
      })

      return {
        startedAt: runStart.toISOString(),
        finishedAt: new Date().toISOString(),
        successCount,
        failureCount,
        dataSource: dataSourcesUsed.size > 1 ? 'mixed' : dataSourcesUsed.has('eia_direct') ? 'eia_direct' : 'gridstatus',
      }
    } catch (error) {
      console.error('EIA-930 ingestion failed:', error)
      setWorkerStatus('eiaIngestion', {
        running: false,
        lastRun: new Date().toISOString(),
        nextRun: null,
        activeRunId: this.activeRunId,
      })
      throw error
    }
  }

  /**
   * Ingest data for a single region
   */
  private async ingestRegion(
    config: RegionConfig,
    startTime: Date,
    endTime: Date
  ): Promise<RegionIngestionResult> {
    console.log(`Ingesting EIA-930 data for ${config.region} (${config.balancingAuthority}) [${this.useGridStatus ? 'GridStatus' : 'EIA'}]`)

    if (this.useGridStatus) {
      return this.ingestFromGridStatus(config, startTime, endTime)
    } else {
      return this.ingestFromDirectEia(config, startTime, endTime)
    }
  }

  /**
   * GridStatus.io ingestion path — preferred when API key is available
   * Uses real fuel mix data instead of subregion heuristics
   */
  private async ingestFromGridStatus(
    config: RegionConfig,
    startTime: Date,
    endTime: Date
  ): Promise<RegionIngestionResult> {
    // Keep GridStatus requests sequential per region so one worker run cannot stampede the provider.
    const balanceData = await gridStatus.getBalance(config.eiaRespondent, startTime, endTime)

    if (balanceData.length === 0) {
      return this.ingestViaDirectFallback(config, startTime, endTime, 'missing GridStatus balance data')
    }

    const interchangeData = await gridStatus.getInterchange(config.eiaRespondent, startTime, endTime)
    const fuelMixData = await gridStatus.getFuelMix(config.eiaRespondent, startTime, endTime)

    if (interchangeData.length === 0 || fuelMixData.length === 0) {
      const missingDatasets = [
        ...(interchangeData.length === 0 ? ['interchange'] : []),
        ...(fuelMixData.length === 0 ? ['fuel_mix'] : []),
      ]
      return this.ingestViaDirectFallback(
        config,
        startTime,
        endTime,
        `incomplete GridStatus payload (${missingDatasets.join(', ')})`
      )
    }

    // Store raw balance/interchange data for audit
    await this.storeRawData(config, balanceData, interchangeData, [])

    // Parse balance data (GridStatus regional → EIABalanceData already mapped by adapter)
    const balanceSnapshots = BalanceParser.parseBalanceData(
      balanceData,
      config.region,
      config.balancingAuthority
    )
    const balanceWithChanges = BalanceParser.calculateDemandChanges(balanceSnapshots)

    // Parse interchange data
    const interchangeSnapshots = InterchangeParser.parseInterchangeData(
      interchangeData,
      config.region,
      config.balancingAuthority
    )

    // Parse REAL fuel mix data (replaces heuristic subregion parser)
    const fuelMixSnapshots = FuelMixParser.parseFuelMixData(
      fuelMixData,
      config.region,
      config.balancingAuthority
    )

    // Merge: balance + interchange + real fuel mix
    let merged = InterchangeParser.mergeIntoSnapshots(balanceWithChanges, interchangeSnapshots)
    merged = FuelMixParser.mergeIntoSnapshots(merged, fuelMixSnapshots)

    // Calculate derived features
    const snapshotsWithFeatures = GridFeatureEngine.updateSnapshotsWithFeatures(merged)
    const finalSnapshots = GridFeatureEngine.updateSignalQuality(snapshotsWithFeatures)

    if (finalSnapshots.length === 0) {
      return this.ingestViaDirectFallback(config, startTime, endTime, 'GridStatus produced no snapshots')
    }

    // Store, cache, audit
    await this.storeProcessedSnapshots(finalSnapshots)
    await this.cacheSnapshots(config.region, finalSnapshots)
    await this.recordAuditTrail(finalSnapshots, 'GRIDSTATUS_EIA930')

    return {
      snapshotsProcessed: finalSnapshots.length,
      rawRecordsStored: balanceData.length + interchangeData.length + fuelMixData.length,
      featuresCalculated: finalSnapshots.length,
      dataSource: 'gridstatus',
    }
  }

  /**
   * Direct EIA API ingestion path — fallback when GridStatus not available
   * Uses subregion heuristic for fuel mix (less accurate)
   */
  private async ingestFromDirectEia(
    config: RegionConfig,
    startTime: Date,
    endTime: Date
  ): Promise<RegionIngestionResult> {
    // Fetch raw data from EIA API
    const [balanceData, interchangeData] = await Promise.all([
      eia930.getBalance(config.eiaRespondent, startTime, endTime),
      eia930.getInterchange(config.eiaRespondent, startTime, endTime),
    ])

    // Store raw data for audit
    await this.storeRawData(config, balanceData, interchangeData, [])

    // Parse and normalize data
    const balanceSnapshots = BalanceParser.parseBalanceData(
      balanceData,
      config.region,
      config.balancingAuthority
    )
    const balanceWithChanges = BalanceParser.calculateDemandChanges(balanceSnapshots)

    const interchangeSnapshots = InterchangeParser.parseInterchangeData(
      interchangeData,
      config.region,
      config.balancingAuthority
    )

    // Merge the measured datasets available on the direct EIA path.
    const mergedSnapshots = InterchangeParser.mergeIntoSnapshots(
      balanceWithChanges,
      interchangeSnapshots
    )

    // Calculate derived features
    const snapshotsWithFeatures = GridFeatureEngine.updateSnapshotsWithFeatures(mergedSnapshots)
    const finalSnapshots = GridFeatureEngine.updateSignalQuality(snapshotsWithFeatures)

    if (finalSnapshots.length === 0) {
      throw new Error(`No direct EIA snapshots produced for ${config.region}`)
    }

    // Store processed snapshots
    await this.storeProcessedSnapshots(finalSnapshots)
    await this.cacheSnapshots(config.region, finalSnapshots)
    await this.recordAuditTrail(finalSnapshots, 'EIA_930')

    return {
      snapshotsProcessed: finalSnapshots.length,
      rawRecordsStored: balanceData.length + interchangeData.length,
      featuresCalculated: finalSnapshots.length,
      dataSource: 'eia_direct',
    }
  }

  private async ingestViaDirectFallback(
    config: RegionConfig,
    startTime: Date,
    endTime: Date,
    reason: string
  ): Promise<RegionIngestionResult> {
    if (!eia930.isAvailable) {
      throw new Error(`GridStatus degraded for ${config.region} (${reason}) and direct EIA fallback is unavailable`)
    }

    console.warn(
      `GridStatus degraded for ${config.region}; falling back to direct EIA (${reason})`
    )

    return this.ingestFromDirectEia(config, startTime, endTime)
  }

  private async ingestRegionsWithConcurrency(
    configs: RegionConfig[],
    startTime: Date,
    endTime: Date
  ): Promise<Array<PromiseSettledResult<RegionIngestionResult>>> {
    const results: Array<PromiseSettledResult<RegionIngestionResult>> = new Array(configs.length)
    let nextIndex = 0

    const runNext = async (): Promise<void> => {
      const currentIndex = nextIndex++
      if (currentIndex >= configs.length) {
        return
      }

      try {
        const value = await this.ingestRegion(configs[currentIndex], startTime, endTime)
        results[currentIndex] = {
          status: 'fulfilled',
          value,
        }
      } catch (reason) {
        results[currentIndex] = {
          status: 'rejected',
          reason,
        }
      }

      await runNext()
    }

    const workers = Array.from(
      { length: Math.min(MAX_CONCURRENT_REGION_INGESTIONS, configs.length) },
      () => runNext()
    )
    await Promise.all(workers)
    return results
  }

  /**
   * Store raw EIA-930 data
   */
  private async storeRawData(
    config: RegionConfig,
    balanceData: any[],
    interchangeData: any[],
    subregionData: any[]
  ): Promise<void> {
    // Store balance data
    if (balanceData.length > 0) {
      await prisma.eia930BalanceRaw.createMany({
        data: balanceData.map(record => ({
          period: record.period,
          respondent: record.respondent,
          respondentName: record['respondent-name'],
          type: record.type,
          value: record.value,
          valueUnits: record['value-units'],
          region: config.region,
          balancingAuthority: config.balancingAuthority
        })),
        skipDuplicates: true
      })
    }

    // Store interchange data
    if (interchangeData.length > 0) {
      await prisma.eia930InterchangeRaw.createMany({
        data: interchangeData.map(record => ({
          period: record.period,
          fromBa: record['from-ba'],
          fromBaName: record['from-ba-name'],
          toBa: record['to-ba'],
          toBaName: record['to-ba-name'],
          type: record.type,
          value: record.value,
          valueUnits: record['value-units'],
          region: config.region,
          balancingAuthority: config.balancingAuthority
        })),
        skipDuplicates: true
      })
    }

    // Store subregion data (only from direct EIA path)
    if (subregionData.length > 0) {
      await prisma.eia930SubregionRaw.createMany({
        data: subregionData.map(record => ({
          period: record.period,
          respondent: record.respondent,
          respondentName: record['respondent-name'],
          parent: record.parent,
          parentName: record['parent-name'],
          subregion: record.subregion,
          subregionName: record['subregion-name'],
          type: record.type,
          value: record.value,
          valueUnits: record['value-units'],
          region: config.region,
          balancingAuthority: config.balancingAuthority
        })),
        skipDuplicates: true
      })
    }
  }

  /**
   * Merge snapshots from different data sources (direct EIA path only)
   */
  private mergeSnapshots(
    balanceSnapshots: any[],
    interchangeSnapshots: any[],
    subregionSnapshots: any[]
  ): any[] {
    // Create a map by timestamp for efficient merging
    const snapshotMap = new Map<string, any>()

    // Start with balance snapshots (primary source)
    for (const snapshot of balanceSnapshots) {
      snapshotMap.set(snapshot.timestamp, { ...snapshot })
    }

    // Merge interchange data
    for (const interchange of interchangeSnapshots) {
      const existing = snapshotMap.get(interchange.timestamp)
      if (existing) {
        existing.netInterchangeMwh = interchange.netInterchangeMwh
        if (interchange.metadata) {
          existing.metadata = { ...existing.metadata, ...interchange.metadata }
        }
      }
    }

    // Merge subregion data
    for (const subregion of subregionSnapshots) {
      const existing = snapshotMap.get(subregion.timestamp)
      if (existing) {
        existing.renewableRatio = subregion.renewableRatio
        existing.fossilRatio = subregion.fossilRatio
        if (subregion.metadata) {
          existing.metadata = { ...existing.metadata, ...subregion.metadata }
        }
      }
    }

    return Array.from(snapshotMap.values())
  }

  /**
   * Store processed snapshots in database
   */
  private async storeProcessedSnapshots(snapshots: any[]): Promise<void> {
    if (snapshots.length === 0) return

    try {
      // Normalize signalQuality to Prisma enum (uppercase)
      const normalizeQuality = (q: string | undefined): string => {
        const upper = (q || 'MEDIUM').toUpperCase()
        if (['HIGH', 'MEDIUM', 'LOW'].includes(upper)) return upper
        return 'MEDIUM'
      }

      const result = await prisma.gridSignalSnapshot.createMany({
        data: snapshots.map(snapshot => ({
          region: snapshot.region,
          balancingAuthority: snapshot.balancingAuthority,
          timestamp: new Date(snapshot.timestamp),
          demandMwh: snapshot.demandMwh,
          demandChangeMwh: snapshot.demandChangeMwh,
          demandChangePct: snapshot.demandChangePct,
          netGenerationMwh: snapshot.netGenerationMwh,
          netInterchangeMwh: snapshot.netInterchangeMwh,
          renewableRatio: snapshot.renewableRatio,
          fossilRatio: snapshot.fossilRatio,
          carbonSpikeProbability: snapshot.carbonSpikeProbability,
          curtailmentProbability: snapshot.curtailmentProbability,
          importCarbonLeakageScore: snapshot.importCarbonLeakageScore,
          signalQuality: normalizeQuality(snapshot.signalQuality) as any,
          estimatedFlag: snapshot.estimatedFlag ?? false,
          syntheticFlag: snapshot.syntheticFlag ?? false,
          source: snapshot.source || 'eia930',
          metadata: snapshot.metadata || {}
        })),
        skipDuplicates: true
      })
      console.log(`Stored ${result.count} GridSignalSnapshots for ${snapshots[0]?.region}`)
    } catch (error: any) {
      console.error(`Failed to store GridSignalSnapshots:`, error.message)
      // Log first snapshot for debugging
      if (snapshots[0]) {
        console.error('Sample snapshot:', JSON.stringify(snapshots[0], null, 2).slice(0, 500))
      }
      throw error
    }
  }

  /**
   * Cache snapshots for fast access
   */
  private async cacheSnapshots(region: string, snapshots: any[]): Promise<void> {
    if (snapshots.length === 0) return

    // Cache all snapshots
    await GridSignalCache.cacheSnapshots(region, snapshots)

    // Cache features for the most recent snapshot
    const latest = snapshots[0]
    if (latest) {
      await GridSignalCache.cacheFeatures(region, {
        demandRampPct: latest.demandChangePct,
        fossilRatio: latest.fossilRatio,
        renewableRatio: latest.renewableRatio,
        carbonSpikeProbability: latest.carbonSpikeProbability,
        curtailmentProbability: latest.curtailmentProbability,
        importCarbonLeakageScore: latest.importCarbonLeakageScore
      }, latest.timestamp)
    }
  }

  /**
   * Record audit trail for all snapshots
   */
  private async recordAuditTrail(snapshots: any[], source: string = 'EIA_930'): Promise<void> {
    for (const snapshot of snapshots) {
      await GridSignalAudit.recordSignalProcessing(
        snapshot,
        {
          sourceUsed: source,
          referenceTime: snapshot.timestamp,
          fetchedAt: new Date().toISOString(),
          fallbackUsed: false,
          disagreementFlag: false,
          disagreementPct: 0
        },
        {
          carbonSpikeProbability: snapshot.carbonSpikeProbability,
          curtailmentProbability: snapshot.curtailmentProbability,
          importCarbonLeakageScore: snapshot.importCarbonLeakageScore
        }
      )
    }
  }

  /**
   * Manual backfill for historical data
   */
  async backfillData(
    region: string,
    balancingAuthority: string,
    eiaRespondent: string,
    startDate: Date,
    endDate: Date
  ): Promise<void> {
    console.log(`Starting backfill for ${region} from ${startDate.toISOString()} to ${endDate.toISOString()}`)

    const config = { region, balancingAuthority, eiaRespondent }
    await this.ingestRegion(config, startDate, endDate)

    console.log(`Backfill completed for ${region}`)
  }

  /**
   * Get worker status
   */
  getStatus(): {
    isRunning: boolean
    dataSource: 'gridstatus' | 'eia_direct'
    regions: string[]
    schedule?: string
    lastRun?: Date
  } {
    return {
      isRunning: this.isRunning,
      dataSource: this.useGridStatus ? 'gridstatus' : 'eia_direct',
      regions: DEFAULT_REGIONS.map(r => r.region),
      schedule: (this.ingestionTask as any)?.getOptions?.()?.scheduled || '0 */15 * * * *',
    }
  }
}

// Global worker instance
let eiaWorker: EIAIngestionWorker | null = null

/**
 * Initialize and start the EIA-930 ingestion worker
 */
export async function startEIAIngestionWorker(): Promise<void> {
  if (!eiaWorker) {
    eiaWorker = new EIAIngestionWorker()
  }
  await eiaWorker.start()
}

export async function runEIAIngestionOnce(): Promise<IngestionRunResult> {
  if (!eiaWorker) {
    eiaWorker = new EIAIngestionWorker()
  }

  return eiaWorker.runOnce()
}

/**
 * Stop the EIA-930 ingestion worker
 */
export async function stopEIAIngestionWorker(): Promise<void> {
  if (eiaWorker) {
    await eiaWorker.stop()
    eiaWorker = null
  }
}

/**
 * Get the EIA-930 worker instance
 */
export function getEIAWorker(): EIAIngestionWorker | null {
  return eiaWorker
}
