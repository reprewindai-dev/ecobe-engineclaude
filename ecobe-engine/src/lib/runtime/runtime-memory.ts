import { prisma } from '../db'
import { redis } from '../redis'

export const workerNames = [
  'forecastPoller',
  'eiaIngestion',
  'intelligenceJobs',
  'learningLoop',
  'routingSignalWarmLoop',
  'runtimeSupervisor',
  'decisionEventDispatcher',
] as const

export type WorkerName = (typeof workerNames)[number]

export type WorkerStatusEntry = {
  running: boolean
  lastRun: string | null
  nextRun: string | null
  updatedAt: string | null
}

export type WorkerRegistry = Record<WorkerName, WorkerStatusEntry>

export type RuntimeIncidentSeverity = 'low' | 'medium' | 'high' | 'critical'

const WORKER_STATUS_KEY = 'runtime:worker-status'

function nowIso() {
  return new Date().toISOString()
}

function parseIso(iso: string | null | undefined) {
  if (!iso) return null
  const ts = new Date(iso).getTime()
  return Number.isFinite(ts) ? ts : null
}

function getEntryRecency(entry?: Partial<WorkerStatusEntry> | null) {
  return (
    parseIso(entry?.updatedAt) ??
    parseIso(entry?.lastRun) ??
    parseIso(entry?.nextRun) ??
    0
  )
}

export function createInitialWorkerRegistry(): WorkerRegistry {
  return workerNames.reduce((registry, worker) => {
    registry[worker] = {
      running: false,
      lastRun: null,
      nextRun: null,
      updatedAt: null,
    }
    return registry
  }, {} as WorkerRegistry)
}

export function normalizeWorkerStatusEntry(
  entry?: Partial<WorkerStatusEntry> | null,
  fallback?: WorkerStatusEntry
): WorkerStatusEntry {
  return {
    running: entry?.running ?? fallback?.running ?? false,
    lastRun: entry?.lastRun ?? fallback?.lastRun ?? null,
    nextRun: entry?.nextRun ?? fallback?.nextRun ?? null,
    updatedAt: entry?.updatedAt ?? fallback?.updatedAt ?? null,
  }
}

export function mergeWorkerRegistries(
  memoryRegistry: WorkerRegistry,
  durableRegistry: Partial<WorkerRegistry>
): WorkerRegistry {
  const merged = createInitialWorkerRegistry()

  for (const worker of workerNames) {
    const memoryEntry = memoryRegistry[worker]
    const durableEntry = durableRegistry[worker]
    const preferred =
      getEntryRecency(durableEntry) > getEntryRecency(memoryEntry) ? durableEntry : memoryEntry

    merged[worker] = normalizeWorkerStatusEntry(preferred, memoryEntry)
  }

  return merged
}

export async function persistWorkerStatus(worker: WorkerName, entry: WorkerStatusEntry) {
  const payload = JSON.stringify(
    normalizeWorkerStatusEntry({
      ...entry,
      updatedAt: nowIso(),
    })
  )
  await redis.hset(WORKER_STATUS_KEY, worker, payload)
}

export async function loadPersistedWorkerStatuses(): Promise<Partial<WorkerRegistry>> {
  const rows = (await redis.hgetall(WORKER_STATUS_KEY)) ?? {}
  const registry: Partial<WorkerRegistry> = {}

  for (const worker of workerNames) {
    const raw = rows[worker]
    if (!raw) continue

    try {
      const parsed = JSON.parse(raw) as Partial<WorkerStatusEntry>
      registry[worker] = normalizeWorkerStatusEntry(parsed)
    } catch {
      continue
    }
  }

  return registry
}

export async function recordRuntimeIncident(input: {
  incidentKey: string
  component: string
  severity: RuntimeIncidentSeverity
  summary: string
  details?: Record<string, unknown>
}) {
  const detectedAt = new Date()

  await prisma.runtimeIncident.upsert({
    where: {
      incidentKey: input.incidentKey,
    },
    update: {
      component: input.component,
      severity: input.severity,
      status: 'OPEN',
      summary: input.summary,
      details: input.details ?? {},
      lastDetectedAt: detectedAt,
      detectionCount: {
        increment: 1,
      },
    },
    create: {
      incidentKey: input.incidentKey,
      component: input.component,
      severity: input.severity,
      status: 'OPEN',
      summary: input.summary,
      details: input.details ?? {},
      firstDetectedAt: detectedAt,
      lastDetectedAt: detectedAt,
      detectionCount: 1,
    },
  })
}

export async function resolveRuntimeIncident(
  incidentKey: string,
  details?: Record<string, unknown>
) {
  const result = await prisma.runtimeIncident.updateMany({
    where: {
      incidentKey,
    },
    data: {
      status: 'RESOLVED',
      ...(details !== undefined ? { details } : {}),
      lastRecoveredAt: new Date(),
      recoveryCount: {
        increment: 1,
      },
    },
  })

  if (result.count === 0) {
    return null
  }

  return prisma.runtimeIncident.findUnique({
    where: {
      incidentKey,
    },
  })
}

export async function getRuntimeIncidentSummary(limit: number = 25) {
  const [incidents, openCount, totalCount, lowCount, mediumCount, highCount, criticalCount] = await Promise.all([
    prisma.runtimeIncident.findMany({
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: limit,
    }),
    prisma.runtimeIncident.count({ where: { status: 'OPEN' } }),
    prisma.runtimeIncident.count(),
    prisma.runtimeIncident.count({ where: { status: 'OPEN', severity: 'low' } }),
    prisma.runtimeIncident.count({ where: { status: 'OPEN', severity: 'medium' } }),
    prisma.runtimeIncident.count({ where: { status: 'OPEN', severity: 'high' } }),
    prisma.runtimeIncident.count({ where: { status: 'OPEN', severity: 'critical' } }),
  ])

  type RuntimeIncidentRow = (typeof incidents)[number]

  return {
    openCount,
    resolvedCount: Math.max(0, totalCount - openCount),
    criticalCount,
    openBySeverity: {
      low: lowCount,
      medium: mediumCount,
      high: highCount,
      critical: criticalCount,
    },
    incidents: incidents.map((incident: RuntimeIncidentRow) => ({
      incidentKey: incident.incidentKey,
      component: incident.component,
      severity: incident.severity,
      status: incident.status,
      summary: incident.summary,
      details: incident.details,
      firstDetectedAt: incident.firstDetectedAt.toISOString(),
      lastDetectedAt: incident.lastDetectedAt.toISOString(),
      lastRecoveredAt: incident.lastRecoveredAt?.toISOString() ?? null,
      detectionCount: incident.detectionCount,
      recoveryCount: incident.recoveryCount,
      updatedAt: incident.updatedAt.toISOString(),
    })),
  }
}
