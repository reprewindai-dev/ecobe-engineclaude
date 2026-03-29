import express from 'express'

import { internalServiceGuard } from '../middleware/internal-auth'
import { evaluateInternalSekedPolicy } from '../lib/policy/seked-internal'
import { SekedPolicyAdapterRequestSchema } from '../lib/policy/seked-policy-adapter'

const router = express.Router()

router.post('/policy/seked/evaluate', internalServiceGuard, (req, res) => {
  const parsed = SekedPolicyAdapterRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid SEKED policy evaluation request',
      code: 'INVALID_SEKED_POLICY_REQUEST',
      issues: parsed.error.flatten(),
    })
  }

  const result = evaluateInternalSekedPolicy(parsed.data)
  return res.status(200).json(result)
})

export default router
