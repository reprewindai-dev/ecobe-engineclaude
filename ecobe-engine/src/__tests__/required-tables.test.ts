/**
 * Tests for the new REQUIRED_TABLE_NAMES and listMissingRequiredTables additions
 * to ecobe-engine/src/startup/ensure-migrations-ready.ts
 */

// ── Mock @prisma/client before importing the module under test ──────────────
const mockQueryRawUnsafe = jest.fn()
const mockConnect = jest.fn().mockResolvedValue(undefined)
const mockDisconnect = jest.fn().mockResolvedValue(undefined)

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      $connect: mockConnect,
      $disconnect: mockDisconnect,
      $queryRawUnsafe: mockQueryRawUnsafe,
    })),
  }
})

// ── Mock child_process spawn so no real process is spawned ───────────────────
const mockSpawnOn = jest.fn()
const mockSpawn = jest.fn().mockReturnValue({
  on: mockSpawnOn,
})

jest.mock('child_process', () => ({
  spawn: mockSpawn,
}))

// ── Mock fs.promises so readdir can be controlled ────────────────────────────
const mockReaddir = jest.fn()
jest.mock('fs', () => {
  const actual = jest.requireActual('fs')
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readdir: mockReaddir,
    },
  }
})

import {
  REQUIRED_TABLE_NAMES,
  listMissingRequiredTables,
  computePendingMigrationNames,
  listLocalMigrationNames,
} from '../startup/ensure-migrations-ready'

describe('REQUIRED_TABLE_NAMES', () => {
  it('contains exactly the four control-plane table names', () => {
    expect(REQUIRED_TABLE_NAMES).toEqual([
      'Region',
      'CarbonCommandOutcome',
      'WorkloadEmbeddingIndex',
      'AdaptiveProfile',
    ])
  })

  it('has length 4', () => {
    expect(REQUIRED_TABLE_NAMES).toHaveLength(4)
  })

  it('contains Region', () => {
    expect(REQUIRED_TABLE_NAMES).toContain('Region')
  })

  it('contains CarbonCommandOutcome', () => {
    expect(REQUIRED_TABLE_NAMES).toContain('CarbonCommandOutcome')
  })

  it('contains WorkloadEmbeddingIndex', () => {
    expect(REQUIRED_TABLE_NAMES).toContain('WorkloadEmbeddingIndex')
  })

  it('contains AdaptiveProfile', () => {
    expect(REQUIRED_TABLE_NAMES).toContain('AdaptiveProfile')
  })
})

describe('computePendingMigrationNames (edge cases for new repair-migration)', () => {
  it('returns empty list when local migration list is empty', () => {
    expect(computePendingMigrationNames([], [])).toEqual([])
  })

  it('returns all locals when remote history is empty', () => {
    expect(
      computePendingMigrationNames(
        ['20260420010000_repair_missing_control_plane_tables'],
        []
      )
    ).toEqual(['20260420010000_repair_missing_control_plane_tables'])
  })

  it('includes repair migration when not in remote history', () => {
    const result = computePendingMigrationNames(
      [
        '20260217135759_init',
        '20260420010000_repair_missing_control_plane_tables',
      ],
      [
        {
          migration_name: '20260217135759_init',
          finished_at: new Date('2026-02-17T13:57:59.000Z'),
          rolled_back_at: null,
        },
      ]
    )
    expect(result).toEqual(['20260420010000_repair_missing_control_plane_tables'])
  })

  it('does not include remote-finished migrations even if order differs', () => {
    const result = computePendingMigrationNames(
      ['20260217135759_init', '20260315003849_add_grid_signals'],
      [
        {
          migration_name: '20260315003849_add_grid_signals',
          finished_at: new Date('2026-03-15T00:38:49.000Z'),
          rolled_back_at: null,
        },
        {
          migration_name: '20260217135759_init',
          finished_at: new Date('2026-02-17T13:57:59.000Z'),
          rolled_back_at: null,
        },
      ]
    )
    expect(result).toEqual([])
  })
})

describe('listLocalMigrationNames', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns sorted directory names', async () => {
    mockReaddir.mockResolvedValue([
      { name: '20260420010000_repair_missing_control_plane_tables', isDirectory: () => true },
      { name: '20260217135759_init', isDirectory: () => true },
      { name: '20260315003849_add_grid_signals', isDirectory: () => true },
      { name: 'migration_lock.toml', isDirectory: () => false },
    ])

    const names = await listLocalMigrationNames('/fake/migrations')
    expect(names).toEqual([
      '20260217135759_init',
      '20260315003849_add_grid_signals',
      '20260420010000_repair_missing_control_plane_tables',
    ])
  })

  it('excludes non-directory entries', async () => {
    mockReaddir.mockResolvedValue([
      { name: '20260217135759_init', isDirectory: () => true },
      { name: 'migration_lock.toml', isDirectory: () => false },
      { name: 'README.md', isDirectory: () => false },
    ])

    const names = await listLocalMigrationNames('/fake/migrations')
    expect(names).toEqual(['20260217135759_init'])
  })

  it('returns empty list when no directories exist', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'migration_lock.toml', isDirectory: () => false },
    ])

    const names = await listLocalMigrationNames('/fake/migrations')
    expect(names).toEqual([])
  })
})

describe('listMissingRequiredTables', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns empty list when all required tables exist', async () => {
    // All tables exist → returns [{ exists: true }]
    mockQueryRawUnsafe.mockResolvedValue([{ exists: true }])

    const missing = await listMissingRequiredTables()
    expect(missing).toEqual([])
    // Should have queried for each of the 4 required tables
    expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(4)
  })

  it('returns all 4 when no required tables exist', async () => {
    mockQueryRawUnsafe.mockResolvedValue([{ exists: false }])

    const missing = await listMissingRequiredTables()
    expect(missing).toEqual([
      'Region',
      'CarbonCommandOutcome',
      'WorkloadEmbeddingIndex',
      'AdaptiveProfile',
    ])
  })

  it('returns only the tables that are missing', async () => {
    // Region exists, CarbonCommandOutcome missing, WorkloadEmbeddingIndex exists, AdaptiveProfile missing
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ exists: true }])   // Region
      .mockResolvedValueOnce([{ exists: false }])  // CarbonCommandOutcome
      .mockResolvedValueOnce([{ exists: true }])   // WorkloadEmbeddingIndex
      .mockResolvedValueOnce([{ exists: false }])  // AdaptiveProfile

    const missing = await listMissingRequiredTables()
    expect(missing).toEqual(['CarbonCommandOutcome', 'AdaptiveProfile'])
  })

  it('handles falsy exists value (null/undefined) as missing', async () => {
    mockQueryRawUnsafe.mockResolvedValue([{ exists: null }])

    const missing = await listMissingRequiredTables()
    expect(missing).toHaveLength(4)
  })

  it('handles empty result array as missing', async () => {
    mockQueryRawUnsafe.mockResolvedValue([])

    const missing = await listMissingRequiredTables()
    expect(missing).toHaveLength(4)
  })
})