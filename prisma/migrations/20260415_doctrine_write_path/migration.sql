-- ============================================================================
-- DOCTRINE WRITE PATH — OPERATOR IDENTITY + PROPOSALS + VERSIONED DOCTRINE
-- ============================================================================

CREATE TYPE "OperatorRole" AS ENUM ('viewer', 'operator', 'admin');
CREATE TYPE "DoctrineProposalStatus" AS ENUM ('pending_approval', 'approved', 'rejected', 'superseded', 'rolled_back');

-- Operator identity (one row per operator key)
CREATE TABLE "OperatorIdentity" (
  "id"         TEXT NOT NULL,
  "orgId"      TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "keyHash"    TEXT NOT NULL,
  "role"       "OperatorRole" NOT NULL DEFAULT 'operator',
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "metadata"   JSONB NOT NULL DEFAULT '{}',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperatorIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OperatorIdentity_keyHash_key" ON "OperatorIdentity"("keyHash");
CREATE INDEX "OperatorIdentity_orgId_idx" ON "OperatorIdentity"("orgId");

-- Doctrine proposals (immutable once created)
CREATE TABLE "DoctrineProposal" (
  "id"              TEXT NOT NULL,
  "proposedById"    TEXT NOT NULL,
  "orgId"           TEXT NOT NULL,
  "carbonThreshold" DOUBLE PRECISION,
  "waterThreshold"  DOUBLE PRECISION,
  "latencyBudget"   DOUBLE PRECISION,
  "costCeiling"     DOUBLE PRECISION,
  "mode"            TEXT NOT NULL DEFAULT 'balanced',
  "justification"   TEXT NOT NULL,
  "status"          "DoctrineProposalStatus" NOT NULL DEFAULT 'pending_approval',
  "approvedById"    TEXT,
  "rejectedById"    TEXT,
  "rejectionReason" TEXT,
  "effectiveAt"     TIMESTAMP(3),
  "metadata"        JSONB NOT NULL DEFAULT '{}',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DoctrineProposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DoctrineProposal_orgId_status_idx" ON "DoctrineProposal"("orgId", "status");
CREATE INDEX "DoctrineProposal_createdAt_idx" ON "DoctrineProposal"("createdAt");

-- Active versioned doctrine (append-only — never delete, only supersede)
CREATE TABLE "DoctrineVersion" (
  "id"              TEXT NOT NULL,
  "proposalId"      TEXT NOT NULL,
  "orgId"           TEXT NOT NULL,
  "proposedById"    TEXT NOT NULL,
  "approvedById"    TEXT NOT NULL,
  "carbonThreshold" DOUBLE PRECISION,
  "waterThreshold"  DOUBLE PRECISION,
  "latencyBudget"   DOUBLE PRECISION,
  "costCeiling"     DOUBLE PRECISION,
  "mode"            TEXT NOT NULL DEFAULT 'balanced',
  "justification"   TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'active',
  "activatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supersededAt"    TIMESTAMP(3),
  "metadata"        JSONB NOT NULL DEFAULT '{}',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DoctrineVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DoctrineVersion_proposalId_key" ON "DoctrineVersion"("proposalId");
CREATE INDEX "DoctrineVersion_orgId_status_idx" ON "DoctrineVersion"("orgId", "status");
CREATE INDEX "DoctrineVersion_activatedAt_idx" ON "DoctrineVersion"("activatedAt");
