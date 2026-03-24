export {}

jest.mock('axios', () => ({
  get: jest.fn(),
}))

jest.mock('../lib/integration-metrics', () => ({
  recordIntegrationFailure: jest.fn().mockResolvedValue(undefined),
  recordIntegrationSuccess: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../lib/resilience', () => ({
  eiaResilience: {
    execute: jest.fn(async (_label: string, fn: () => Promise<unknown>) => fn()),
  },
}))

describe('EIA client contract', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://test:test@localhost:5432/ecobe',
      REDIS_URL: 'redis://localhost:6379',
      NODE_ENV: 'test',
      EIA_API_KEY: 'test-key',
      EIA_BASE_URL: 'https://api.eia.gov/v2',
    }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('normalizes balance periods and numeric values from the v2 API', async () => {
    const axios = require('axios')
    axios.get.mockResolvedValue({
      data: {
        response: {
          data: [
            {
              period: '2026-03-24T03',
              respondent: 'PJM',
              'respondent-name': 'PJM Interconnection, LLC',
              type: 'D',
              value: '92799',
              'value-units': 'megawatthours',
            },
          ],
        },
      },
    })

    let eia930: any
    jest.isolateModules(() => {
      eia930 = require('../lib/grid-signals/eia-client').eia930
    })

    const records = await eia930.getBalance('PJM')

    expect(records[0].period).toBe('2026-03-24T03:00:00.000Z')
    expect(records[0].value).toBe(92799)
  })

  it('maps interchange facet fields into the parser contract', async () => {
    const axios = require('axios')
    axios.get.mockResolvedValue({
      data: {
        response: {
          data: [
            {
              period: '2026-03-23T05',
              fromba: 'ERCO',
              'fromba-name': 'Electric Reliability Council of Texas, Inc.',
              toba: 'CEN',
              'toba-name': 'Centro Nacional de Control de Energia',
              value: '-29',
              'value-units': 'megawatthours',
            },
          ],
        },
      },
    })

    let eia930: any
    jest.isolateModules(() => {
      eia930 = require('../lib/grid-signals/eia-client').eia930
    })

    const records = await eia930.getInterchange('ERCO')

    expect(records[0].period).toBe('2026-03-23T05:00:00.000Z')
    expect(records[0]['from-ba']).toBe('ERCO')
    expect(records[0]['to-ba']).toBe('CEN')
    expect(records[0].value).toBe(-29)
    expect(records[0].type).toBe('ID')
  })
})
