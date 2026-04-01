import { Prisma } from '@prisma/client'
import { addDays } from 'date-fns'

import { prisma } from '../src/lib/db'
import {
  buildDecisionProjectionPayloadFromPersistedDecision,
  projectDashboardRoutingDecision,
} from '../src/lib/ci/decision-projection'

const days = Math.max(1, Number(process.argv[2] ?? '30'))
const batchSize = Math.max(10, Math.min(250, Number(process.argv[3] ?? '100')))
const untilDaysAgo = Math.max(0, Number(process.argv[4] ?? '0'))
const maxRows = Math.max(0, Number(process.argv[5] ?? '0'))
const onlyMissing = (process.argv[6] ?? 'missing').toLowerCase() !== 'all'

type Cursor = {
  id: string
  createdAt: Date
}

type CandidateRow = {
  id: string
  createdAt: Date
}

const ciDecisionSelect = {
  id: true,
  decisionFrameId: true,
  createdAt: true,
  baselineRegion: true,
  selectedRegion: true,
  carbonIntensity: true,
  baseline: true,
  savings: true,
  carbonSavingsRatio: true,
  baselineEnergyKwh: true,
  chosenEnergyKwh: true,
  estimatedKwh: true,
  baselineCo2G: true,
  chosenCo2G: true,
  co2DeltaG: true,
  carbonDataQuality: true,
  decisionAction: true,
  decisionMode: true,
  reasonCode: true,
  signalConfidence: true,
  fallbackUsed: true,
  lowConfidence: true,
  waterImpactLiters: true,
  waterBaselineLiters: true,
  waterScarcityImpact: true,
  waterStressIndex: true,
  waterConfidence: true,
  proofHash: true,
  metadata: true,
} as const

async function loadCandidateBatch(
  since: Date,
  windowEnd: Date,
  cursor: Cursor | undefined,
  take: number,
  missingOnly: boolean
) {
  if (!missingOnly) {
    const rows = await prisma.cIDecision.findMany({
      where: {
        createdAt: {
          gte: since,
          lt: windowEnd,
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
      ...(cursor
        ? {
            cursor: { id: cursor.id },
            skip: 1,
          }
        : {}),
      select: ciDecisionSelect,
    })

    return rows
  }

  const candidates = await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
    SELECT c."id", c."createdAt"
    FROM "CIDecision" c
    LEFT JOIN "DashboardRoutingDecision" d
      ON d."sourceCiDecisionId" = c."id"
    WHERE c."createdAt" >= ${since}
      AND c."createdAt" < ${windowEnd}
      AND d."sourceCiDecisionId" IS NULL
      ${
        cursor
          ? Prisma.sql`
            AND (
              c."createdAt" > ${cursor.createdAt}
              OR (c."createdAt" = ${cursor.createdAt} AND c."id" > ${cursor.id})
            )
          `
          : Prisma.empty
      }
    ORDER BY c."createdAt" ASC, c."id" ASC
    LIMIT ${take}
  `)

  if (candidates.length === 0) {
    return []
  }

  const ids = candidates.map((row) => row.id)
  const rows = await prisma.cIDecision.findMany({
    where: {
      id: {
        in: ids,
      },
    },
    select: ciDecisionSelect,
  })

  const rowMap = new Map(rows.map((row) => [row.id, row]))
  return candidates
    .map((candidate) => rowMap.get(candidate.id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
}

async function main() {
  const windowEnd = addDays(new Date(), -untilDaysAgo)
  const since = addDays(windowEnd, -days)
  const startedAt = new Date()
  let cursor: Cursor | undefined
  let scanned = 0
  let projected = 0

  for (;;) {
    if (maxRows > 0 && projected >= maxRows) break

    const rows = await loadCandidateBatch(
      since,
      windowEnd,
      cursor,
      maxRows > 0 ? Math.min(batchSize, maxRows - projected) : batchSize,
      onlyMissing
    )

    if (rows.length === 0) break

    const upserts = rows.map((row) => {
      const payload = buildDecisionProjectionPayloadFromPersistedDecision(row)
      const projectedRow = projectDashboardRoutingDecision(payload)
      return prisma.dashboardRoutingDecision.upsert({
        where: {
          sourceCiDecisionId: row.id,
        },
        create: projectedRow.row,
        update: projectedRow.row,
      })
    })

    await prisma.$transaction(upserts)

    scanned += rows.length
    projected += rows.length
    const lastRow = rows[rows.length - 1]
    cursor = lastRow
      ? {
          id: lastRow.id,
          createdAt: lastRow.createdAt,
        }
      : undefined

    console.log(
      JSON.stringify(
        {
          batchCompleteAt: new Date().toISOString(),
          scanned,
          projected,
          batchSize: rows.length,
        },
        null,
        2
      )
    )
  }

  console.log(
    JSON.stringify(
      {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        replayWindowDays: days,
        untilDaysAgo,
        windowStart: since.toISOString(),
        windowEnd: windowEnd.toISOString(),
        batchSize,
        maxRows: maxRows || null,
        mode: onlyMissing ? 'missing' : 'all',
        scanned,
        projected,
      },
      null,
      2
    )
  )
}

main()
  .catch((error) => {
    console.error('Dashboard projection backfill failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
