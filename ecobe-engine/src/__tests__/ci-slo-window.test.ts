import { selectPersistedLatencyWindow } from '../routes/ci'

describe('selectPersistedLatencyWindow', () => {
  it('ignores persisted latency samples from before the current process boot', () => {
    const bootedAt = new Date('2026-04-12T10:00:00.000Z')

    const window = selectPersistedLatencyWindow(
      [
        {
          createdAt: new Date('2026-04-12T09:59:59.000Z'),
          totalMs: 900,
          computeMs: 850,
        },
        {
          createdAt: new Date('2026-04-12T09:40:00.000Z'),
          totalMs: 700,
          computeMs: 650,
        },
      ],
      bootedAt
    )

    expect(window).toEqual({
      totalMs: [],
      computeMs: [],
      sampleCount: 0,
      windowStart: null,
      windowEnd: null,
      selection: 'recent_history',
    })
  })

  it('uses the latest post-boot active window when current-process samples exist', () => {
    const bootedAt = new Date('2026-04-12T10:00:00.000Z')

    const window = selectPersistedLatencyWindow(
      [
        {
          createdAt: new Date('2026-04-12T10:06:00.000Z'),
          totalMs: 22,
          computeMs: 18,
        },
        {
          createdAt: new Date('2026-04-12T10:03:00.000Z'),
          totalMs: 35,
          computeMs: 27,
        },
        {
          createdAt: new Date('2026-04-12T09:58:00.000Z'),
          totalMs: 850,
          computeMs: 810,
        },
      ],
      bootedAt
    )

    expect(window).toEqual({
      totalMs: [35, 22],
      computeMs: [27, 18],
      sampleCount: 2,
      windowStart: '2026-04-12T10:03:00.000Z',
      windowEnd: '2026-04-12T10:06:00.000Z',
      selection: 'latest_active_window',
    })
  })
})
