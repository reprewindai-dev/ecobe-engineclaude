const mockStop = jest.fn()
const mockSchedule = jest.fn((_cron: string, handler: () => void) => {
  void handler()
  return { stop: mockStop }
})

jest.mock('node-cron', () => ({
  __esModule: true,
  default: {
    schedule: mockSchedule,
  },
  schedule: mockSchedule,
}))

const mockHset = jest.fn().mockResolvedValue(1)

jest.mock('../config/env', () => ({
  env: {
    QSTASH_TOKEN: undefined,
    QSTASH_BASE_URL: undefined,
    ECOBE_ENGINE_URL: undefined,
    INTELLIGENCE_ACCURACY_CRON: '*/30 * * * *',
    INTELLIGENCE_VECTOR_CLEANUP_CRON: '0 3 * * *',
    INTELLIGENCE_CALIBRATION_CRON: '15 * * * *',
  },
}))

jest.mock('../lib/redis', () => ({
  redis: {
    hset: mockHset,
    hgetall: jest.fn().mockResolvedValue({}),
  },
}))

const mockIntegrationSuccess = jest.fn()
const mockIntegrationFailure = jest.fn()

jest.mock('../lib/integration-metrics', () => ({
  recordIntegrationSuccess: mockIntegrationSuccess,
  recordIntegrationFailure: mockIntegrationFailure,
}))

const mockSetWorkerStatus = jest.fn()

jest.mock('../routes/system', () => ({
  setWorkerStatus: mockSetWorkerStatus,
}))

const mockRunAccuracy = jest.fn().mockResolvedValue({ organizations: 1 })
const mockRunCleanup = jest.fn().mockResolvedValue({ recordsRemoved: 2 })
const mockRunCalibration = jest.fn().mockResolvedValue({ profilesUpdated: 3 })

jest.mock('../workers/intelligence-jobs', () => ({
  runIntelligenceAccuracyJob: mockRunAccuracy,
  runVectorCleanupJob: mockRunCleanup,
  runModelCalibrationJob: mockRunCalibration,
}))

import { scheduleIntelligenceJobs, stopIntelligenceJobs } from '../workers/intelligence-scheduler'

describe('intelligence scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('falls back to local cron scheduling when qstash is unavailable', async () => {
    const result = await scheduleIntelligenceJobs()

    expect(result).toEqual({
      mode: 'local',
      scheduledCount: 3,
    })
    expect(mockSchedule).toHaveBeenCalledTimes(3)
    expect(mockRunAccuracy).toHaveBeenCalled()
    expect(mockRunCleanup).toHaveBeenCalled()
    expect(mockRunCalibration).toHaveBeenCalled()
    expect(mockSetWorkerStatus).toHaveBeenCalledWith(
      'intelligenceJobs',
      expect.objectContaining({
        running: true,
      })
    )
    expect(mockIntegrationSuccess).not.toHaveBeenCalled()
    expect(mockIntegrationFailure).not.toHaveBeenCalled()
  })

  it('stops local schedules cleanly', async () => {
    await scheduleIntelligenceJobs()
    stopIntelligenceJobs()

    expect(mockStop).toHaveBeenCalled()
    expect(mockSetWorkerStatus).toHaveBeenCalledWith(
      'intelligenceJobs',
      expect.objectContaining({
        running: false,
      })
    )
  })
})
