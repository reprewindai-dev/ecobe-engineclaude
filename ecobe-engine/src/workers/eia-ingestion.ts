import * as cron from 'node-cron'
import { eia930 } from '../lib/grid-signals/eia-client'
import { BalanceParser } from '../lib/grid-signals/balance-parser'
import { InterchangeParser } from '../lib/grid-signals/interchange-parser'
import { SubregionParser } from '../lib/grid-signals/subregion-parser'
import { GridFeatureEngine } from '../lib/grid-signals/grid-feature-engine'
import { GridSignalCache } from '../lib/grid-signals/grid-signal-cache'
import { GridSignalAudit } from '../lib/grid-signals/grid-signal-audit'
import { prisma } from '../lib/db'

interface RegionConfig {
  region: string
  balancingAuthority: string
  eiaRespondent: string
}

// Default region configurations for major US balancing authorities
const DEFAULT_REGIONS: RegionConfig[] = [
  { region: 'PJM', balancingAuthority: 'PJM', eiaRespondent: 'PJM' },
  { region: 'ERCOT', balancingAuthority: 'ERCOT', eiaRespondent: 'ERCOT' },
  { region: 'CAISO', balancingAuthority: 'CISO', eiaRespondent: 'CISO' },
  { region: 'MISO', balancingAuthority: 'MISO', eiaRespondent: 'MISO' },
  { region: 'NYISO', balancingAuthority: 'NYISO', eiaRespondent: 'NYISO' },
  { region: 'ISO-NE', balancingAuthority: 'ISNE', eiaRespondent: 'ISNE' },
  { region: 'SPP', balancingAuthority: 'SPP', eiaRespondent: 'SPP' },
]

export class EIAIngestionWorker {
  private isRunning = false
  private ingestionTask?: cron.ScheduledTask

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

    if (this.ingestionTask) {
      this.ingestionTask.stop()
      this.ingestionTask = undefined
    }

    console.log('EIA-930 ingestion worker stopped')
  }

  /**
   * Run the ingestion process
   */
  private async runIngestion(): Promise<void> {
    const startTime = new Date()
    console.log(`Starting EIA-930 ingestion at ${startTime.toISOString()}`)

    try {
      // Get time window for ingestion (last 48 hours)
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 48 * 60 * 60 * 1000)

      const results = await Promise.allSettled(
        DEFAULT_REGIONS.map(config => this.ingestRegion(config, startTime, endTime))
      )

      // Log results
      let successCount = 0
      let failureCount = 0

      for (const result of results) {
        if (result.status === 'fulfilled') {
          successCount++
        } else {
          failureCount++
          console.error('Region ingestion failed:', result.reason)
        }
      }

      console.log(`EIA-930 ingestion completed: ${successCount} successful, ${failureCount} failed`)

    } catch (error) {
      console.error('EIA-930 ingestion failed:', error)
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
  ): Promise<{
    snapshotsProcessed: number
    rawRecordsStored: number
    featuresCalculated: number
  }> {
    console.log(`Ingesting EIA-930 data for ${config.region} (${config.balancingAuthority})`)

    // Fetch raw data from EIA API
    const [balanceData, interchangeData, subregionData] = await Promise.all([
      eia930.getBalance(config.eiaRespondent, startTime, endTime),
      eia930.getInterchange(config.eiaRespondent, startTime, endTime),
      eia930.getSubregion(config.eiaRespondent, startTime, endTime)
    ])

    // Store raw data for audit
    await this.storeRawData(config, balanceData, interchangeData, subregionData)

    // Parse and normalize data
    const balanceSnapshots = BalanceParser.parseBalanceData(
      balanceData,
      config.region,
      config.balancingAuthority
    )

    // Calculate demand changes
    const balanceWithChanges = BalanceParser.calculateDemandChanges(balanceSnapshots)

    // Parse interchange data
    const interchangeSnapshots = InterchangeParser.parseInterchangeData(
      interchangeData,
      config.region,
      config.balancingAuthority
    )

    // Parse subregion data
    const subregionSnapshots = SubregionParser.parseSubregionData(
      subregionData,
      config.region,
      config.balancingAuthority
    )

    // Merge all data sources
    const mergedSnapshots = this.mergeSnapshots(
      balanceWithChanges,
      interchangeSnapshots,
      subregionSnapshots
    )

    // Calculate derived features
    const snapshotsWithFeatures = GridFeatureEngine.updateSnapshotsWithFeatures(mergedSnapshots)

    // Update signal quality
    const finalSnapshots = GridFeatureEngine.updateSignalQuality(snapshotsWithFeatures)

    // Store processed snapshots
    await this.storeProcessedSnapshots(finalSnapshots)

    // Cache latest data for fast access
    await this.cacheSnapshots(config.region, finalSnapshots)

    // Record audit trail
    await this.recordAuditTrail(finalSnapshots)

    return {
      snapshotsProcessed: finalSnapshots.length,
      rawRecordsStored: balanceData.length + interchangeData.length + subregionData.length,
      featuresCalculated: finalSnapshots.length
    }
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

    // Store subregion data
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
   * Merge snapshots from different data sources
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

    await prisma.gridSignalSnapshot.createMany({
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
        signalQuality: snapshot.signalQuality,
        estimatedFlag: snapshot.estimatedFlag,
        syntheticFlag: snapshot.syntheticFlag,
        source: snapshot.source,
        metadata: snapshot.metadata
      })),
      skipDuplicates: true
    })
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
  private async recordAuditTrail(snapshots: any[]): Promise<void> {
    for (const snapshot of snapshots) {
      await GridSignalAudit.recordSignalProcessing(
        snapshot,
        {
          sourceUsed: 'EIA_930',
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
    schedule?: string
    lastRun?: Date
  } {
    return {
      isRunning: this.isRunning,
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
