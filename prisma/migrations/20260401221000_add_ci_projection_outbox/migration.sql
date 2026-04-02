DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'DecisionProjectionOutboxStatus'
  ) THEN
    CREATE TYPE "DecisionProjectionOutboxStatus" AS ENUM (
      'PENDING',
      'PROCESSING',
      'PROCESSED',
      'FAILED',
      'DEAD_LETTER'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'DecisionProjectionQualityStatus'
  ) THEN
    CREATE TYPE "DecisionProjectionQualityStatus" AS ENUM (
      'CLEAN',
      'SUSPECT',
      'INVALID'
    );
  END IF;
END $$;

ALTER TABLE "CIDecision"
  ADD COLUMN IF NOT EXISTS "baselineRegion" TEXT,
  ADD COLUMN IF NOT EXISTS "carbonSavingsRatio" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "estimatedKwh" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "lowConfidence" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "DashboardRoutingDecision"
  ADD COLUMN IF NOT EXISTS "projectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "projectionVersion" TEXT NOT NULL DEFAULT 'ci_projection_v1',
  ADD COLUMN IF NOT EXISTS "sourceCiDecisionId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceDecisionFrameId" TEXT,
  ADD COLUMN IF NOT EXISTS "lowConfidence" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "qualityStatus" "DecisionProjectionQualityStatus" NOT NULL DEFAULT 'SUSPECT',
  ADD COLUMN IF NOT EXISTS "qualityFlags" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS "DashboardRoutingDecision_sourceCiDecisionId_key"
  ON "DashboardRoutingDecision"("sourceCiDecisionId");

CREATE INDEX IF NOT EXISTS "DashboardRoutingDecision_projectedAt_idx"
  ON "DashboardRoutingDecision"("projectedAt");

CREATE TABLE IF NOT EXISTS "DecisionProjectionOutbox" (
  "id" TEXT NOT NULL,
  "sourceCiDecisionId" TEXT NOT NULL,
  "decisionFrameId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "DecisionProjectionOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DecisionProjectionOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DecisionProjectionOutbox_sourceCiDecisionId_fkey"
    FOREIGN KEY ("sourceCiDecisionId") REFERENCES "CIDecision"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DecisionProjectionOutbox_sourceCiDecisionId_key"
  ON "DecisionProjectionOutbox"("sourceCiDecisionId");

CREATE INDEX IF NOT EXISTS "DecisionProjectionOutbox_status_nextAttemptAt_createdAt_idx"
  ON "DecisionProjectionOutbox"("status", "nextAttemptAt", "createdAt");

CREATE INDEX IF NOT EXISTS "DecisionProjectionOutbox_decisionFrameId_createdAt_idx"
  ON "DecisionProjectionOutbox"("decisionFrameId", "createdAt");
