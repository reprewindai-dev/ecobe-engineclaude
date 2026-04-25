import { normalizeDatabaseUrl } from '../lib/db'

describe('normalizeDatabaseUrl', () => {
  it('normalizes DigitalOcean semicolon-delimited ports', () => {
    expect(
      normalizeDatabaseUrl(
        'postgresql://user:pass@co2routermvp-do-user-32858703-0.e.db.ondigitalOcean.com;25060/db?sslmode=require'
      )
    ).toBe(
      'postgresql://user:pass@co2routermvp-do-user-32858703-0.e.db.ondigitalOcean.com:25060/db?sslmode=require'
    )
  })

  it('leaves valid database urls untouched', () => {
    expect(
      normalizeDatabaseUrl('postgresql://user:pass@db.example.com:25060/db?sslmode=require')
    ).toBe('postgresql://user:pass@db.example.com:25060/db?sslmode=require')
  })
})
