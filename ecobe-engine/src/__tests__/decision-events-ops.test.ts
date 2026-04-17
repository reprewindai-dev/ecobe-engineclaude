jest.mock('../lib/db')

import {
  getDecisionEventOutboxOperationalStatus,
  requeueRecoverableSystemDeadLetters,
} from '../lib/ci/decision-events'
import { prisma } from '../lib/db'

describe('decision event operational status', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reports active and total dead letters separately', async () => {
    ;(prisma.decisionEventOutbox.count as jest.Mock)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(17)
    ;(prisma.decisionEventOutbox.findFirst as jest.Mock).mockResolvedValue({
      createdAt: new Date('2026-04-17T15:00:00.000Z'),
    })

    const status = await getDecisionEventOutboxOperationalStatus()

    expect(status.pending).toBe(4)
    expect(status.processing).toBe(1)
    expect(status.failed).toBe(2)
    expect(status.deadLetter).toBe(3)
    expect(status.deadLetterActive).toBe(3)
    expect(status.deadLetterTotal).toBe(9)
    expect(status.sent).toBe(17)
    expect(status.oldestPendingCreatedAt?.toISOString()).toBe('2026-04-17T15:00:00.000Z')
  })

  it('requeues recoverable system-managed dead letters', async () => {
    ;(prisma.decisionEventOutbox.findMany as jest.Mock).mockResolvedValue([
      { id: 'dead-1' },
      { id: 'dead-2' },
    ])
    ;(prisma.decisionEventOutbox.updateMany as jest.Mock).mockResolvedValue({ count: 2 })

    const result = await requeueRecoverableSystemDeadLetters()

    expect(prisma.decisionEventOutbox.findMany).toHaveBeenCalled()
    expect(prisma.decisionEventOutbox.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['dead-1', 'dead-2'] },
        },
        data: expect.objectContaining({
          status: 'PENDING',
          attemptCount: 0,
          lastError: null,
          lastResponseCode: null,
          processedAt: null,
        }),
      })
    )
    expect(result).toEqual({ requeued: 2 })
  })
})
