jest.mock('../config/env', () => ({
  env: {
    WATTTIME_USERNAME: 'wt-user',
    WATTTIME_PASSWORD: 'wt-pass',
    WATTTIME_BASE_URL: 'https://api.watttime.org',
    WTT_BASE_URL: 'https://api.watttime.org',
  },
}))

jest.mock('../lib/integration-metrics', () => ({
  recordIntegrationFailure: jest.fn(async () => undefined),
  recordIntegrationSuccess: jest.fn(async () => undefined),
}))

jest.mock('../lib/resilience', () => ({
  wattTimeResilience: {
    execute: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  },
}))

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}))

import axios from 'axios'

import {
  __clearWattTimeTokenCacheForTestsOnly,
  wattTime,
} from '../lib/watttime'

describe('WattTime adapter login behavior', () => {
  const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>

  beforeEach(() => {
    mockedGet.mockReset()
    __clearWattTimeTokenCacheForTestsOnly()
  })

  it('logs in once and reuses the cached token until refresh is needed', async () => {
    mockedGet.mockImplementation(async (url: string, options?: any) => {
      if (url.endsWith('/login')) {
        expect(options?.auth).toEqual({ username: 'wt-user', password: 'wt-pass' })
        return {
          status: 200,
          data: { token: 'token-one' },
        } as any
      }

      expect(options?.headers).toEqual({ Authorization: 'Bearer token-one' })
      return {
        status: 200,
        data: {
          data: [{ point_time: '2026-04-22T00:00:00.000Z', value: 42 }],
          meta: {
            region: 'CAISO_NORTH',
            data_point_period_seconds: 300,
          },
        },
      } as any
    })

    const first = await wattTime.getCurrentMOER('CAISO_NORTH')
    const second = await wattTime.getCurrentMOER('CAISO_NORTH')

    expect(first).toEqual({
      balancingAuthority: 'CAISO_NORTH',
      moer: 42,
      moerPercent: 42,
      timestamp: '2026-04-22T00:00:00.000Z',
      frequency: '300s',
    })
    expect(second?.moer).toBe(42)
    expect(mockedGet).toHaveBeenCalledTimes(3)
  })

  it('refreshes the token and retries once when WattTime returns 401', async () => {
    let loginCount = 0
    let dataCount = 0

    mockedGet.mockImplementation(async (url: string, options?: any) => {
      if (url.endsWith('/login')) {
        loginCount += 1
        return {
          status: 200,
          data: { token: loginCount === 1 ? 'token-one' : 'token-two' },
        } as any
      }

      dataCount += 1
      if (dataCount === 1) {
        expect(options?.headers).toEqual({ Authorization: 'Bearer token-one' })
        return {
          status: 401,
          data: {},
        } as any
      }

      expect(options?.headers).toEqual({ Authorization: 'Bearer token-two' })
      return {
        status: 200,
        data: {
          data: [{ point_time: '2026-04-22T01:00:00.000Z', value: 33 }],
          meta: {
            region: 'CAISO_NORTH',
            model: { date: '2026-04-22' },
          },
        },
      } as any
    })

    const forecast = await wattTime.getMOERForecast('CAISO_NORTH')

    expect(forecast).toEqual([
      {
        balancingAuthority: 'CAISO_NORTH',
        timestamp: '2026-04-22T01:00:00.000Z',
        moer: 33,
        version: '2026-04-22',
      },
    ])
    expect(loginCount).toBe(2)
    expect(dataCount).toBe(2)
  })
})
