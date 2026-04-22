jest.mock('axios', () => ({
  get: jest.fn(),
}))

jest.mock('../lib/integration-metrics', () => ({
  recordIntegrationSuccess: jest.fn().mockResolvedValue(undefined),
  recordIntegrationFailure: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../lib/resilience', () => ({
  wattTimeResilience: {
    execute: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  },
}))

describe('WattTimeClient', () => {
  const axios = require('axios')

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.WATTTIME_USERNAME = 'demo-user'
    process.env.WATTTIME_PASSWORD = 'demo-pass'
    process.env.WATTTIME_BASE_URL = 'https://api.watttime.org'
  })

  afterEach(() => {
    delete process.env.WATTTIME_USERNAME
    delete process.env.WATTTIME_PASSWORD
    delete process.env.WATTTIME_BASE_URL
  })

  it('logs in automatically and retries once after a 401', async () => {
    axios.get
      .mockResolvedValueOnce({ status: 200, data: { token: 'token-one' } })
      .mockResolvedValueOnce({ status: 401, data: {} })
      .mockResolvedValueOnce({ status: 200, data: { token: 'token-two' } })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          data: [{ point_time: '2026-04-22T12:00:00Z', value: 123 }],
          meta: {
            region: 'PJM_DC',
            signal_type: 'co2_moer',
            units: 'percent',
            data_point_period_seconds: 300,
          },
        },
      })

    const { wattTime } = await import('../lib/watttime')

    const result = await wattTime.getCurrentMOER('PJM_DC')

    expect(result).toEqual({
      balancingAuthority: 'PJM_DC',
      moer: 123,
      moerPercent: 123,
      timestamp: '2026-04-22T12:00:00Z',
      frequency: '300s',
    })
    expect(axios.get).toHaveBeenCalledWith(
      'https://api.watttime.org/login',
      expect.objectContaining({
        auth: {
          username: 'demo-user',
          password: 'demo-pass',
        },
        validateStatus: expect.any(Function),
      })
    )
    expect(axios.get).toHaveBeenCalledTimes(4)
  })
})
