jest.mock('axios', () => ({
  get: jest.fn(),
}))

jest.mock('../lib/integration-metrics', () => ({
  recordIntegrationFailure: jest.fn().mockResolvedValue(undefined),
  recordIntegrationSuccess: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../lib/resilience', () => ({
  wattTimeResilience: {
    execute: jest.fn(async (_name: string, operation: () => Promise<unknown>) => operation()),
  },
}))

describe('WattTimeClient', () => {
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
    delete process.env.WATTTIME_USERNAME
    delete process.env.WATTTIME_PASSWORD
    delete process.env.WATTTIME_API_KEY
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('uses WATTTIME_API_KEY directly when username/password are absent', async () => {
    process.env.WATTTIME_API_KEY = 'wt-direct-token'

    const axios = require('axios') as { get: jest.Mock }
    axios.get
      .mockResolvedValueOnce({
        data: {
          data: [{ point_time: '2026-04-17T12:00:00Z', value: 187 }],
          meta: { region: 'PJM_DC', data_point_period_seconds: 300 },
        },
      })
      .mockRejectedValueOnce(new Error('signal-index unavailable'))

    const { WattTimeClient } = await import('../lib/watttime')
    const client = new WattTimeClient()

    const result = await client.getCurrentMOER('PJM_DC')

    expect(result).toEqual({
      balancingAuthority: 'PJM_DC',
      moer: 187,
      moerPercent: 187,
      timestamp: '2026-04-17T12:00:00Z',
      frequency: '300s',
    })
    expect(axios.get).toHaveBeenCalledTimes(2)
    expect(axios.get).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/v3/forecast'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer wt-direct-token' }),
        params: expect.objectContaining({ horizon_hours: 1, region: 'PJM_DC', signal_type: 'co2_moer' }),
      })
    )
  })
})
