-- Medallion layer restoration
-- Creates the missing persistence tables required by forecast, intelligence,
-- and governance workers. Safe to run on existing databases.

DO $$
BEGIN
  CREATE TYPE "CarbonMeasurementSource" AS ENUM ('ESTIMATED', 'PROVIDER_REPORTED', 'METERED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PredictionQuality" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Region" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "typicalLatencyMs" INTEGER,
  "costPerKwh" DOUBLE PRECISION,
  "availableHardware" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "renewableCapacity" DOUBLE PRECISION,
  "avgCarbonIntensity" INTEGER,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "metadata" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Region_code_key" ON "Region"("code");
CREATE INDEX IF NOT EXISTS "Region_enabled_idx" ON "Region"("enabled");

CREATE TABLE IF NOT EXISTS "CarbonForecast" (
  "id" TEXT PRIMARY KEY,
  "region" TEXT NOT NULL,
  "forecastTime" TIMESTAMP(3) NOT NULL,
  "predictedIntensity" INTEGER NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "modelVersion" TEXT NOT NULL DEFAULT 'v1.0',
  "features" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "actualIntensity" INTEGER,
  "error" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CarbonForecast_region_forecastTime_key" ON "CarbonForecast"("region", "forecastTime");
CREATE INDEX IF NOT EXISTS "CarbonForecast_region_forecastTime_idx" ON "CarbonForecast"("region", "forecastTime");
CREATE INDEX IF NOT EXISTS "CarbonForecast_forecastTime_idx" ON "CarbonForecast"("forecastTime");

CREATE TABLE IF NOT EXISTS "WorkloadEmbeddingIndex" (
  "id" TEXT PRIMARY KEY,
  "commandId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "vectorId" TEXT,
  "workloadType" TEXT,
  "modelFamily" TEXT,
  "executionMode" TEXT,
  "gpuHoursBucket" TEXT,
  "gpuHours" DOUBLE PRECISION,
  "cpuHours" DOUBLE PRECISION,
  "memoryGb" DOUBLE PRECISION,
  "region" TEXT,
  "carbonIntensity" DOUBLE PRECISION,
  "emissionsKgCo2e" DOUBLE PRECISION,
  "savingsKgCo2e" DOUBLE PRECISION,
  "latencyMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkloadEmbeddingIndex_commandId_key" ON "WorkloadEmbeddingIndex"("commandId");
CREATE INDEX IF NOT EXISTS "WorkloadEmbeddingIndex_orgId_idx" ON "WorkloadEmbeddingIndex"("orgId");
CREATE INDEX IF NOT EXISTS "WorkloadEmbeddingIndex_workloadType_idx" ON "WorkloadEmbeddingIndex"("workloadType");
CREATE INDEX IF NOT EXISTS "WorkloadEmbeddingIndex_region_idx" ON "WorkloadEmbeddingIndex"("region");

CREATE TABLE IF NOT EXISTS "AdaptiveProfile" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "workloadType" TEXT,
  "modelFamily" TEXT,
  "region" TEXT,
  "weightModifiersJson" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "regionAdjustmentsJson" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "executionModeAdjustmentsJson" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "confidenceModifiersJson" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdaptiveProfile_orgId_workloadType_modelFamily_region_key"
  ON "AdaptiveProfile"("orgId", "workloadType", "modelFamily", "region");

CREATE TABLE IF NOT EXISTS "CarbonCommandOutcome" (
  "id" TEXT PRIMARY KEY,
  "commandId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "actualRegion" TEXT NOT NULL,
  "actualStartAt" TIMESTAMP(3) NOT NULL,
  "actualEndAt" TIMESTAMP(3),
  "actualLatencyMs" INTEGER,
  "actualGpuHours" DOUBLE PRECISION,
  "actualCpuHours" DOUBLE PRECISION,
  "actualMemoryGb" DOUBLE PRECISION,
  "actualCarbonIntensity" DOUBLE PRECISION,
  "actualEmissionsKgCo2e" DOUBLE PRECISION,
  "actualCostUsd" DOUBLE PRECISION,
  "costIndexObserved" DOUBLE PRECISION,
  "measurementSource" "CarbonMeasurementSource" NOT NULL DEFAULT 'ESTIMATED',
  "providerExecutionId" TEXT,
  "predictedEmissionsKgCo2e" DOUBLE PRECISION,
  "predictedLatencyMs" INTEGER,
  "predictedCostIndex" DOUBLE PRECISION,
  "actualBalancingAuthority" TEXT,
  "actualDemandRampPct" DOUBLE PRECISION,
  "actualCarbonSpikeProbability" DOUBLE PRECISION,
  "actualCurtailmentProbability" DOUBLE PRECISION,
  "actualImportCarbonLeakageScore" DOUBLE PRECISION,
  "emissionsVarianceKg" DOUBLE PRECISION,
  "emissionsVariancePct" DOUBLE PRECISION,
  "latencyVarianceMs" INTEGER,
  "latencyVariancePct" DOUBLE PRECISION,
  "costVariancePct" DOUBLE PRECISION,
  "regionMatch" BOOLEAN NOT NULL DEFAULT FALSE,
  "slaMet" BOOLEAN,
  "fallbackTriggered" BOOLEAN DEFAULT FALSE,
  "completed" BOOLEAN NOT NULL DEFAULT FALSE,
  "predictionQuality" "PredictionQuality" NOT NULL DEFAULT 'MEDIUM',
  "comparisonJson" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "learningSignals" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "metadata" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CarbonCommandOutcome_commandId_key" ON "CarbonCommandOutcome"("commandId");
CREATE UNIQUE INDEX IF NOT EXISTS "CarbonCommandOutcome_providerExecutionId_key" ON "CarbonCommandOutcome"("providerExecutionId");
CREATE INDEX IF NOT EXISTS "CarbonCommandOutcome_orgId_idx" ON "CarbonCommandOutcome"("orgId");
CREATE INDEX IF NOT EXISTS "CarbonCommandOutcome_actualRegion_idx" ON "CarbonCommandOutcome"("actualRegion");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WorkloadEmbeddingIndex_commandId_fkey'
  ) THEN
    ALTER TABLE "WorkloadEmbeddingIndex"
      ADD CONSTRAINT "WorkloadEmbeddingIndex_commandId_fkey"
      FOREIGN KEY ("commandId") REFERENCES "CarbonCommand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CarbonCommandOutcome_commandId_fkey'
  ) THEN
    ALTER TABLE "CarbonCommandOutcome"
      ADD CONSTRAINT "CarbonCommandOutcome_commandId_fkey"
      FOREIGN KEY ("commandId") REFERENCES "CarbonCommand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CarbonCommandOutcome_orgId_fkey'
  ) THEN
    ALTER TABLE "CarbonCommandOutcome"
      ADD CONSTRAINT "CarbonCommandOutcome_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
