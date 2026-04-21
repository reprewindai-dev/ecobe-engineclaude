/**
 * Tests for the runGridStatusRequest throttle queue introduced in
 * ecobe-engine/src/lib/grid-signals/gridstatus-client.ts
 *
 * The throttle serializes all GridStatus API calls with a 1200 ms gap between
 * each request to avoid startup-rate-limit bursts.
 */

const mockAxiosGet = jest.fn()
const mockRecordFailure = jest.fn().mockResolvedValue(undefined)
const mockRecordSuccess = jest.fn().mockResolvedValue(undefined)
const mockEiaExecute = jest.fn(async (_name: string, operation: () => Promise<unknown>) => operation())

jest.mock('axios', () => ({
  get: mockAxiosGet,
}))

jest.mock('../lib/integration-metrics', () => ({
  recordIntegrationFailure: mockRecordFailure,
  recordIntegrationSuccess: mockRecordSuccess,
}))

jest.mock('../lib/resilience', () => ({
  eiaResilience: {
    execute: mockEiaExecute,
  },
}))

// Default env: API key present
jest.mock('../config/env', () => ({
  env: {
    GRIDSTATUS_API_KEY: 'test-api-key',
    NODE_ENV: 'test',
  },
}))

const makeRegionalResponse = (records: unknown[] = []) => ({
  data: {
    status_code: 200,
    data: records,
    meta: { page: 1, limit: 5000, page_size: 0, hasNextPage: false, cursor: null },
  },
})

const makeInterchangeResponse = (records: unknown[] = []) => ({
  data: {
    status_code: 200,
    data: records,
    meta: { page: 1, limit: 5000, page_size: 0, hasNextPage: false, cursor: null },
  },
})

const makeFuelMixResponse = (records: unknown[] = []) => ({
  data: {
    status_code: 200,
    data: records,
    meta: { page: 1, limit: 5000, page_size: 0, hasNextPage: false, cursor: null },
  },
})

import { GridStatusClient } from '../lib/grid-signals/gridstatus-client'

describe('GridStatusClient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Re-apply the default resolved mock on each test
    mockEiaExecute.mockImplementation(async (_name: string, operation: () => Promise<unknown>) => operation())
    mockRecordFailure.mockResolvedValue(undefined)
    mockRecordSuccess.mockResolvedValue(undefined)
  })

  describe('isAvailable', () => {
    it('returns true when GRIDSTATUS_API_KEY is configured', () => {
      const client = new GridStatusClient()
      expect(client.isAvailable).toBe(true)
    })
  })

  describe('getBalance', () => {
    it('maps regional records to EIABalanceData with D, NG, and TI entries', async () => {
      mockAxiosGet.mockResolvedValue(
        makeRegionalResponse([
          {
            interval_start_utc: '2026-04-20T12:00:00Z',
            interval_end_utc: '2026-04-20T13:00:00Z',
            respondent: 'PJM',
            respondent_name: 'PJM Interconnection',
            load: 120000,
            load_forecast: 125000,
            net_generation: 100000,
            total_interchange: 20000,
          },
        ])
      )

      const client = new GridStatusClient()
      const result = await client.getBalance('PJM')

      expect(result).toHaveLength(3)

      const demandEntry = result.find((r) => r.type === 'D')
      expect(demandEntry).toBeDefined()
      expect(demandEntry?.value).toBe(120000)
      expect(demandEntry?.respondent).toBe('PJM')
      expect(demandEntry?.['value-units']).toBe('megawatthours')
      expect(demandEntry?.period).toBe('2026-04-20T12:00:00Z')

      const netGenEntry = result.find((r) => r.type === 'NG')
      expect(netGenEntry).toBeDefined()
      expect(netGenEntry?.value).toBe(100000)

      const interchangeEntry = result.find((r) => r.type === 'TI')
      expect(interchangeEntry).toBeDefined()
      expect(interchangeEntry?.value).toBe(20000)
    })

    it('skips null load field (does not emit D entry for null load)', async () => {
      mockAxiosGet.mockResolvedValue(
        makeRegionalResponse([
          {
            interval_start_utc: '2026-04-20T12:00:00Z',
            interval_end_utc: '2026-04-20T13:00:00Z',
            respondent: 'CAISO',
            respondent_name: 'California ISO',
            load: null,
            load_forecast: null,
            net_generation: 80000,
            total_interchange: null,
          },
        ])
      )

      const client = new GridStatusClient()
      const result = await client.getBalance('CAISO')

      // Only NG entry should be present (load and TI are null)
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('NG')
      expect(result[0].value).toBe(80000)
    })

    it('returns empty array when axios throws', async () => {
      mockAxiosGet.mockRejectedValue(new Error('Network error'))

      const client = new GridStatusClient()
      const result = await client.getBalance('PJM')

      expect(result).toEqual([])
    })

    it('handles empty data array from API', async () => {
      mockAxiosGet.mockResolvedValue(makeRegionalResponse([]))

      const client = new GridStatusClient()
      const result = await client.getBalance('PJM')

      expect(result).toEqual([])
    })

    it('sets period from interval_start_utc', async () => {
      mockAxiosGet.mockResolvedValue(
        makeRegionalResponse([
          {
            interval_start_utc: '2026-04-20T15:00:00Z',
            interval_end_utc: '2026-04-20T16:00:00Z',
            respondent: 'MISO',
            respondent_name: 'Midcontinent ISO',
            load: 50000,
            load_forecast: null,
            net_generation: null,
            total_interchange: null,
          },
        ])
      )

      const client = new GridStatusClient()
      const result = await client.getBalance('MISO')

      expect(result[0].period).toBe('2026-04-20T15:00:00Z')
    })

    it('passes start and end time as date strings to the API', async () => {
      mockAxiosGet.mockResolvedValue(makeRegionalResponse([]))

      const client = new GridStatusClient()
      await client.getBalance('PJM', new Date('2026-04-01T00:00:00Z'), new Date('2026-04-02T00:00:00Z'))

      expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('eia_regional_hourly'),
        expect.objectContaining({
          params: expect.objectContaining({
            start_time: '2026-04-01',
            end_time: '2026-04-02',
          }),
        })
      )
    })
  })

  describe('getInterchange', () => {
    it('deduplicates interchange records by interface_id and timestamp', async () => {
      const sharedRecord = {
        interval_start_utc: '2026-04-20T12:00:00Z',
        interval_end_utc: '2026-04-20T13:00:00Z',
        from_ba: 'PJM',
        from_ba_name: 'PJM Interconnection',
        to_ba: 'MISO',
        to_ba_name: 'MISO',
        mw: 500,
        interface_id: 'PJM-MISO',
      }

      // Both from and to responses return the same record
      mockAxiosGet
        .mockResolvedValueOnce(makeInterchangeResponse([sharedRecord]))
        .mockResolvedValueOnce(makeInterchangeResponse([sharedRecord]))

      const client = new GridStatusClient()
      const result = await client.getInterchange('PJM')

      // Should deduplicate to one entry
      expect(result).toHaveLength(1)
      expect(result[0]['from-ba']).toBe('PJM')
      expect(result[0]['to-ba']).toBe('MISO')
      expect(result[0].value).toBe(500)
      expect(result[0].type).toBe('ID')
    })

    it('combines unique records from both directions', async () => {
      const fromRecord = {
        interval_start_utc: '2026-04-20T12:00:00Z',
        interval_end_utc: '2026-04-20T13:00:00Z',
        from_ba: 'PJM',
        from_ba_name: 'PJM',
        to_ba: 'MISO',
        to_ba_name: 'MISO',
        mw: 500,
        interface_id: 'PJM-MISO',
      }
      const toRecord = {
        interval_start_utc: '2026-04-20T12:00:00Z',
        interval_end_utc: '2026-04-20T13:00:00Z',
        from_ba: 'NYISO',
        from_ba_name: 'NYISO',
        to_ba: 'PJM',
        to_ba_name: 'PJM',
        mw: 300,
        interface_id: 'NYISO-PJM',
      }

      mockAxiosGet
        .mockResolvedValueOnce(makeInterchangeResponse([fromRecord]))
        .mockResolvedValueOnce(makeInterchangeResponse([toRecord]))

      const client = new GridStatusClient()
      const result = await client.getInterchange('PJM')

      expect(result).toHaveLength(2)
      const fromBAs = result.map((r) => r['from-ba'])
      expect(fromBAs).toContain('PJM')
      expect(fromBAs).toContain('NYISO')
    })

    it('maps records to EIAInterchangeData with type ID', async () => {
      const record = {
        interval_start_utc: '2026-04-20T12:00:00Z',
        interval_end_utc: '2026-04-20T13:00:00Z',
        from_ba: 'ERCO',
        from_ba_name: 'ERCOT',
        to_ba: 'SPP',
        to_ba_name: 'Southwest Power Pool',
        mw: 200,
        interface_id: 'ERCO-SPP',
      }

      mockAxiosGet
        .mockResolvedValueOnce(makeInterchangeResponse([record]))
        .mockResolvedValueOnce(makeInterchangeResponse([]))

      const client = new GridStatusClient()
      const result = await client.getInterchange('ERCO')

      expect(result[0]).toMatchObject({
        period: '2026-04-20T12:00:00Z',
        'from-ba': 'ERCO',
        'from-ba-name': 'ERCOT',
        'to-ba': 'SPP',
        'to-ba-name': 'Southwest Power Pool',
        type: 'ID',
        value: 200,
        'value-units': 'megawatthours',
      })
    })

    it('returns empty array when axios throws', async () => {
      mockAxiosGet.mockRejectedValue(new Error('Timeout'))

      const client = new GridStatusClient()
      const result = await client.getInterchange('PJM')

      expect(result).toEqual([])
    })
  })

  describe('getFuelMix', () => {
    it('returns raw data records from API response', async () => {
      const fuelRecord = {
        interval_start_utc: '2026-04-20T12:00:00Z',
        respondent: 'CAISO',
        wind: 5000,
        solar: 8000,
        natural_gas: 10000,
        nuclear: 2000,
      }
      mockAxiosGet.mockResolvedValue(makeFuelMixResponse([fuelRecord]))

      const client = new GridStatusClient()
      const result = await client.getFuelMix('CAISO')

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(fuelRecord)
    })

    it('returns empty array when axios throws', async () => {
      mockAxiosGet.mockRejectedValue(new Error('API error'))

      const client = new GridStatusClient()
      const result = await client.getFuelMix('CAISO')

      expect(result).toEqual([])
    })

    it('returns empty array when API returns no data', async () => {
      mockAxiosGet.mockResolvedValue(makeFuelMixResponse([]))

      const client = new GridStatusClient()
      const result = await client.getFuelMix('CAISO')

      expect(result).toEqual([])
    })
  })

  describe('runGridStatusRequest throttle queue', () => {
    it('serializes concurrent getBalance calls so both complete successfully', async () => {
      mockAxiosGet.mockResolvedValue(makeRegionalResponse([]))

      jest.useFakeTimers()

      const client = new GridStatusClient()

      // Fire both concurrently without awaiting
      const p1 = client.getBalance('PJM')
      const p2 = client.getBalance('MISO')

      // Advance all timers including the 1200ms gap, twice to cover both requests
      await jest.runAllTimersAsync()
      await jest.runAllTimersAsync()

      const [r1, r2] = await Promise.all([p1, p2])

      jest.useRealTimers()

      expect(r1).toEqual([])
      expect(r2).toEqual([])
      // axios.get should be called once per getBalance
      expect(mockAxiosGet).toHaveBeenCalledTimes(2)
    })

    it('proceeds with the second request even when the first request throws', async () => {
      mockAxiosGet
        .mockRejectedValueOnce(new Error('First request failed'))
        .mockResolvedValueOnce(makeFuelMixResponse([{ respondent: 'CAISO' }]))

      jest.useFakeTimers()

      const client = new GridStatusClient()

      const p1 = client.getBalance('FAIL-BA')
      const p2 = client.getFuelMix('CAISO')

      await jest.runAllTimersAsync()
      await jest.runAllTimersAsync()

      const [r1, r2] = await Promise.all([p1, p2])

      jest.useRealTimers()

      // First should return [] (error swallowed)
      expect(r1).toEqual([])
      // Second should succeed despite first failing
      expect(r2).toHaveLength(1)
    })

    it('executes axios.get exactly once per method call even with concurrent requests', async () => {
      mockAxiosGet.mockResolvedValue(makeRegionalResponse([]))

      jest.useFakeTimers()

      const client = new GridStatusClient()

      // Three concurrent calls
      const calls = [
        client.getBalance('BA-1'),
        client.getBalance('BA-2'),
        client.getBalance('BA-3'),
      ]

      await jest.runAllTimersAsync()
      await jest.runAllTimersAsync()
      await jest.runAllTimersAsync()

      await Promise.all(calls)

      jest.useRealTimers()

      // Each getBalance call makes exactly one axios.get
      expect(mockAxiosGet).toHaveBeenCalledTimes(3)
    })
  })
})

describe('GridStatusClient without API key', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
  })

  it('getBalance returns empty array when API key is absent', async () => {
    jest.doMock('../config/env', () => ({
      env: { GRIDSTATUS_API_KEY: undefined, NODE_ENV: 'test' },
    }))
    jest.doMock('axios', () => ({ get: jest.fn() }))
    jest.doMock('../lib/integration-metrics', () => ({
      recordIntegrationFailure: jest.fn().mockResolvedValue(undefined),
      recordIntegrationSuccess: jest.fn().mockResolvedValue(undefined),
    }))
    jest.doMock('../lib/resilience', () => ({
      eiaResilience: {
        execute: jest.fn(async (_name: string, op: () => Promise<unknown>) => op()),
      },
    }))

    const { GridStatusClient: NoKeyClient } = await import('../lib/grid-signals/gridstatus-client')
    const client = new NoKeyClient()
    expect(client.isAvailable).toBe(false)

    const result = await client.getBalance('PJM')
    expect(result).toEqual([])
  })

  it('getInterchange returns empty array when API key is absent', async () => {
    jest.doMock('../config/env', () => ({
      env: { GRIDSTATUS_API_KEY: undefined, NODE_ENV: 'test' },
    }))
    jest.doMock('axios', () => ({ get: jest.fn() }))
    jest.doMock('../lib/integration-metrics', () => ({
      recordIntegrationFailure: jest.fn().mockResolvedValue(undefined),
      recordIntegrationSuccess: jest.fn().mockResolvedValue(undefined),
    }))
    jest.doMock('../lib/resilience', () => ({
      eiaResilience: {
        execute: jest.fn(async (_name: string, op: () => Promise<unknown>) => op()),
      },
    }))

    const { GridStatusClient: NoKeyClient } = await import('../lib/grid-signals/gridstatus-client')
    const client = new NoKeyClient()
    const result = await client.getInterchange('PJM')
    expect(result).toEqual([])
  })

  it('getFuelMix returns empty array when API key is absent', async () => {
    jest.doMock('../config/env', () => ({
      env: { GRIDSTATUS_API_KEY: undefined, NODE_ENV: 'test' },
    }))
    jest.doMock('axios', () => ({ get: jest.fn() }))
    jest.doMock('../lib/integration-metrics', () => ({
      recordIntegrationFailure: jest.fn().mockResolvedValue(undefined),
      recordIntegrationSuccess: jest.fn().mockResolvedValue(undefined),
    }))
    jest.doMock('../lib/resilience', () => ({
      eiaResilience: {
        execute: jest.fn(async (_name: string, op: () => Promise<unknown>) => op()),
      },
    }))

    const { GridStatusClient: NoKeyClient } = await import('../lib/grid-signals/gridstatus-client')
    const client = new NoKeyClient()
    const result = await client.getFuelMix('CAISO')
    expect(result).toEqual([])
  })
})