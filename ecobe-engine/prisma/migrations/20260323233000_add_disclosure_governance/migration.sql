CREATE TYPE "CarbonBudgetPeriod" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE "CarbonBudgetStatus" AS ENUM ('ACTIVE', 'PAUSED');

CREATE TABLE "CarbonBudgetPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workloadType" TEXT,
    "budgetPeriod" "CarbonBudgetPeriod" NOT NULL DEFAULT 'MONTHLY',
    "maxCarbonKgCo2e" DOUBLE PRECISION NOT NULL,
    "targetReductionPct" DOUBLE PRECISION,
    "targetLowerHalfSharePct" DOUBLE PRECISION,
    "hardEnforcement" BOOLEAN NOT NULL DEFAULT false,
    "policyMode" TEXT NOT NULL DEFAULT 'sec_disclosure_strict',
    "status" "CarbonBudgetStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarbonBudgetPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DisclosureExportBatch" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "orgId" TEXT,
    "scope" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "routingMode" TEXT NOT NULL,
    "policyMode" TEXT,
    "recordCount" INTEGER NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "digestAlgorithm" TEXT NOT NULL DEFAULT 'sha256',
    "signature" TEXT,
    "signatureAlgorithm" TEXT,
    "fromTs" TIMESTAMP(3) NOT NULL,
    "toTs" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisclosureExportBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CarbonLedgerEntry"
  ADD COLUMN "routingMode" TEXT NOT NULL DEFAULT 'optimize',
  ADD COLUMN "policyMode" TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN "signalTypeUsed" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "confidenceLabel" TEXT,
  ADD COLUMN "referenceTime" TIMESTAMP(3),
  ADD COLUMN "dataFreshnessSeconds" INTEGER,
  ADD COLUMN "confidenceBandLow" DOUBLE PRECISION,
  ADD COLUMN "confidenceBandMid" DOUBLE PRECISION,
  ADD COLUMN "confidenceBandHigh" DOUBLE PRECISION,
  ADD COLUMN "lowerHalfBenchmarkGPerKwh" DOUBLE PRECISION,
  ADD COLUMN "lowerHalfQualified" BOOLEAN,
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX "CarbonBudgetPolicy_orgId_name_key" ON "CarbonBudgetPolicy"("orgId", "name");
CREATE INDEX "CarbonBudgetPolicy_orgId_status_idx" ON "CarbonBudgetPolicy"("orgId", "status");
CREATE INDEX "CarbonBudgetPolicy_orgId_workloadType_status_idx" ON "CarbonBudgetPolicy"("orgId", "workloadType", "status");

CREATE UNIQUE INDEX "DisclosureExportBatch_batchId_key" ON "DisclosureExportBatch"("batchId");
CREATE INDEX "DisclosureExportBatch_orgId_createdAt_idx" ON "DisclosureExportBatch"("orgId", "createdAt");
CREATE INDEX "DisclosureExportBatch_scope_createdAt_idx" ON "DisclosureExportBatch"("scope", "createdAt");

CREATE INDEX "CarbonLedgerEntry_orgId_workloadType_createdAt_idx" ON "CarbonLedgerEntry"("orgId", "workloadType", "createdAt");
CREATE INDEX "CarbonLedgerEntry_routingMode_policyMode_createdAt_idx" ON "CarbonLedgerEntry"("routingMode", "policyMode", "createdAt");

ALTER TABLE "CarbonBudgetPolicy"
  ADD CONSTRAINT "CarbonBudgetPolicy_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DisclosureExportBatch"
  ADD CONSTRAINT "DisclosureExportBatch_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
