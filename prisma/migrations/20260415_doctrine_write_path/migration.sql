-- CreateEnum
CREATE TYPE "DoctrineProposalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'ROLLED_BACK');

-- CreateTable: OperatorIdentity
CREATE TABLE "OperatorIdentity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OperatorIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OperatorIdentity_email_key" ON "OperatorIdentity"("email");
CREATE UNIQUE INDEX "OperatorIdentity_keyHash_key" ON "OperatorIdentity"("keyHash");
CREATE INDEX "OperatorIdentity_orgId_idx" ON "OperatorIdentity"("orgId");

-- CreateTable: DoctrineProposal
CREATE TABLE "DoctrineProposal" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "rejectedById" TEXT,
    "status" "DoctrineProposalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "carbonThreshold" DOUBLE PRECISION,
    "waterThreshold" DOUBLE PRECISION,
    "latencyBudget" DOUBLE PRECISION,
    "costCeiling" DOUBLE PRECISION,
    "mode" TEXT NOT NULL DEFAULT 'balanced',
    "justification" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DoctrineProposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DoctrineProposal_orgId_status_idx" ON "DoctrineProposal"("orgId", "status");
CREATE INDEX "DoctrineProposal_proposedById_idx" ON "DoctrineProposal"("proposedById");

-- CreateTable: DoctrineVersion
CREATE TABLE "DoctrineVersion" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "carbonThreshold" DOUBLE PRECISION,
    "waterThreshold" DOUBLE PRECISION,
    "latencyBudget" DOUBLE PRECISION,
    "costCeiling" DOUBLE PRECISION,
    "mode" TEXT NOT NULL DEFAULT 'balanced',
    "justification" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DoctrineVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DoctrineVersion_proposalId_key" ON "DoctrineVersion"("proposalId");
CREATE INDEX "DoctrineVersion_orgId_status_idx" ON "DoctrineVersion"("orgId", "status");
CREATE INDEX "DoctrineVersion_activatedAt_idx" ON "DoctrineVersion"("activatedAt");

-- Add doctrineVersionId to CIDecision for per-decision traceability
ALTER TABLE "CIDecision" ADD COLUMN "doctrineVersionId" TEXT;
