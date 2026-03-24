export {}

jest.mock('../lib/grid-signals/eia-client', () => ({
  eia930: {
    isAvailable: true,
    getBalance: jest.fn(),
    getInterchange: jest.fn(),
    getSubregion: jest.fn(),
  },
}))

jest.mock('../lib/grid-signals/gridstatus-client', () => ({
  gridStatus: {
    isAvailable: true,
    getBalance: jest.fn(),
    getInterchange: jest.fn(),
    getFuelMix: jest.fn(),
  },
}))

jest.mock('../lib/grid-signals/balance-parser', () => ({
  BalanceParser: {
    parseBalanceData: jest.fn((records: any[], region: string, balancingAuthority: string) =>
      records.map((record, index) => ({
        timestamp: record.period ?? `2026-03-24T0${index}:00:00.000Z`,
        region,
        balancingAuthority,
        demandMwh: 100,
        demandChangeMwh: 0,
        demandChangePct: 0,
        netGenerationMwh: 90,
        netInterchangeMwh: 0,
        renewableRatio: 0.4,
        fossilRatio: 0.6,
        carbonSpikeProbability: 0.2,
        curtailmentProbability: 0.1,
        importCarbonLeakageScore: 0.1,
        signalQuality: 'MEDIUM',
        estimatedFlag: false,
        syntheticFlag: false,
        source: 'eia930',
        metadata: {},
      }))
    ),
    calculateDemandChanges: jest.fn((snapshots: any[]) => snapshots),
  },
}))

jest.mock('../lib/grid-signals/interchange-parser', () => ({
  InterchangeParser: {
    parseInterchangeData: jest.fn(() => []),
    mergeIntoSnapshots: jest.fn((snapshots: any[]) => snapshots),
  },
}))

jest.mock('../lib/grid-signals/subregion-parser', () => ({
  SubregionParser: {
    parseSubregionData: jest.fn(() => []),
  },
}))

jest.mock('../lib/grid-signals/fuel-mix-parser', () => ({
  FuelMixParser: {
    parseFuelMixData: jest.fn(() => []),
    mergeIntoSnapshots: jest.fn((snapshots: any[]) => snapshots),
  },
}))

jest.mock('../lib/grid-signals/grid-feature-engine', () => ({
  GridFeatureEngine: {
    updateSnapshotsWithFeatures: jest.fn((snapshots: any[]) => snapshots),
    updateSignalQuality: jest.fn((snapshots: any[]) => snapshots),
  },
}))

jest.mock('../lib/grid-signals/grid-signal-cache', () => ({
  GridSignalCache: {
    cacheSnapshots: jest.fn().mockResolvedValue(undefined),
    cacheFeatures: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('../lib/grid-signals/grid-signal-audit', () => ({
  GridSignalAudit: {
    recordSignalProcessing: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('../lib/grid-signals/region-mapping', () => ({
  getUsBalancingAuthorities: jest.fn(() => []),
}))

jest.mock('../routes/system', () => ({
  setWorkerStatus: jest.fn(),
}))

jest.mock('../lib/task-lock', () => ({
  TaskAlreadyRunningError: class TaskAlreadyRunningError extends Error {
    task: string
    runId: string | null

    constructor(task: string, runId: string | null = null) {
      super(task)
      this.task = task
      this.runId = runId
    }
  },
  withTaskLock: jest.fn(async (_task: string, _ttlSeconds: number, fn: () => Promise<unknown>) => ({
    runId: 'test-run',
    result: await fn(),
  })),
}))

jest.mock('../lib/db', () => ({
  prisma: {
    eia930BalanceRaw: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    eia930InterchangeRaw: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    eia930SubregionRaw: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    gridSignalSnapshot: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  },
}))

const { eia930 } = require('../lib/grid-signals/eia-client')
const { gridStatus } = require('../lib/grid-signals/gridstatus-client')
const { EIAIngestionWorker } = require('../workers/eia-ingestion')

const config = {
  region: 'PJM',
  balancingAuthority: 'PJM',
  eiaRespondent: 'PJM',
}

describe('EIA ingestion provider fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    eia930.isAvailable = true
  })

  it('falls back to direct EIA when GridStatus balance data is empty', async () => {
    gridStatus.getBalance.mockResolvedValue([])

    const worker = new EIAIngestionWorker()
    const fallbackSpy = jest
      .spyOn(worker as any, 'ingestFromDirectEia')
      .mockResolvedValue({
        snapshotsProcessed: 24,
        rawRecordsStored: 72,
        featuresCalculated: 24,
        dataSource: 'eia_direct',
      })

    const result = await (worker as any).ingestFromGridStatus(config, new Date('2026-03-23T00:00:00.000Z'), new Date('2026-03-24T00:00:00.000Z'))

    expect(fallbackSpy).toHaveBeenCalledTimes(1)
    expect(gridStatus.getInterchange).not.toHaveBeenCalled()
    expect(result.dataSource).toBe('eia_direct')
  })

  it('falls back to direct EIA when GridStatus payload is incomplete', async () => {
    gridStatus.getBalance.mockResolvedValue([
      { period: '2026-03-24T00:00:00.000Z', respondent: 'PJM', 'respondent-name': 'PJM', type: 'D', value: 100, 'value-units': 'megawatthours' },
    ])
    gridStatus.getInterchange.mockResolvedValue([])
    gridStatus.getFuelMix.mockResolvedValue([
      { interval_start_utc: '2026-03-24T00:00:00.000Z' },
    ])

    const worker = new EIAIngestionWorker()
    const fallbackSpy = jest
      .spyOn(worker as any, 'ingestFromDirectEia')
      .mockResolvedValue({
        snapshotsProcessed: 24,
        rawRecordsStored: 72,
        featuresCalculated: 24,
        dataSource: 'eia_direct',
      })

    const result = await (worker as any).ingestFromGridStatus(config, new Date('2026-03-23T00:00:00.000Z'), new Date('2026-03-24T00:00:00.000Z'))

    expect(fallbackSpy).toHaveBeenCalledTimes(1)
    expect(result.dataSource).toBe('eia_direct')
  })

  it('fails closed when GridStatus is degraded and direct EIA is unavailable', async () => {
    eia930.isAvailable = false
    gridStatus.getBalance.mockResolvedValue([])

    const worker = new EIAIngestionWorker()

    await expect(
      (worker as any).ingestFromGridStatus(config, new Date('2026-03-23T00:00:00.000Z'), new Date('2026-03-24T00:00:00.000Z'))
    ).rejects.toThrow('direct EIA fallback is unavailable')
  })
})
