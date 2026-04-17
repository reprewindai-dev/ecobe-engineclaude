jest.mock('axios', () => ({
  get: jest.fn(),
}))

jest.mock('../lib/integration-metrics', () => ({
  recordIntegrationFailure: jest.fn().mockResolvedValue(undefined),
  recordIntegrationSuccess: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../lib/resilience', () => ({
  eiaResilience: {
    execute: jest.fn(async (_name: string, operation: () => Promise<unknown>) => operation()),
  },
}))

describe('EIA930Client', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      DATABASE_URL: originalEnv.DATABASE_URL ?? 'postgres://test',
      REDIS_URL: originalEnv.REDIS_URL ?? 'redis://localhost:6379',
    }
    delete process.env.EIA_API_KEY
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('uses the public Grid Monitor backbone when EIA_API_KEY is absent', async () => {
    const axios = require('axios') as { get: jest.Mock }
    axios.get.mockResolvedValue({
      data: [
        {
          data: [
            {
              RESPONDENT_ID: 'ERCO',
              RESPONDENT_NAME: 'Electric Reliability Council of Texas, Inc.',
              FUEL_TYPE_ID: 'WND',
              FUEL_TYPE_NAME: 'Wind',
              VALUES: {
                DATES: ['04/17/2026 03:00:00', '04/17/2026 04:00:00'],
                DATA: [26567, 26683],
              },
            },
            {
              RESPONDENT_ID: 'ERCO',
              RESPONDENT_NAME: 'Electric Reliability Council of Texas, Inc.',
              FUEL_TYPE_ID: 'NG',
              FUEL_TYPE_NAME: 'Natural Gas',
              VALUES: {
                DATES: ['04/17/2026 03:00:00', '04/17/2026 04:00:00'],
                DATA: [20776, 19613],
              },
            },
          ],
        },
      ],
    })

    const { EIA930Client } = await import('../lib/grid-signals/eia-client')
    const client = new EIA930Client()

    const rows = await client.getFuelMix('ERCO', new Date('2026-04-17T03:00:00Z'), new Date('2026-04-17T04:00:00Z'))

    expect(client.mode).toBe('public_gridmonitor')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      respondent: 'ERCO',
      respondent_name: 'Electric Reliability Council of Texas, Inc.',
      wind: 26567,
      natural_gas: 20776,
    })
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/region_data_by_fuel_type/series_data'),
      expect.objectContaining({
        params: expect.objectContaining({
          'respondent[0]': 'ERCO',
          frequency: 'hourly',
          timezone: 'UTC',
        }),
      })
    )
  })
})
