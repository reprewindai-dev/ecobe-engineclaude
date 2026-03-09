-- Phase 2B: Carbon Budget / Quota Tracking
-- Adds CarbonBudget table for per-organization CO2 quota tracking.
-- consumedCO2Grams is atomically incremented via Prisma update after each routing decision.

CREATE TABLE "CarbonBudget" (
  "id"                  TEXT         NOT NULL,
  "organizationId"      TEXT         NOT NULL,
  "budgetPeriod"        TEXT         NOT NULL,
  "periodStart"         TIMESTAMP(3) NOT NULL,
  "periodEnd"           TIMESTAMP(3) NOT NULL,
  "budgetCO2Grams"      DOUBLE PRECISION NOT NULL,
  "consumedCO2Grams"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "warningThresholdPct" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CarbonBudget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CarbonBudget_organizationId_periodEnd_idx" ON "CarbonBudget"("organizationId", "periodEnd");
CREATE INDEX "CarbonBudget_periodEnd_idx" ON "CarbonBudget"("periodEnd");
