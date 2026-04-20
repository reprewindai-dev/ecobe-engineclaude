import { PrismaClient } from '@prisma/client'
import { promises as fs } from 'fs'
import path from 'path'
import { spawn } from 'child_process'

type ExistsRow = { exists: boolean }
type MigrationHistoryRow = {
  migration_name: string
  finished_at: Date | null
  rolled_back_at: Date | null
}

export const REQUIRED_TABLE_NAMES = [
  'Region',
  'CarbonCommandOutcome',
  'WorkloadEmbeddingIndex',
  'AdaptiveProfile',
] as const

const prisma = new PrismaClient({ log: ['error'] })
const MIGRATIONS_DIR = path.resolve(__dirname, '../../prisma/migrations')

export function computePendingMigrationNames(
  localMigrationNames: string[],
  remoteHistory: MigrationHistoryRow[]
) {
  const finishedMigrations = new Set(
    remoteHistory.filter((row) => row.finished_at).map((row) => row.migration_name)
  )

  return localMigrationNames.filter((name) => !finishedMigrations.has(name))
}

export async function listLocalMigrationNames(migrationsDir = MIGRATIONS_DIR) {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

async function prismaMigrationTableExists() {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS "exists"`
  )) as ExistsRow[]

  return Boolean(rows[0]?.exists)
}

async function prismaTableExists(tableName: string) {
  const safeTableName = tableName.replace(/"/g, '""')
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public."${safeTableName}"') IS NOT NULL AS "exists"`
  )) as ExistsRow[]

  return Boolean(rows[0]?.exists)
}

export async function listMissingRequiredTables() {
  const missingTables: string[] = []

  for (const tableName of REQUIRED_TABLE_NAMES) {
    if (!(await prismaTableExists(tableName))) {
      missingTables.push(tableName)
    }
  }

  return missingTables
}

async function listRemoteMigrationHistory() {
  return (await prisma.$queryRawUnsafe(
    `SELECT migration_name, finished_at, rolled_back_at FROM "public"."_prisma_migrations"`
  )) as MigrationHistoryRow[]
}

async function runPrismaMigrateDeploy() {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, ['prisma', 'migrate', 'deploy'], {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`prisma migrate deploy exited with code ${code ?? 'unknown'}`))
    })
  })
}

export async function ensureMigrationsReady() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required before checking migration readiness')
  }

  await prisma.$connect()

  try {
    const localMigrationNames = await listLocalMigrationNames()
    const migrationTableExists = await prismaMigrationTableExists()
    const missingRequiredTables = await listMissingRequiredTables()

    let remoteHistory: MigrationHistoryRow[] = []
    let unfinishedMigrations: string[] = []
    let pendingMigrations: string[] = localMigrationNames

    if (migrationTableExists) {
      remoteHistory = await listRemoteMigrationHistory()
      unfinishedMigrations = remoteHistory
        .filter((row) => !row.finished_at && !row.rolled_back_at)
        .map((row) => row.migration_name)
      pendingMigrations = computePendingMigrationNames(localMigrationNames, remoteHistory)
    }

    if (!migrationTableExists) {
      console.log('Prisma migration history table missing; running prisma migrate deploy')
      await runPrismaMigrateDeploy()
    } else if (pendingMigrations.length > 0 || unfinishedMigrations.length > 0) {
      console.log(
        `Prisma schema drift detected; pending=${pendingMigrations.length}, unfinished=${unfinishedMigrations.length}, missingTables=${missingRequiredTables.length}`
      )
      await runPrismaMigrateDeploy()
    } else if (missingRequiredTables.length > 0) {
      console.log(
        `Prisma schema metadata is current, but required tables are missing; missingTables=${missingRequiredTables.join(', ')}`
      )
      await runPrismaMigrateDeploy()
    } else {
      console.log('Prisma schema is current; required tables present')
      return
    }

    const remainingMissingTables = await listMissingRequiredTables()
    if (remainingMissingTables.length > 0) {
      throw new Error(
        `Migration deploy completed but required tables are still missing: ${remainingMissingTables.join(', ')}`
      )
    }

    console.log('Prisma schema is current; required tables present')
  } finally {
    await prisma.$disconnect().catch(() => undefined)
  }
}

async function main() {
  try {
    await ensureMigrationsReady()
  } catch (error) {
    console.error('Failed migration readiness gate:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  void main()
}
