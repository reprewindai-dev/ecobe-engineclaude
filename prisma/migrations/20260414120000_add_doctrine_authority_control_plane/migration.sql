CREATE TYPE "OperatorRole" AS ENUM ('VIEWER', 'OPERATOR', 'APPROVER', 'ADMIN');

CREATE TYPE "DoctrineProposalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

CREATE TYPE "DoctrineVersionStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'ROLLED_BACK');

CREATE TYPE "DoctrineAuditEventType" AS ENUM (
    'PROPOSAL_CREATED',
    'PROPOSAL_APPROVED',
    'PROPOSAL_REJECTED',
    'VERSION_ACTIVATED',
    'VERSION_ROLLED_BACK',
    'ROLE_UPDATED'
);

CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OperatorRole" NOT NULL,
    "keyHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DoctrineProposal" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" "DoctrineProposalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "changeSummary" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "effectiveAt" TIMESTAMP(3),
    "proposerOperatorId" TEXT NOT NULL,
    "approverOperatorId" TEXT,
    "rejectionReason" TEXT,
    "sourceIp" TEXT,
    "sourceUserAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctrineProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DoctrineVersion" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "DoctrineVersionStatus" NOT NULL DEFAULT 'ACTIVE',
    "changeSummary" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "sourceProposalId" TEXT,
    "proposedByOperatorId" TEXT,
    "approvedByOperatorId" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "rolledBackFromVersionId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctrineVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DoctrineAuditEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorOperatorId" TEXT,
    "eventType" "DoctrineAuditEventType" NOT NULL,
    "proposalId" TEXT,
    "versionId" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctrineAuditEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CIDecision"
ADD COLUMN "doctrineVersionId" TEXT,
ADD COLUMN "doctrineVersionNumber" INTEGER;

CREATE UNIQUE INDEX "org_operator_external" ON "Operator"("orgId", "externalId");

CREATE INDEX "Operator_orgId_role_active_idx" ON "Operator"("orgId", "role", "active");

CREATE INDEX "DoctrineProposal_orgId_status_createdAt_idx" ON "DoctrineProposal"("orgId", "status", "createdAt");

CREATE INDEX "DoctrineProposal_orgId_proposerOperatorId_createdAt_idx" ON "DoctrineProposal"("orgId", "proposerOperatorId", "createdAt");

CREATE UNIQUE INDEX "DoctrineVersion_sourceProposalId_key" ON "DoctrineVersion"("sourceProposalId");

CREATE UNIQUE INDEX "org_doctrine_version_number" ON "DoctrineVersion"("orgId", "versionNumber");
CREATE UNIQUE INDEX "DoctrineVersion_one_active_per_org" ON "DoctrineVersion"("orgId") WHERE "status" = 'ACTIVE';

CREATE INDEX "DoctrineVersion_orgId_status_createdAt_idx" ON "DoctrineVersion"("orgId", "status", "createdAt");

CREATE INDEX "DoctrineAuditEvent_orgId_createdAt_idx" ON "DoctrineAuditEvent"("orgId", "createdAt");

CREATE INDEX "DoctrineAuditEvent_orgId_eventType_createdAt_idx" ON "DoctrineAuditEvent"("orgId", "eventType", "createdAt");

CREATE INDEX "CIDecision_doctrineVersionId_idx" ON "CIDecision"("doctrineVersionId");

ALTER TABLE "Operator"
ADD CONSTRAINT "Operator_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DoctrineProposal"
ADD CONSTRAINT "DoctrineProposal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DoctrineProposal"
ADD CONSTRAINT "DoctrineProposal_proposerOperatorId_fkey" FOREIGN KEY ("proposerOperatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DoctrineProposal"
ADD CONSTRAINT "DoctrineProposal_approverOperatorId_fkey" FOREIGN KEY ("approverOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DoctrineVersion"
ADD CONSTRAINT "DoctrineVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DoctrineVersion"
ADD CONSTRAINT "DoctrineVersion_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "DoctrineProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DoctrineVersion"
ADD CONSTRAINT "DoctrineVersion_proposedByOperatorId_fkey" FOREIGN KEY ("proposedByOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DoctrineVersion"
ADD CONSTRAINT "DoctrineVersion_approvedByOperatorId_fkey" FOREIGN KEY ("approvedByOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DoctrineVersion"
ADD CONSTRAINT "DoctrineVersion_rolledBackFromVersionId_fkey" FOREIGN KEY ("rolledBackFromVersionId") REFERENCES "DoctrineVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DoctrineAuditEvent"
ADD CONSTRAINT "DoctrineAuditEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DoctrineAuditEvent"
ADD CONSTRAINT "DoctrineAuditEvent_actorOperatorId_fkey" FOREIGN KEY ("actorOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DoctrineAuditEvent"
ADD CONSTRAINT "DoctrineAuditEvent_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "DoctrineProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DoctrineAuditEvent"
ADD CONSTRAINT "DoctrineAuditEvent_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DoctrineVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CIDecision"
ADD CONSTRAINT "CIDecision_doctrineVersionId_fkey" FOREIGN KEY ("doctrineVersionId") REFERENCES "DoctrineVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
