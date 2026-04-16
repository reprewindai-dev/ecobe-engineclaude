import { Router, type Request, type Response } from "express";
import { z } from "zod";

import {
  DoctrineServiceError,
  approveDoctrineProposal,
  createDoctrineProposal,
  getDoctrineHistory,
  rejectDoctrineProposal,
  requireActiveDoctrine,
  rollbackDoctrineVersion,
} from "../lib/doctrine/service";
import {
  DoctrineProposalPayloadSchema,
  DoctrineRejectPayloadSchema,
} from "../lib/doctrine/schema";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

function requestContext(req: Request) {
  return {
    requestId:
      typeof req.header("x-request-id") === "string"
        ? req.header("x-request-id")
        : null,
    ipAddress: req.ip ?? null,
    userAgent: req.header("user-agent") ?? null,
  };
}

function parsePagination(req: Request) {
  const limitRaw = Number(req.query.limit ?? 20);
  const offsetRaw = Number(req.query.offset ?? 0);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(100, Math.trunc(limitRaw)))
    : 20;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.trunc(offsetRaw)) : 0;
  return { limit, offset };
}

function handleDoctrineError(res: Response, error: unknown) {
  if (error instanceof DoctrineServiceError) {
    return res.status(error.status).json({
      error: error.message,
      code: error.code,
    });
  }
  return res.status(500).json({
    error: error instanceof Error ? error.message : "Unknown doctrine error",
    code: "DOCTRINE_INTERNAL_ERROR",
  });
}

const rollbackPayloadSchema = z.object({
  changeSummary: z.string().min(6).max(280),
  justification: z.string().min(12).max(2000),
});

router.get("/active", requireAuth, async (req, res) => {
  try {
    const active = await requireActiveDoctrine(req.auth!.orgId);
    return res.json({
      ok: true,
      doctrine: active,
    });
  } catch (error) {
    return handleDoctrineError(res, error);
  }
});

router.get("/history", requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req);
    const history = await getDoctrineHistory({
      orgId: req.auth!.orgId,
      limit,
      offset,
    });
    return res.json({
      ok: true,
      ...history,
      pagination: {
        limit,
        offset,
      },
    });
  } catch (error) {
    return handleDoctrineError(res, error);
  }
});

router.post(
  "/proposals",
  requireAuth,
  requireRole("OPERATOR", "APPROVER", "ADMIN"),
  async (req, res) => {
    try {
      const payload = DoctrineProposalPayloadSchema.parse(req.body ?? {});
      const context = requestContext(req);
      const proposal = await createDoctrineProposal({
        orgId: req.auth!.orgId,
        actorOperatorId: req.auth!.operatorId,
        payload,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return res.status(201).json({
        ok: true,
        proposal: {
          id: proposal.id,
          status: proposal.status.toLowerCase(),
          changeSummary: proposal.changeSummary,
          justification: proposal.justification,
          settings: payload.settings,
          effectiveAt: proposal.effectiveAt?.toISOString() ?? null,
          createdAt: proposal.createdAt.toISOString(),
        },
      });
    } catch (error) {
      return handleDoctrineError(res, error);
    }
  },
);

router.post(
  "/proposals/:id/approve",
  requireAuth,
  requireRole("APPROVER", "ADMIN"),
  async (req, res) => {
    try {
      const context = requestContext(req);
      const approved = await approveDoctrineProposal({
        orgId: req.auth!.orgId,
        proposalId: req.params.id,
        actorOperatorId: req.auth!.operatorId,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return res.json({
        ok: true,
        proposal: {
          id: approved.proposal.id,
          status: approved.proposal.status.toLowerCase(),
        },
        activatedVersion: {
          id: approved.version.id,
          versionNumber: approved.version.versionNumber,
          status: approved.version.status.toLowerCase(),
          activatedAt: approved.version.activatedAt.toISOString(),
        },
      });
    } catch (error) {
      return handleDoctrineError(res, error);
    }
  },
);

router.post(
  "/proposals/:id/reject",
  requireAuth,
  requireRole("APPROVER", "ADMIN"),
  async (req, res) => {
    try {
      const body = DoctrineRejectPayloadSchema.parse(req.body ?? {});
      const context = requestContext(req);
      const rejected = await rejectDoctrineProposal({
        orgId: req.auth!.orgId,
        proposalId: req.params.id,
        actorOperatorId: req.auth!.operatorId,
        reason: body.reason,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return res.json({
        ok: true,
        proposal: {
          id: rejected.id,
          status: rejected.status.toLowerCase(),
          rejectionReason: rejected.rejectionReason,
        },
      });
    } catch (error) {
      return handleDoctrineError(res, error);
    }
  },
);

router.post(
  "/versions/:id/rollback",
  requireAuth,
  requireRole("ADMIN"),
  async (req, res) => {
    try {
      const body = rollbackPayloadSchema.parse(req.body ?? {});
      const context = requestContext(req);
      const rolledBack = await rollbackDoctrineVersion({
        orgId: req.auth!.orgId,
        versionId: req.params.id,
        actorOperatorId: req.auth!.operatorId,
        changeSummary: body.changeSummary,
        justification: body.justification,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return res.status(201).json({
        ok: true,
        activatedVersion: {
          id: rolledBack.activated.id,
          versionNumber: rolledBack.activated.versionNumber,
          status: rolledBack.activated.status.toLowerCase(),
          rolledBackFromVersionId: rolledBack.target.id,
          rolledBackFromVersionNumber: rolledBack.target.versionNumber,
        },
      });
    } catch (error) {
      return handleDoctrineError(res, error);
    }
  },
);

export default router;
