jest.mock('../config/env', () => ({
  env: {
    DOCTRINE_CACHE_TTL_SEC: 60,
    DOCTRINE_DEFAULT_ORG_ID: undefined,
  },
}))

jest.mock('../lib/observability/telemetry', () => ({
  telemetryMetricNames: {
    doctrineProposalCount: 'doctrineProposalCount',
    doctrineApprovalLatencyMs: 'doctrineApprovalLatencyMs',
    doctrineRejectCount: 'doctrineRejectCount',
    doctrineRollbackCount: 'doctrineRollbackCount',
    doctrineCacheHitCount: 'doctrineCacheHitCount',
    doctrineCacheMissCount: 'doctrineCacheMissCount',
    doctrineLoadFailureCount: 'doctrineLoadFailureCount',
  },
  recordTelemetryMetric: jest.fn(),
}))

jest.mock('../lib/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}))

const tx = {
  doctrineProposal: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  doctrineVersion: {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  doctrineAuditEvent: {
    create: jest.fn(),
  },
}

jest.mock('../lib/db', () => ({
  prisma: {
    doctrineVersion: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    doctrineProposal: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    doctrineAuditEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    organization: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  },
}))

import { redis } from '../lib/redis'
import {
  approveDoctrineProposal,
  DoctrineServiceError,
  rollbackDoctrineVersion,
} from '../lib/doctrine/service'

const mockedRedisDel = redis.del as jest.Mock

describe('doctrine service mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('enforces proposer != approver', async () => {
    tx.doctrineProposal.findFirst.mockResolvedValue({
      id: 'prop_1',
      orgId: 'org_1',
      status: 'PENDING_APPROVAL',
      proposerOperatorId: 'op_1',
    })

    await expect(
      approveDoctrineProposal({
        orgId: 'org_1',
        proposalId: 'prop_1',
        actorOperatorId: 'op_1',
      }),
    ).rejects.toMatchObject<Partial<DoctrineServiceError>>({
      code: 'DOCTRINE_TWO_PERSON_RULE_VIOLATION',
    })
  })

  it('activates a new doctrine version and invalidates cache on approval', async () => {
    tx.doctrineProposal.findFirst.mockResolvedValue({
      id: 'prop_2',
      orgId: 'org_1',
      status: 'PENDING_APPROVAL',
      proposerOperatorId: 'op_author',
      changeSummary: 'Raise water priority',
      justification: 'Drought posture',
      settings: { weights: { carbon: 40, water: 40, latency: 10, cost: 10 } },
    })
    tx.doctrineVersion.findFirst
      .mockResolvedValueOnce({ id: 'v1', versionNumber: 1 })
      .mockResolvedValueOnce({ versionNumber: 1 })
    tx.doctrineVersion.updateMany.mockResolvedValue({ count: 1 })
    tx.doctrineVersion.create.mockResolvedValue({
      id: 'v2',
      versionNumber: 2,
      status: 'ACTIVE',
      activatedAt: new Date('2026-04-14T00:00:00.000Z'),
      settings: { weights: { carbon: 40, water: 40, latency: 10, cost: 10 } },
    })
    tx.doctrineProposal.update.mockResolvedValue({
      id: 'prop_2',
      status: 'APPROVED',
    })
    tx.doctrineAuditEvent.create.mockResolvedValue({ id: 'audit_1' })

    const result = await approveDoctrineProposal({
      orgId: 'org_1',
      proposalId: 'prop_2',
      actorOperatorId: 'op_approver',
    })

    expect(result.version.versionNumber).toBe(2)
    expect(mockedRedisDel).toHaveBeenCalledWith('doctrine:active:org_1')
  })

  it('creates a new active version and invalidates cache on rollback', async () => {
    tx.doctrineVersion.findFirst
      .mockResolvedValueOnce({
        id: 'v2',
        orgId: 'org_1',
        versionNumber: 2,
        settings: { weights: { carbon: 35, water: 45, latency: 10, cost: 10 } },
      })
      .mockResolvedValueOnce({
        id: 'v3',
        orgId: 'org_1',
        versionNumber: 3,
      })
      .mockResolvedValueOnce({ versionNumber: 3 })
    tx.doctrineVersion.updateMany.mockResolvedValue({ count: 1 })
    tx.doctrineVersion.create.mockResolvedValue({
      id: 'v4',
      versionNumber: 4,
      status: 'ACTIVE',
      activatedAt: new Date('2026-04-14T00:00:00.000Z'),
    })
    tx.doctrineAuditEvent.create.mockResolvedValue({ id: 'audit_2' })

    const result = await rollbackDoctrineVersion({
      orgId: 'org_1',
      versionId: 'v2',
      actorOperatorId: 'op_admin',
      changeSummary: 'Rollback to known-good posture',
      justification: 'Active doctrine produced unacceptable deny rate',
    })

    expect(result.activated.versionNumber).toBe(4)
    expect(mockedRedisDel).toHaveBeenCalledWith('doctrine:active:org_1')
  })
})
