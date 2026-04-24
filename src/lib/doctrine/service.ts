import { Prisma } from "@prisma/client";
import type {
  DoctrineAuditEvent,
  DoctrineProposal,
  DoctrineVersion,
} from "@prisma/client/index";
import { prisma } from "../db";
import { redis } from "../redis";
import { env } from "../../config/env";
import {
  doctrineVersionLabel,
  normalizeDoctrineSettings,
  type DoctrineProposalPayload,
  type DoctrineSettings,
} from "./schema";
import {
  recordTelemetryMetric,
  telemetryMetricNames,
} from "../observability/telemetry";

const ACTIVE_DOCTRINE_CACHE_PREFIX = "doctrine:active";

export class DoctrineServiceError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function doctrineCacheKey(orgId: string) {
  return `${ACTIVE_DOCTRINE_CACHE_PREFIX}:${orgId}`;
}

function doctrineCacheTtlSec() {
  return Math.max(1, env.DOCTRINE_CACHE_TTL_SEC);
}

type ActiveDoctrineRecord = {
  orgId: string;
  versionId: string;
  versionNumber: number;
  version: string;
  status: "active";
  settings: DoctrineSettings;
  activatedAt: string;
  sourceProposalId: string | null;
};

function parseDoctrineSettings(raw: unknown): DoctrineSettings {
  try {
    return normalizeDoctrineSettings(raw);
  } catch (error) {
    const rawType =
      raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw;
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new DoctrineServiceError(
      `Invalid doctrine settings payload (${rawType}): ${detail}`,
      "DOCTRINE_SETTINGS_INVALID",
      503,
    );
  }
}

function parseCachedDoctrine(raw: string | null): ActiveDoctrineRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.orgId !== "string" ||
      typeof parsed?.versionId !== "string" ||
      typeof parsed?.versionNumber !== "number"
    ) {
      return null;
    }
    return {
      orgId: parsed.orgId,
      versionId: parsed.versionId,
      versionNumber: parsed.versionNumber,
      version: doctrineVersionLabel(parsed.versionNumber),
      status: "active",
      settings: parseDoctrineSettings(parsed.settings),
      activatedAt:
        typeof parsed.activatedAt === "string"
          ? parsed.activatedAt
          : new Date().toISOString(),
      sourceProposalId:
        typeof parsed.sourceProposalId === "string"
          ? parsed.sourceProposalId
          : null,
    };
  } catch {
    return null;
  }
}

export async function invalidateDoctrineCache(orgId: string) {
  try {
    await redis.del(doctrineCacheKey(orgId));
  } catch {
    // cache best-effort; DB is source of truth
  }
}

export async function getActiveDoctrine(orgId: string): Promise<ActiveDoctrineRecord | null> {
  const cacheKey = doctrineCacheKey(orgId);
  try {
    const cached = parseCachedDoctrine(await redis.get(cacheKey));
    if (cached) {
      recordTelemetryMetric(telemetryMetricNames.doctrineCacheHitCount, "counter", 1, {
        org_id: orgId,
      });
      return cached;
    }
    recordTelemetryMetric(telemetryMetricNames.doctrineCacheMissCount, "counter", 1, {
      org_id: orgId,
    });
  } catch {
    recordTelemetryMetric(telemetryMetricNames.doctrineCacheMissCount, "counter", 1, {
      org_id: orgId,
    });
  }

  const active = await prisma.doctrineVersion.findFirst({
    where: {
      orgId,
      status: "ACTIVE",
    },
    orderBy: {
      versionNumber: "desc",
    },
  });

  if (!active) return null;

  const record: ActiveDoctrineRecord = {
    orgId: active.orgId,
    versionId: active.id,
    versionNumber: active.versionNumber,
    version: doctrineVersionLabel(active.versionNumber),
    status: "active",
    settings: parseDoctrineSettings(active.settings),
    activatedAt: active.activatedAt.toISOString(),
    sourceProposalId: active.sourceProposalId ?? null,
  };

  try {
    await redis.set(
      cacheKey,
      JSON.stringify(record),
      "EX",
      doctrineCacheTtlSec(),
    );
  } catch {
    // cache best-effort
  }

  return record;
}

export async function requireActiveDoctrine(orgId: string): Promise<ActiveDoctrineRecord> {
  const active = await getActiveDoctrine(orgId);
  if (!active) {
    recordTelemetryMetric(
      telemetryMetricNames.doctrineLoadFailureCount,
      "counter",
      1,
      { org_id: orgId, reason: "missing_active_doctrine" },
    );
    throw new DoctrineServiceError(
      "No active doctrine version found for organization.",
      "DOCTRINE_ACTIVE_VERSION_NOT_FOUND",
      503,
    );
  }
  return active;
}

function pickClient(tx?: Prisma.TransactionClient) {
  return tx ?? prisma;
}

function toInputJson(
  value: Prisma.JsonValue,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

type AuditInput = {
  orgId: string;
  actorOperatorId?: string | null;
  eventType:
    | "PROPOSAL_CREATED"
    | "PROPOSAL_APPROVED"
    | "PROPOSAL_REJECTED"
    | "VERSION_ACTIVATED"
    | "VERSION_ROLLED_BACK"
    | "ROLE_UPDATED";
  proposalId?: string | null;
  versionId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  metadata?: Record<string, unknown>;
};

export async function recordDoctrineAuditEvent(
  input: AuditInput,
  tx?: Prisma.TransactionClient,
) {
  const db = pickClient(tx);
  return db.doctrineAuditEvent.create({
    data: {
      orgId: input.orgId,
      actorOperatorId: input.actorOperatorId ?? null,
      eventType: input.eventType,
      proposalId: input.proposalId ?? null,
      versionId: input.versionId ?? null,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      beforeJson:
        input.beforeJson !== undefined
          ? toInputJson(input.beforeJson as Prisma.JsonValue)
          : undefined,
      afterJson:
        input.afterJson !== undefined
          ? toInputJson(input.afterJson as Prisma.JsonValue)
          : undefined,
      metadata: toInputJson((input.metadata ?? {}) as Prisma.JsonValue),
    },
  });
}

export async function createDoctrineProposal(input: {
  orgId: string;
  actorOperatorId: string;
  payload: DoctrineProposalPayload;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const settings = normalizeDoctrineSettings(input.payload.settings);
  const effectiveAt = input.payload.effectiveAt
    ? new Date(input.payload.effectiveAt)
    : null;

  const proposal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.doctrineProposal.create({
      data: {
        orgId: input.orgId,
        proposerOperatorId: input.actorOperatorId,
        changeSummary: input.payload.changeSummary,
        justification: input.payload.justification,
        settings: settings as Prisma.InputJsonValue,
        effectiveAt,
        sourceIp: input.ipAddress ?? null,
        sourceUserAgent: input.userAgent ?? null,
        status: "PENDING_APPROVAL",
      },
    });

    await recordDoctrineAuditEvent(
      {
        orgId: input.orgId,
        actorOperatorId: input.actorOperatorId,
        eventType: "PROPOSAL_CREATED",
        proposalId: created.id,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        afterJson: {
          proposalId: created.id,
          status: created.status,
          settings,
          effectiveAt: created.effectiveAt?.toISOString() ?? null,
        },
      },
      tx,
    );

    return created;
  });

  recordTelemetryMetric(telemetryMetricNames.doctrineProposalCount, "counter", 1, {
    org_id: input.orgId,
  });

  return proposal;
}

async function nextDoctrineVersionNumber(
  orgId: string,
  tx: Prisma.TransactionClient,
) {
  const latest = await tx.doctrineVersion.findFirst({
    where: { orgId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return (latest?.versionNumber ?? 0) + 1;
}

async function acquireDoctrineOrgLock(
  tx: Prisma.TransactionClient,
  orgId: string,
) {
  if (typeof (tx as { $executeRaw?: unknown }).$executeRaw !== "function") {
    return;
  }
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`,
  );
}

export async function approveDoctrineProposal(input: {
  orgId: string;
  proposalId: string;
  actorOperatorId: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const startedAt = Date.now();
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await acquireDoctrineOrgLock(tx, input.orgId);

    const proposal = await tx.doctrineProposal.findFirst({
      where: {
        id: input.proposalId,
        orgId: input.orgId,
      },
    });

    if (!proposal) {
      throw new DoctrineServiceError(
        "Doctrine proposal not found.",
        "DOCTRINE_PROPOSAL_NOT_FOUND",
        404,
      );
    }
    if (proposal.status !== "PENDING_APPROVAL") {
      throw new DoctrineServiceError(
        "Doctrine proposal is not pending approval.",
        "DOCTRINE_PROPOSAL_NOT_PENDING",
        409,
      );
    }
    if (proposal.proposerOperatorId === input.actorOperatorId) {
      throw new DoctrineServiceError(
        "Proposer cannot approve their own doctrine proposal.",
        "DOCTRINE_TWO_PERSON_RULE_VIOLATION",
        403,
      );
    }

    const activeBefore = await tx.doctrineVersion.findFirst({
      where: { orgId: input.orgId, status: "ACTIVE" },
      orderBy: { versionNumber: "desc" },
    });

    if (activeBefore) {
      await tx.doctrineVersion.updateMany({
        where: { orgId: input.orgId, status: "ACTIVE" },
        data: {
          status: "SUPERSEDED",
          supersededAt: new Date(),
        },
      });
    }

    const versionNumber = await nextDoctrineVersionNumber(input.orgId, tx);
    const version = await tx.doctrineVersion.create({
      data: {
        orgId: input.orgId,
        versionNumber,
        status: "ACTIVE",
        changeSummary: proposal.changeSummary,
        justification: proposal.justification,
        settings: toInputJson(proposal.settings),
        sourceProposalId: proposal.id,
        proposedByOperatorId: proposal.proposerOperatorId,
        approvedByOperatorId: input.actorOperatorId,
        activatedAt: new Date(),
      },
    });

    const approvedProposal = await tx.doctrineProposal.update({
      where: { id: proposal.id },
      data: {
        status: "APPROVED",
        approverOperatorId: input.actorOperatorId,
      },
    });

    await recordDoctrineAuditEvent(
      {
        orgId: input.orgId,
        actorOperatorId: input.actorOperatorId,
        eventType: "PROPOSAL_APPROVED",
        proposalId: proposal.id,
        versionId: version.id,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        beforeJson: {
          status: proposal.status,
        },
        afterJson: {
          status: approvedProposal.status,
          versionId: version.id,
          versionNumber: version.versionNumber,
        },
      },
      tx,
    );

    await recordDoctrineAuditEvent(
      {
        orgId: input.orgId,
        actorOperatorId: input.actorOperatorId,
        eventType: "VERSION_ACTIVATED",
        proposalId: proposal.id,
        versionId: version.id,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        beforeJson: activeBefore
          ? {
              versionId: activeBefore.id,
              versionNumber: activeBefore.versionNumber,
            }
          : null,
        afterJson: {
          versionId: version.id,
          versionNumber: version.versionNumber,
          settings: version.settings,
        },
      },
      tx,
    );

    return {
      proposal: approvedProposal,
      version,
      previousActiveVersion: activeBefore,
    };
  });

  await invalidateDoctrineCache(input.orgId);
  recordTelemetryMetric(telemetryMetricNames.doctrineApprovalLatencyMs, "histogram", Date.now() - startedAt, {
    org_id: input.orgId,
  });
  return result;
}

export async function rejectDoctrineProposal(input: {
  orgId: string;
  proposalId: string;
  actorOperatorId: string;
  reason: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const proposal = await tx.doctrineProposal.findFirst({
      where: { id: input.proposalId, orgId: input.orgId },
    });
    if (!proposal) {
      throw new DoctrineServiceError(
        "Doctrine proposal not found.",
        "DOCTRINE_PROPOSAL_NOT_FOUND",
        404,
      );
    }
    if (proposal.status !== "PENDING_APPROVAL") {
      throw new DoctrineServiceError(
        "Doctrine proposal is not pending approval.",
        "DOCTRINE_PROPOSAL_NOT_PENDING",
        409,
      );
    }

    const next = await tx.doctrineProposal.update({
      where: { id: proposal.id },
      data: {
        status: "REJECTED",
        approverOperatorId: input.actorOperatorId,
        rejectionReason: input.reason,
      },
    });

    await recordDoctrineAuditEvent(
      {
        orgId: input.orgId,
        actorOperatorId: input.actorOperatorId,
        eventType: "PROPOSAL_REJECTED",
        proposalId: next.id,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        beforeJson: {
          status: proposal.status,
        },
        afterJson: {
          status: next.status,
          reason: input.reason,
        },
      },
      tx,
    );

    return next;
  });

  await invalidateDoctrineCache(input.orgId);
  recordTelemetryMetric(telemetryMetricNames.doctrineRejectCount, "counter", 1, {
    org_id: input.orgId,
  });
  return updated;
}

export async function rollbackDoctrineVersion(input: {
  orgId: string;
  versionId: string;
  actorOperatorId: string;
  changeSummary: string;
  justification: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await acquireDoctrineOrgLock(tx, input.orgId);

    const target = await tx.doctrineVersion.findFirst({
      where: {
        id: input.versionId,
        orgId: input.orgId,
      },
    });

    if (!target) {
      throw new DoctrineServiceError(
        "Doctrine version not found.",
        "DOCTRINE_VERSION_NOT_FOUND",
        404,
      );
    }

    const currentActive = await tx.doctrineVersion.findFirst({
      where: { orgId: input.orgId, status: "ACTIVE" },
      orderBy: { versionNumber: "desc" },
    });
    if (currentActive) {
      await tx.doctrineVersion.updateMany({
        where: { orgId: input.orgId, status: "ACTIVE" },
        data: {
          status: "SUPERSEDED",
          supersededAt: new Date(),
        },
      });
    }

    const versionNumber = await nextDoctrineVersionNumber(input.orgId, tx);
    const activated = await tx.doctrineVersion.create({
      data: {
        orgId: input.orgId,
        versionNumber,
        status: "ACTIVE",
        changeSummary: input.changeSummary,
        justification: input.justification,
        settings: toInputJson(target.settings),
        proposedByOperatorId: input.actorOperatorId,
        approvedByOperatorId: input.actorOperatorId,
        activatedAt: new Date(),
        rolledBackFromVersionId: target.id,
      },
    });

    await recordDoctrineAuditEvent(
      {
        orgId: input.orgId,
        actorOperatorId: input.actorOperatorId,
        eventType: "VERSION_ROLLED_BACK",
        versionId: activated.id,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        beforeJson: {
          activeVersionId: currentActive?.id ?? null,
          activeVersionNumber: currentActive?.versionNumber ?? null,
        },
        afterJson: {
          versionId: activated.id,
          versionNumber: activated.versionNumber,
          rolledBackFromVersionId: target.id,
          rolledBackFromVersionNumber: target.versionNumber,
        },
      },
      tx,
    );

    return {
      activated,
      target,
      previousActiveVersion: currentActive,
    };
  });

  await invalidateDoctrineCache(input.orgId);
  recordTelemetryMetric(telemetryMetricNames.doctrineRollbackCount, "counter", 1, {
    org_id: input.orgId,
  });
  return result;
}

export async function getDoctrineHistory(input: {
  orgId: string;
  limit: number;
  offset: number;
}) {
  const [versions, proposals, auditEvents] = await Promise.all([
    prisma.doctrineVersion.findMany({
      where: { orgId: input.orgId },
      orderBy: { createdAt: "desc" },
      skip: input.offset,
      take: input.limit,
      include: {
        sourceProposal: true,
      },
    }),
    prisma.doctrineProposal.findMany({
      where: { orgId: input.orgId },
      orderBy: { createdAt: "desc" },
      skip: input.offset,
      take: input.limit,
    }),
    prisma.doctrineAuditEvent.findMany({
      where: { orgId: input.orgId },
      orderBy: { createdAt: "desc" },
      skip: input.offset,
      take: input.limit,
    }),
  ]);

  return {
    versions: versions.map((version: DoctrineVersion) => ({
      id: version.id,
      orgId: version.orgId,
      versionNumber: version.versionNumber,
      version: doctrineVersionLabel(version.versionNumber),
      status: version.status.toLowerCase(),
      changeSummary: version.changeSummary,
      justification: version.justification,
      settings: parseDoctrineSettings(version.settings),
      activatedAt: version.activatedAt.toISOString(),
      supersededAt: version.supersededAt?.toISOString() ?? null,
      rolledBackFromVersionId: version.rolledBackFromVersionId ?? null,
      sourceProposalId: version.sourceProposalId ?? null,
      createdAt: version.createdAt.toISOString(),
    })),
    proposals: proposals.map((proposal: DoctrineProposal) => ({
      id: proposal.id,
      status: proposal.status.toLowerCase(),
      changeSummary: proposal.changeSummary,
      justification: proposal.justification,
      settings: parseDoctrineSettings(proposal.settings),
      proposerOperatorId: proposal.proposerOperatorId,
      approverOperatorId: proposal.approverOperatorId,
      rejectionReason: proposal.rejectionReason,
      effectiveAt: proposal.effectiveAt?.toISOString() ?? null,
      createdAt: proposal.createdAt.toISOString(),
      updatedAt: proposal.updatedAt.toISOString(),
    })),
    auditEvents: auditEvents.map((event: DoctrineAuditEvent) => ({
      id: event.id,
      eventType: event.eventType,
      actorOperatorId: event.actorOperatorId,
      proposalId: event.proposalId,
      versionId: event.versionId,
      requestId: event.requestId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      beforeJson: event.beforeJson,
      afterJson: event.afterJson,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

let defaultOrgCache: { value: string | null; expiresAt: number } | null = null;

export async function resolveFallbackOrgId() {
  if (env.DOCTRINE_DEFAULT_ORG_ID) {
    return env.DOCTRINE_DEFAULT_ORG_ID;
  }
  if (defaultOrgCache && defaultOrgCache.expiresAt > Date.now()) {
    return defaultOrgCache.value;
  }
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const value = org?.id ?? null;
  defaultOrgCache = {
    value,
    expiresAt: Date.now() + 60_000,
  };
  return value;
}
