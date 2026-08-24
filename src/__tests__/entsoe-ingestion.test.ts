jest.mock('../config/env', () => ({
  env: {
    ENTSOE_API_TOKEN: undefined,
    REDIS_URL: 'disabled',
  },
}))

jest.mock('../lib/db', () => ({
  prisma: {
    entsoeGenerationRaw: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    gridSignalSnapshot: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  },
}))

jest.mock('../lib/eu-open-carbon', () => ({
  euOpenCarbon: {
    entsoeAvailable: false,
    getEntsoeIntensity: jest.fn(),
  },
  getEntsoeZones: jest.fn(),
  getEntsoeDomain: jest.fn(),
}))

jest.mock('../lib/routing/provider-snapshots', () => ({
  storeProviderSnapshot: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}))

import { prisma } from '../lib/db'
import * as cron from 'node-cron'
import {
  euOpenCarbon,
  getEntsoeDomain,
  getEntsoeZones,
} from '../lib/eu-open-carbon'
import { storeProviderSnapshot } from '../lib/routing/provider-snapshots'
import { EntsoeIngestionWorker } from '../workers/entsoe-ingestion'

const rawCreateMany = prisma.entsoeGenerationRaw.createMany as jest.Mock
const gridCreateMany = prisma.gridSignalSnapshot.createMany as jest.Mock
const storeSnapshot = storeProviderSnapshot as jest.Mock
const zones = getEntsoeZones as jest.Mock
const domain = getEntsoeDomain as jest.Mock
const getIntensity = euOpenCarbon.getEntsoeIntensity as jest.Mock
const mockedClient = euOpenCarbon as unknown as { entsoeAvailable: boolean }
const schedule = cron.schedule as jest.Mock

const fixture = {
  zone: 'EU-DE' as const,
  carbonIntensity: 300,
  timestamp: '2026-01-01T12:00:00.000Z',
  isForecast: false as const,
  method: 'entsoe-generation-mix-ipcc' as const,
  fuelBreakdownMw: {
    wind: 20,
    solar: 10,
    gas: 30,
    nuclear: 40,
    storage: 5,
  },
  sourceUrl: 'https://web-api.tp.entsoe.eu/api',
  sourceFreshness: 'hourly' as const,
}

describe('ENTSO-E ingestion worker', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedClient.entsoeAvailable = true
    zones.mockReturnValue(['EU-DE'])
    domain.mockImplementation((zone: string) => `domain-${zone}`)
  })

  it('does not schedule or write when the ENTSO-E token is unavailable', async () => {
    mockedClient.entsoeAvailable = false
    const worker = new EntsoeIngestionWorker()

    await expect(worker.start()).resolves.toBeUndefined()

    expect(schedule).not.toHaveBeenCalled()
    expect(rawCreateMany).not.toHaveBeenCalled()
    expect(gridCreateMany).not.toHaveBeenCalled()
    expect(storeSnapshot).not.toHaveBeenCalled()
  })

  it('stores raw, grid, and provider snapshots with exact fuel ratios', async () => {
    getIntensity.mockResolvedValue(fixture)
    const worker = new EntsoeIngestionWorker()

    await worker.runIngestion()

    const observedAt = new Date(fixture.timestamp)
    expect(rawCreateMany).toHaveBeenCalledWith({
      data: [{
        zone: 'EU-DE',
        domain: 'domain-EU-DE',
        observedAt,
        carbonIntensityGco2Kwh: 300,
        fuelBreakdownMw: fixture.fuelBreakdownMw,
        method: fixture.method,
        sourceUrl: fixture.sourceUrl,
        sourceFreshness: 'hourly',
        fetchedAt: expect.any(Date),
      }],
      skipDuplicates: true,
    })
    expect(gridCreateMany).toHaveBeenCalledWith({
      data: [{
        region: 'EU-DE',
        balancingAuthority: null,
        timestamp: observedAt,
        renewableRatio: 30 / 105,
        fossilRatio: 30 / 105,
        signalQuality: 'HIGH',
        estimatedFlag: false,
        syntheticFlag: false,
        source: 'entsoe',
        metadata: {
          carbonIntensityGco2Kwh: 300,
          method: fixture.method,
          sourceUrl: fixture.sourceUrl,
          sourceFreshness: 'hourly',
          fuelBreakdownMw: fixture.fuelBreakdownMw,
        },
      }],
      skipDuplicates: true,
    })
    expect(storeSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'entsoe',
      zone: 'EU-DE',
      signalType: 'intensity',
      signalValue: 300,
      observedAt,
      freshnessSec: expect.any(Number),
      metadata: {
        method: fixture.method,
        sourceUrl: fixture.sourceUrl,
      },
    }))
  })

  it('skips null zones while continuing with later zones', async () => {
    zones.mockReturnValue(['EU-DE', 'EU-SE'])
    domain.mockImplementation((zone: string) => `domain-${zone}`)
    getIntensity
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...fixture, zone: 'EU-SE' })
    const worker = new EntsoeIngestionWorker()

    await worker.runIngestion()

    expect(getIntensity).toHaveBeenCalledTimes(2)
    expect(rawCreateMany).toHaveBeenCalledTimes(1)
    expect(rawCreateMany.mock.calls[0][0].data[0].zone).toBe('EU-SE')
    expect(gridCreateMany).toHaveBeenCalledTimes(1)
    expect(storeSnapshot).toHaveBeenCalledTimes(1)
  })

  it('writes null ratios when the fuel denominator is zero', async () => {
    getIntensity.mockResolvedValue({
      ...fixture,
      fuelBreakdownMw: {},
    })
    const worker = new EntsoeIngestionWorker()

    await worker.runIngestion()

    expect(gridCreateMany.mock.calls[0][0].data[0]).toEqual(expect.objectContaining({
      renewableRatio: null,
      fossilRatio: null,
    }))
  })
})
