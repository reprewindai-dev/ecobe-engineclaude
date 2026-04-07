import 'server-only'

import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

import type {
  HallOGridDoctrineSummary,
  HallOGridFrame,
  HallOGridOverrideRecord,
} from '@/types/control-surface'

type GovernanceAuditEntry = {
  id: string
  timestamp: string
  actor: string
  action: string
  target: string
  detail: string
}

type GovernanceStore = {
  doctrines: Record<string, HallOGridDoctrineSummary>
  overrides: Record<string, HallOGridOverrideRecord[]>
  audit: GovernanceAuditEntry[]
}

const STORAGE_FILE = process.env.HALLOGRID_GOVERNANCE_STORE_PATH
  ? path.resolve(process.env.HALLOGRID_GOVERNANCE_STORE_PATH)
  : path.join(process.cwd(), 'runtime', 'hallogrid', 'governance-store.json')
const STORAGE_DIR = path.dirname(STORAGE_FILE)

const EMPTY_STORE: GovernanceStore = {
  doctrines: {},
  overrides: {},
  audit: [],
}

function doctrineKey(frame: HallOGridFrame) {
  return `dok-${frame.region.split('-').slice(0, 2).join('-').toLowerCase()}-${frame.workloadClass}`
}

function buildDefaultDoctrine(frame: HallOGridFrame): HallOGridDoctrineSummary {
  const regionFamily = frame.region.split('-').slice(0, 2).join('-').toUpperCase()
  const failMode =
    frame.workloadClass === 'critical'
      ? 'fail_safe_deny'
      : frame.trust.degraded
        ? 'fail_guarded_delay'
        : 'fail_open_last_safe_doctrine'

  return {
    doctrineId: doctrineKey(frame),
    doctrineLabel: `${regionFamily} governed execution doctrine`,
    version: `v${new Date(frame.createdAt).getUTCFullYear()}.4`,
    status: 'certified',
    automationMode: frame.workloadClass === 'critical' ? 'supervised_automatic' : 'full_authority',
    failMode,
    signedBy: 'HallOGrid Governance Council',
    signedAt: frame.createdAt,
    certificationScope: [frame.workloadClass, regionFamily, 'SAIQ governance'],
    controlPoints: ['decision API', 'queue adapter', 'runtime control surface'],
    activePolicyLabel: frame.reasonCode.replace(/_/g, ' '),
  }
}

function buildDefaultOverrides(frame: HallOGridFrame): HallOGridOverrideRecord[] {
  const now = new Date(frame.createdAt)
  const plusHours = (hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString()

  return [
    {
      id: `${frame.id}-ovr-01`,
      requestedAction: 'switch_to_advisory',
      reasonCode: 'MAINTENANCE_WINDOW',
      scope: `${frame.region} / ${frame.workloadClass}`,
      status: 'scheduled',
      requestedBy: 'ops-supervisor',
      createdAt: now.toISOString(),
      expiresAt: plusHours(4),
      ticketRef: 'INC-2147',
    },
    {
      id: `${frame.id}-ovr-02`,
      requestedAction: frame.action === 'delay' ? 'approve_anyway' : 'force_delay',
      reasonCode: 'LATENCY_EXCEPTION',
      scope: frame.region,
      status: frame.trust.degraded ? 'active' : 'scheduled',
      requestedBy: 'platform-operator',
      createdAt: now.toISOString(),
      expiresAt: plusHours(2),
      ticketRef: 'OPS-778',
    },
  ]
}

function nextDoctrineVersion(version: string) {
  const match = /^v(\d+)\.(\d+)$/.exec(version)
  if (!match) return `v${new Date().getUTCFullYear()}.1`
  return `v${match[1]}.${Number(match[2]) + 1}`
}

async function ensureStore() {
  await mkdir(STORAGE_DIR, { recursive: true })
}

async function loadStore(): Promise<GovernanceStore> {
  await ensureStore()

  try {
    const raw = await readFile(STORAGE_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<GovernanceStore>
    return {
      doctrines: parsed.doctrines ?? {},
      overrides: parsed.overrides ?? {},
      audit: parsed.audit ?? [],
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...EMPTY_STORE }
    }
    throw error
  }
}

async function saveStore(store: GovernanceStore) {
  await ensureStore()
  await writeFile(STORAGE_FILE, JSON.stringify(store, null, 2), 'utf8')
}

let governanceWriteQueue: Promise<unknown> = Promise.resolve()

async function withGovernanceStoreWrite<T>(task: (store: GovernanceStore) => Promise<T> | T) {
  const pending = governanceWriteQueue.catch(() => undefined)
  const resultPromise = pending.then(async () => {
    const store = await loadStore()
    const result = await task(store)
    await saveStore(store)
    return result
  })

  governanceWriteQueue = resultPromise.then(() => undefined, () => undefined)
  return resultPromise
}

function appendAudit(store: GovernanceStore, actor: string, action: string, target: string, detail: string) {
  store.audit.unshift({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    actor,
    action,
    target,
    detail,
  })
  store.audit = store.audit.slice(0, 200)
}

export async function getHallOGridDoctrine(frame: HallOGridFrame) {
  const store = await loadStore()
  return store.doctrines[doctrineKey(frame)] ?? buildDefaultDoctrine(frame)
}

export async function updateHallOGridDoctrine(
  frame: HallOGridFrame,
  input: Pick<HallOGridDoctrineSummary, 'automationMode' | 'failMode' | 'activePolicyLabel'>,
  actor: string
) {
  return withGovernanceStoreWrite(async (store) => {
    const key = doctrineKey(frame)
    const current = store.doctrines[key] ?? buildDefaultDoctrine(frame)
    const next: HallOGridDoctrineSummary = {
      ...current,
      automationMode: input.automationMode,
      failMode: input.failMode,
      activePolicyLabel: input.activePolicyLabel.trim(),
      version: nextDoctrineVersion(current.version),
      signedBy: actor,
      signedAt: new Date().toISOString(),
    }

    store.doctrines[key] = next
    appendAudit(store, actor, 'doctrine.update', key, `${next.automationMode} | ${next.failMode} | ${next.activePolicyLabel}`)
    return next
  })
}

export async function getHallOGridOverrides(frame: HallOGridFrame) {
  const store = await loadStore()
  return store.overrides[frame.id] ?? buildDefaultOverrides(frame)
}

export async function createHallOGridOverride(
  frame: HallOGridFrame,
  input: Pick<HallOGridOverrideRecord, 'requestedAction' | 'reasonCode' | 'scope' | 'ticketRef'> & {
    expiresInHours?: number | null
  },
  actor: string
) {
  return withGovernanceStoreWrite(async (store) => {
    const current = store.overrides[frame.id] ?? buildDefaultOverrides(frame)
    const createdAt = new Date().toISOString()
    const expiresAt =
      input.expiresInHours && input.expiresInHours > 0
        ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000).toISOString()
        : null

    const nextRecord: HallOGridOverrideRecord = {
      id: `${frame.id}-ovr-${Date.now().toString(36)}`,
      requestedAction: input.requestedAction,
      reasonCode: input.reasonCode.trim(),
      scope: input.scope.trim(),
      status: 'active',
      requestedBy: actor,
      createdAt,
      expiresAt,
      ticketRef: input.ticketRef.trim(),
    }

    store.overrides[frame.id] = [nextRecord, ...current]
    appendAudit(store, actor, 'override.create', frame.id, `${nextRecord.requestedAction} | ${nextRecord.reasonCode}`)
    return store.overrides[frame.id]
  })
}

export async function updateHallOGridOverrideStatus(
  frame: HallOGridFrame,
  overrideId: string,
  status: HallOGridOverrideRecord['status'],
  actor: string
) {
  return withGovernanceStoreWrite(async (store) => {
    const current = store.overrides[frame.id] ?? buildDefaultOverrides(frame)
    const index = current.findIndex((item) => item.id === overrideId)
    if (index === -1) return null

    const next = current.map((item) =>
      item.id === overrideId
        ? {
            ...item,
            status,
            expiresAt: status === 'expired' ? new Date().toISOString() : item.expiresAt,
          }
        : item
    )

    store.overrides[frame.id] = next
    appendAudit(store, actor, 'override.status', overrideId, status)
    return next
  })
}
