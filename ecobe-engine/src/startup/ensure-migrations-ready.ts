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

    if (!migrationTableExists) {
      console.log('Prisma migration history table missing; running prisma migrate deploy')
      await runPrismaMigrateDeploy()
      return
    }

    const remoteHistory = await listRemoteMigrationHistory()
    const unfinishedMigrations = remoteHistory
      .filter((row) => !row.finished_at && !row.rolled_back_at)
      .map((row) => row.migration_name)
    const pendingMigrations = computePendingMigrationNames(localMigrationNames, remoteHistory)

    if (pendingMigrations.length === 0 && unfinishedMigrations.length === 0) {
      console.log('Prisma schema is current; no pending migrations')
      return
    }

    console.log(
      `Prisma schema drift detected; pending=${pendingMigrations.length}, unfinished=${unfinishedMigrations.length}`
    )
    await runPrismaMigrateDeploy()
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
