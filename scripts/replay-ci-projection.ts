import { addDays } from 'date-fns'

import { enqueueDecisionProjectionReplayWindow } from '../src/lib/ci/decision-projection'
import { prisma } from '../src/lib/db'

async function main() {
  const days = Number(process.argv[2] ?? '30')
  const since = addDays(new Date(), -Math.max(1, days))
  const startedAt = new Date()

  const result = await enqueueDecisionProjectionReplayWindow({
    since,
    take: 250,
  })

  console.log(
    JSON.stringify(
      {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        replayWindowDays: days,
        ...result,
      },
      null,
      2
    )
  )
}

main()
  .catch((error) => {
    console.error('CI projection replay failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
