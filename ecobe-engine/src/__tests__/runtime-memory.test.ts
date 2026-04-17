import {
  createInitialWorkerRegistry,
  mergeWorkerRegistries,
  normalizeWorkerStatusEntry,
} from '../lib/runtime/runtime-memory'

describe('runtime memory worker registry', () => {
  it('creates a full worker registry with null timestamps', () => {
    const registry = createInitialWorkerRegistry()

    expect(Object.keys(registry)).toEqual([
      'forecastPoller',
      'eiaIngestion',
      'intelligenceJobs',
      'learningLoop',
      'routingSignalWarmLoop',
      'runtimeSupervisor',
      'decisionEventDispatcher',
    ])
    expect(registry.runtimeSupervisor).toEqual({
      running: false,
      lastRun: null,
      nextRun: null,
      updatedAt: null,
    })
  })

  it('normalizes partial worker status entries with safe defaults', () => {
    const normalized = normalizeWorkerStatusEntry({
      running: true,
      lastRun: '2026-04-17T15:00:00.000Z',
    })

    expect(normalized.running).toBe(true)
    expect(normalized.lastRun).toBe('2026-04-17T15:00:00.000Z')
    expect(normalized.nextRun).toBeNull()
    expect(typeof normalized.updatedAt).toBe('string')
  })

  it('prefers the more recent durable worker heartbeat when merging registries', () => {
    const memory = createInitialWorkerRegistry()
    memory.forecastPoller = {
      running: true,
      lastRun: '2026-04-17T15:00:00.000Z',
      nextRun: '2026-04-17T15:30:00.000Z',
      updatedAt: '2026-04-17T15:00:00.000Z',
    }

    const merged = mergeWorkerRegistries(memory, {
      forecastPoller: {
        running: true,
        lastRun: '2026-04-17T15:10:00.000Z',
        nextRun: '2026-04-17T15:40:00.000Z',
        updatedAt: '2026-04-17T15:10:00.000Z',
      },
    })

    expect(merged.forecastPoller.lastRun).toBe('2026-04-17T15:10:00.000Z')
    expect(merged.forecastPoller.nextRun).toBe('2026-04-17T15:40:00.000Z')
  })
})
