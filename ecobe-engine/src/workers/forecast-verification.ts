/**
 * Forecast Verification Worker
 *
 * Runs periodically to verify forecast accuracy by comparing predictions
 * against realized carbon intensity values.
 */

import { verifyForecasts, type ForecastAccuracyResult } from '../lib/forecast-accuracy'
import { prisma } from '../lib/db'
import { TaskAlreadyRunningError, withTaskLock } from '../lib/task-lock'

let lastRunAt: Date | null = null
let lastRunResults = 0
let isRunning = false

export function getForecastVerificationStatus() {
  return { lastRunAt, lastRunResults, isRunning }
}

export async function runForecastVerification(
  lookbackHours = 6
): Promise<{
  startedAt: string
  finishedAt: string
  checked: number
  withinTarget: number
  withinTargetPct: number
}> {
  if (isRunning) {
    throw new TaskAlreadyRunningError('forecast_verification')
  }

  isRunning = true
  const startedAt = new Date().toISOString()

  try {
    const { result } = await withTaskLock('forecast_verification', 15 * 60, async () => {
      console.log('Starting forecast accuracy verification...')
      const results = await verifyForecasts(lookbackHours)

      for (const result of results) {
        try {
          await prisma.integrationEvent.create({
            data: {
              source: `FORECAST_ACCURACY_${result.region}`,
              success: result.withinTarget,
              message: JSON.stringify(result),
              createdAt: new Date(),
            },
          })
        } catch (error) {
          console.warn('Failed to store forecast accuracy result:', error)
        }
      }

      const withinTarget = results.filter((result: ForecastAccuracyResult) => result.withinTarget).length
      const withinTargetPct =
        results.length > 0 ? Math.round((withinTarget / results.length) * 1000) / 10 : 0

      console.log(
        `Forecast verification complete: ${results.length} checked, ${withinTarget} within 12% target (${withinTargetPct}%)`
      )

      lastRunAt = new Date()
      lastRunResults = results.length

      return {
        startedAt,
        finishedAt: new Date().toISOString(),
        checked: results.length,
        withinTarget,
        withinTargetPct,
      }
    })

    return result
  } catch (error) {
    console.error('Forecast verification failed:', error)
    throw error
  } finally {
    isRunning = false
  }
}

/**
 * Start the forecast verification worker on a schedule.
 * Runs every 30 minutes to check forecasts that have matured.
 */
export function startForecastVerificationWorker(): void {
  console.log('Forecast verification worker started (every 30 minutes)')

  setTimeout(() => {
    runForecastVerification().catch((err) =>
      console.error('Initial forecast verification failed:', err)
    )
  }, 120000)

  setInterval(() => {
    runForecastVerification().catch((err) =>
      console.error('Scheduled forecast verification failed:', err)
    )
  }, 30 * 60 * 1000)
}
