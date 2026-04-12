import { computePendingMigrationNames } from '../startup/ensure-migrations-ready'

describe('computePendingMigrationNames', () => {
  it('returns migrations that are not finished remotely', () => {
    expect(
      computePendingMigrationNames(
        ['20260324193000_add_water_control_plane', '20260324211500_add_decision_event_outbox'],
        [
          {
            migration_name: '20260324193000_add_water_control_plane',
            finished_at: new Date('2026-03-24T19:30:00.000Z'),
            rolled_back_at: null,
          },
        ]
      )
    ).toEqual(['20260324211500_add_decision_event_outbox'])
  })

  it('treats unfinished remote migrations as still pending', () => {
    expect(
      computePendingMigrationNames(['20260324211500_add_decision_event_outbox'], [
        {
          migration_name: '20260324211500_add_decision_event_outbox',
          finished_at: null,
          rolled_back_at: null,
        },
      ])
    ).toEqual(['20260324211500_add_decision_event_outbox'])
  })

  it('treats rolled-back migrations as already recovered', () => {
    expect(
      computePendingMigrationNames(['20260324211500_add_decision_event_outbox'], [
        {
          migration_name: '20260324211500_add_decision_event_outbox',
          finished_at: null,
          rolled_back_at: new Date('2026-03-24T21:20:00.000Z'),
        },
      ])
    ).toEqual(['20260324211500_add_decision_event_outbox'])
  })

  it('returns an empty list when every local migration is finished remotely', () => {
    expect(
      computePendingMigrationNames(
        ['20260324193000_add_water_control_plane', '20260324211500_add_decision_event_outbox'],
        [
          {
            migration_name: '20260324193000_add_water_control_plane',
            finished_at: new Date('2026-03-24T19:30:00.000Z'),
            rolled_back_at: null,
          },
          {
            migration_name: '20260324211500_add_decision_event_outbox',
            finished_at: new Date('2026-03-24T21:15:00.000Z'),
            rolled_back_at: null,
          },
        ]
      )
    ).toEqual([])
  })
})
