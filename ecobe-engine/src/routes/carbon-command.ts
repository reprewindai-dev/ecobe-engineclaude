import { Router } from 'express'
import { z } from 'zod'
import { processCarbonCommand, CarbonCommandError } from '../lib/carbon-command'
import { processCarbonOutcome, CarbonOutcomeError } from '../lib/carbon-outcome'

const router = Router()

const priorityEnum = z.enum(['low', 'medium', 'high']).default('medium')
const executionModeEnum = z.enum(['immediate', 'scheduled', 'advisory']).default('immediate')

const payloadSchema = z.object({
  orgId: z.string().min(1, 'orgId is required'),
  workload: z
    .object({
      type: z.string().min(1, 'workload.type is required'),
      modelFamily: z.string().optional(),
      estimatedGpuHours: z.number().nonnegative().optional(),
      estimatedCpuHours: z.number().nonnegative().optional(),
      estimatedMemoryGb: z.number().positive().optional(),
    })
    .refine((value) => typeof value.estimatedGpuHours === 'number' || typeof value.estimatedCpuHours === 'number', {
      message: 'Provide estimatedGpuHours and/or estimatedCpuHours to produce a decision',
      path: ['estimatedGpuHours'],
    }),
  constraints: z
    .object({
      maxLatencyMs: z.number().positive().optional(),
      deadlineAt: z.string().datetime().optional(),
      mustRunRegions: z.array(z.string()).max(20).optional(),
      excludedRegions: z.array(z.string()).max(20).optional(),
      carbonPriority: priorityEnum.optional(),
      costPriority: priorityEnum.optional(),
      latencyPriority: priorityEnum.optional(),
    })
    .refine((value) => value.maxLatencyMs !== undefined || value.deadlineAt !== undefined, {
      message: 'Provide at least maxLatencyMs or deadlineAt to avoid vague requests',
      path: ['maxLatencyMs'],
    }),
  execution: z
    .object({
      mode: executionModeEnum.optional(),
      candidateStartWindowHours: z.number().int().positive().max(168).optional(),
    })
    .optional(),
  preferences: z
    .object({
      allowTimeShifting: z.boolean().optional(),
      allowCrossRegionExecution: z.boolean().optional(),
      requireCreditCoverage: z.boolean().optional(),
    })
    .optional(),
  metadata: z.record(z.any()).optional(),
})

const measurementSourceEnum = z.enum(['estimated', 'provider-reported', 'metered'])

const outcomeSchema = z.object({
  commandId: z.string().min(1, 'commandId is required'),
  orgId: z.string().min(1, 'orgId is required'),
  execution: z
    .object({
      actualRegion: z.string().min(1, 'execution.actualRegion is required'),
      actualStartAt: z.string().datetime('execution.actualStartAt must be an ISO timestamp'),
      actualEndAt: z.string().datetime().optional(),
      actualLatencyMs: z.number().nonnegative().optional(),
      actualGpuHours: z.number().nonnegative().optional(),
      actualCpuHours: z.number().nonnegative().optional(),
      actualMemoryGb: z.number().nonnegative().optional(),
    })
    .refine((value) => value.actualEndAt || value.actualGpuHours !== undefined || value.actualCpuHours !== undefined, {
      message: 'Provide execution.actualEndAt or actual workload hours to derive duration',
      path: ['actualEndAt'],
    }),
  emissions: z
    .object({
      actualCarbonIntensity: z.number().nonnegative().optional(),
      actualEmissionsKgCo2e: z.number().nonnegative().optional(),
      measurementSource: measurementSourceEnum.optional(),
    })
    .optional(),
  cost: z
    .object({
      actualCostUsd: z.number().nonnegative().optional(),
      costIndexObserved: z.number().nonnegative().optional(),
    })
    .optional(),
  status: z.object({
    completed: z.boolean(),
    slaMet: z.boolean().optional(),
    fallbackTriggered: z.boolean().optional(),
  }),
  metadata: z.record(z.any()).optional(),
})

router.post('/command', async (req, res) => {
  try {
    const payload = payloadSchema.parse(req.body)
    const recommendation = await processCarbonCommand(payload)
    return res.status(201).json({ success: true, ...recommendation })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request validation failed',
          details: error.errors,
        },
      })
    }

    if (error instanceof CarbonCommandError) {
      const status = error.code === 'NO_ELIGIBLE_CANDIDATES' ? 422 : 400
      return res.status(status).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      })
    }

    console.error('Carbon command error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Internal server error',
      },
    })
  }
})

router.post('/outcome', async (req, res) => {
  try {
    const payload = outcomeSchema.parse(req.body)
    const result = await processCarbonOutcome(payload)
    return res.status(201).json({ success: true, ...result })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request validation failed',
          details: error.errors,
        },
      })
    }

    if (error instanceof CarbonOutcomeError) {
      let status = 400
      if (error.code === 'COMMAND_NOT_FOUND') status = 404
      if (error.code === 'OUTCOME_ALREADY_EXISTS') status = 409
      return res.status(status).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      })
    }

    console.error('Carbon outcome error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Internal server error',
      },
    })
  }
})

export default router
