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
    updatedAt: entry?.updatedAt ?? fallback?.updatedAt ?? nowIso(),
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
  const payload = JSON.stringify(normalizeWorkerStatusEntry(entry))
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
  const incident = await prisma.runtimeIncident.findUnique({
    where: {
      incidentKey,
    },
  })

  if (!incident) {
    return null
  }

  return prisma.runtimeIncident.update({
    where: {
      incidentKey,
    },
    data: {
      status: 'RESOLVED',
      details: details ?? incident.details ?? {},
      lastRecoveredAt: new Date(),
      recoveryCount: {
        increment: 1,
      },
    },
  })
}

export async function getRuntimeIncidentSummary(limit: number = 25) {
  const incidents = await prisma.runtimeIncident.findMany({
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    take: limit,
  })

  type RuntimeIncidentRow = (typeof incidents)[number]
  const open = incidents.filter((incident: RuntimeIncidentRow) => incident.status === 'OPEN')

  return {
    openCount: open.length,
    resolvedCount: incidents.length - open.length,
    openBySeverity: {
      low: open.filter((incident: RuntimeIncidentRow) => incident.severity === 'low').length,
      medium: open.filter((incident: RuntimeIncidentRow) => incident.severity === 'medium').length,
      high: open.filter((incident: RuntimeIncidentRow) => incident.severity === 'high').length,
      critical: open.filter((incident: RuntimeIncidentRow) => incident.severity === 'critical').length,
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
