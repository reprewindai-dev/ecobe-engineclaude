import cron, { type ScheduledTask } from 'node-cron'

import { env } from '../config/env'
import { processDecisionProjectionOutboxBatch } from '../lib/ci/decision-projection'
import { setWorkerStatus } from '../routes/system'

let dispatchTask: ScheduledTask | null = null
let running = false

export async function runDecisionProjectionDispatchCycle() {
  if (running) return
  running = true
  const startedAt = new Date()

  try {
    const result = await processDecisionProjectionOutboxBatch()
    setWorkerStatus('decisionProjectionDispatcher', {
      running: true,
      lastRun: startedAt.toISOString(),
      nextRun: null,
    })
    if (result.processed > 0) {
      console.log('Decision projection dispatcher cycle:', result)
    }
  } catch (error) {
    console.error('Decision projection dispatcher cycle failed:', error)
    setWorkerStatus('decisionProjectionDispatcher', {
      running: false,
      lastRun: startedAt.toISOString(),
      nextRun: null,
    })
  } finally {
    running = false
  }
}

export function startDecisionProjectionDispatcherWorker() {
  if (!env.DECISION_PROJECTION_ENABLED) {
    console.log('Decision projection dispatcher disabled')
    setWorkerStatus('decisionProjectionDispatcher', {
      running: false,
      lastRun: null,
      nextRun: null,
    })
    return
  }

  if (dispatchTask) return

  setWorkerStatus('decisionProjectionDispatcher', {
    running: true,
    lastRun: null,
    nextRun: null,
  })

  dispatchTask = cron.schedule(env.DECISION_PROJECTION_CRON, () => {
    runDecisionProjectionDispatchCycle().catch((error) => {
      console.error('Decision projection dispatch cron failed:', error)
    })
  })

  runDecisionProjectionDispatchCycle().catch((error) => {
    console.error('Decision projection dispatch initial run failed:', error)
  })

  console.log(`Decision projection dispatcher scheduled (${env.DECISION_PROJECTION_CRON})`)
}

export function stopDecisionProjectionDispatcherWorker() {
  if (dispatchTask) {
    dispatchTask.stop()
    dispatchTask = null
  }

  setWorkerStatus('decisionProjectionDispatcher', {
    running: false,
  })
}
