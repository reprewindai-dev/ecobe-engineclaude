jest.mock('../config/env', () => ({
  env: {
    JWT_SECRET: 'x'.repeat(32),
  },
}))

jest.mock('../lib/db', () => ({
  prisma: {
    operator: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}))

import jwt from 'jsonwebtoken'

import { prisma } from '../lib/db'
import { requireAuth, requireRole } from '../middleware/auth'

const mockedVerify = jwt.verify as jest.Mock
const mockedFindOperator = prisma.operator.findFirst as jest.Mock

function makeReq(headers: Record<string, string> = {}) {
  return {
    auth: undefined,
    header: (name: string) => headers[name.toLowerCase()] ?? null,
  } as any
}

function makeRes() {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

describe('doctrine auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects missing bearer token', async () => {
    const req = makeReq()
    const res = makeRes()
    const next = jest.fn()

    await requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects invalid bearer token', async () => {
    mockedVerify.mockImplementation(() => {
      throw new Error('bad token')
    })
    const req = makeReq({ authorization: 'Bearer bad-token' })
    const res = makeRes()
    const next = jest.fn()

    await requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects inactive operator', async () => {
    mockedVerify.mockReturnValue({
      sub: 'op_1',
      orgId: 'org_1',
      role: 'ADMIN',
      email: 'ops@co2router.com',
    })
    mockedFindOperator.mockResolvedValue({
      id: 'op_1',
      orgId: 'org_1',
      email: 'ops@co2router.com',
      externalId: 'legacy-op',
      role: 'ADMIN',
      active: false,
    })

    const req = makeReq({ authorization: 'Bearer valid-token' })
    const res = makeRes()
    const next = jest.fn()

    await requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches db-backed operator context on valid token', async () => {
    mockedVerify.mockReturnValue({
      sub: 'op_1',
      orgId: 'org_1',
      role: 'VIEWER',
      email: 'ops@co2router.com',
    })
    mockedFindOperator.mockResolvedValue({
      id: 'op_1',
      orgId: 'org_1',
      email: 'ops@co2router.com',
      externalId: 'legacy-op',
      role: 'APPROVER',
      active: true,
    })

    const req = makeReq({ authorization: 'Bearer valid-token' })
    const res = makeRes()
    const next = jest.fn()

    await requireAuth(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.auth).toMatchObject({
      operatorId: 'op_1',
      orgId: 'org_1',
      role: 'APPROVER',
    })
  })
})

describe('doctrine role middleware', () => {
  it('rejects when role is insufficient', () => {
    const req = { auth: { role: 'VIEWER' } } as any
    const res = makeRes()
    const next = jest.fn()
    const middleware = requireRole('ADMIN')

    middleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('allows when role is sufficient', () => {
    const req = { auth: { role: 'ADMIN' } } as any
    const res = makeRes()
    const next = jest.fn()
    const middleware = requireRole('APPROVER', 'ADMIN')

    middleware(req, res, next)

    expect(next).toHaveBeenCalled()
  })
})
