import {
  getBalancingAuthority,
  getEiaRespondent,
  getUsBalancingAuthorities,
  hasEia930Coverage,
} from '../lib/grid-signals/region-mapping'

describe('region mapping', () => {
  it('maps centralus to the live EIA respondent for Southwest Power Pool', () => {
    expect(hasEia930Coverage('centralus')).toBe(true)
    expect(getBalancingAuthority('centralus')).toBe('SWPP')
    expect(getEiaRespondent('centralus')).toBe('SWPP')
  })

  it('includes SWPP in the unique ingestion authority list', () => {
    expect(
      getUsBalancingAuthorities().find((authority) => authority.balancingAuthority === 'SWPP')
    ).toEqual({
      region: 'SWPP',
      balancingAuthority: 'SWPP',
      eiaRespondent: 'SWPP',
    })
  })
})
