import { randomUUID } from 'crypto'

import { redis } from './redis'

export class TaskAlreadyRunningError extends Error {
  readonly code = 'TASK_ALREADY_RUNNING'
  readonly taskName: string
  readonly runId: string | null

  constructor(taskName: string, runId: string | null = null) {
    super(`${taskName} is already running`)
    this.name = 'TaskAlreadyRunningError'
    this.taskName = taskName
    this.runId = runId
  }
}

type LockHandle = {
  key: string
  runId: string
} | null

async function acquireTaskLock(taskName: string, ttlSeconds: number): Promise<LockHandle> {
  const key = `task-lock:${taskName}`
  const runId = randomUUID()

  try {
    const result = await redis.set(key, runId, 'EX', ttlSeconds, 'NX')
    if (result === 'OK') {
      return { key, runId }
    }

    const existingRunId = await redis.get(key).catch(() => null)
    if (existingRunId) {
      throw new TaskAlreadyRunningError(taskName, String(existingRunId))
    }

    return null
  } catch (error) {
    if (error instanceof TaskAlreadyRunningError) {
      throw error
    }

    return null
  }
}

async function releaseTaskLock(lock: LockHandle) {
  if (!lock) return

  try {
    const current = await redis.get(lock.key)
    if (current === lock.runId) {
      await redis.del(lock.key)
    }
  } catch {
    // Best-effort release only.
  }
}

export async function withTaskLock<T>(
  taskName: string,
  ttlSeconds: number,
  fn: (runId: string | null) => Promise<T>
): Promise<{ runId: string | null; result: T }> {
  const lock = await acquireTaskLock(taskName, ttlSeconds)

  try {
    const result = await fn(lock?.runId ?? null)
    return {
      runId: lock?.runId ?? null,
      result,
    }
  } finally {
    await releaseTaskLock(lock)
  }
}
