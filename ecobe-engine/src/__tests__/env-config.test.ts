export {}

describe('environment normalization', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://test:test@localhost:5432/ecobe',
      REDIS_URL: 'redis://localhost:6379',
      NODE_ENV: 'test',
    }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('defaults EIA base URL to the API v2 route', () => {
    delete process.env.EIA_BASE_URL

    let loadedEnv: any
    jest.isolateModules(() => {
      loadedEnv = require('../config/env').env
    })

    expect(loadedEnv.EIA_BASE_URL).toBe('https://api.eia.gov/v2')
  })

  it('normalizes a bare EIA host to the API v2 route', () => {
    process.env.EIA_BASE_URL = 'https://api.eia.gov'

    let loadedEnv: any
    jest.isolateModules(() => {
      loadedEnv = require('../config/env').env
    })

    expect(loadedEnv.EIA_BASE_URL).toBe('https://api.eia.gov/v2')
  })

  it('preserves an explicit versioned EIA base URL', () => {
    process.env.EIA_BASE_URL = 'https://api.eia.gov/v2/'

    let loadedEnv: any
    jest.isolateModules(() => {
      loadedEnv = require('../config/env').env
    })

    expect(loadedEnv.EIA_BASE_URL).toBe('https://api.eia.gov/v2')
  })
})
