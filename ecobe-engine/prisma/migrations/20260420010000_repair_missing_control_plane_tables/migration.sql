-- Repair missing control-plane tables required by the production control plane.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
    CREATE TYPE "CarbonCommandMode" AS ENUM ('IMMEDIATE', 'SCHEDULED', 'ADVISORY');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "CarbonCommandStatus" AS ENUM ('PENDING', 'RECOMMENDED', 'EXECUTED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "CarbonMeasurementSource" AS ENUM ('ESTIMATED', 'PROVIDER_REPORTED', 'METERED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "PredictionQuality" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "OrgPlanTier" AS ENUM ('FREE', 'GROWTH', 'ENTERPRISE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "ForecastRefreshStatus" AS ENUM ('SUCCESS', 'FAILURE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "SignalQuality" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Region" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "typicalLatencyMs" INTEGER,
    "costPerKwh" DOUBLE PRECISION,
    "availableHardware" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "renewableCapacity" DOUBLE PRECISION,
    "avgCarbonIntensity" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CarbonCommandOutcome" (
    "id" TEXT NOT NULL,
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
    "regionMatch" BOOLEAN NOT NULL DEFAULT false,
    "slaMet" BOOLEAN,
    "fallbackTriggered" BOOLEAN DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "predictionQuality" "PredictionQuality" NOT NULL DEFAULT 'MEDIUM',
    "comparisonJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "learningSignals" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarbonCommandOutcome_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkloadEmbeddingIndex" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkloadEmbeddingIndex_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AdaptiveProfile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workloadType" TEXT,
    "modelFamily" TEXT,
    "region" TEXT,
    "weightModifiersJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "regionAdjustmentsJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "executionModeAdjustmentsJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "confidenceModifiersJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdaptiveProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Region_code_key" ON "Region"("code");
CREATE INDEX IF NOT EXISTS "Region_enabled_idx" ON "Region"("enabled");
CREATE UNIQUE INDEX IF NOT EXISTS "CarbonCommandOutcome_commandId_key" ON "CarbonCommandOutcome"("commandId");
CREATE UNIQUE INDEX IF NOT EXISTS "CarbonCommandOutcome_providerExecutionId_key" ON "CarbonCommandOutcome"("providerExecutionId");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkloadEmbeddingIndex_commandId_key" ON "WorkloadEmbeddingIndex"("commandId");
CREATE UNIQUE INDEX IF NOT EXISTS "AdaptiveProfile_orgId_workloadType_modelFamily_region_key" ON "AdaptiveProfile"("orgId", "workloadType", "modelFamily", "region");
CREATE INDEX IF NOT EXISTS "CarbonCommandOutcome_orgId_idx" ON "CarbonCommandOutcome"("orgId");
CREATE INDEX IF NOT EXISTS "CarbonCommandOutcome_actualRegion_idx" ON "CarbonCommandOutcome"("actualRegion");
CREATE INDEX IF NOT EXISTS "WorkloadEmbeddingIndex_orgId_idx" ON "WorkloadEmbeddingIndex"("orgId");
CREATE INDEX IF NOT EXISTS "WorkloadEmbeddingIndex_workloadType_idx" ON "WorkloadEmbeddingIndex"("workloadType");
CREATE INDEX IF NOT EXISTS "WorkloadEmbeddingIndex_region_idx" ON "WorkloadEmbeddingIndex"("region");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'CarbonCommandOutcome_commandId_fkey'
    ) THEN
        ALTER TABLE "CarbonCommandOutcome"
            ADD CONSTRAINT "CarbonCommandOutcome_commandId_fkey"
            FOREIGN KEY ("commandId") REFERENCES "CarbonCommand"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'CarbonCommandOutcome_orgId_fkey'
    ) THEN
        ALTER TABLE "CarbonCommandOutcome"
            ADD CONSTRAINT "CarbonCommandOutcome_orgId_fkey"
            FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'WorkloadEmbeddingIndex_commandId_fkey'
    ) THEN
        ALTER TABLE "WorkloadEmbeddingIndex"
            ADD CONSTRAINT "WorkloadEmbeddingIndex_commandId_fkey"
            FOREIGN KEY ("commandId") REFERENCES "CarbonCommand"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

INSERT INTO "Region" (
    "id",
    "code",
    "name",
    "country",
    "typicalLatencyMs",
    "costPerKwh",
    "availableHardware",
    "renewableCapacity",
    "avgCarbonIntensity",
    "enabled",
    "metadata",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    seed.code,
    seed.name,
    seed.country,
    NULL,
    NULL,
    ARRAY[]::TEXT[],
    NULL,
    NULL,
    true,
    '{}'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    VALUES
        ('us-east-1', 'US East (N. Virginia)', 'United States'),
        ('us-east-2', 'US East (Ohio)', 'United States'),
        ('us-west-1', 'US West (N. California)', 'United States'),
        ('us-west-2', 'US West (Oregon)', 'United States'),
        ('us-central-1', 'US Central (Iowa)', 'United States'),
        ('eu-west-1', 'Europe West (Ireland)', 'Ireland'),
        ('eu-west-2', 'Europe West (London)', 'United Kingdom'),
        ('eu-central-1', 'Europe Central (Frankfurt)', 'Germany'),
        ('ap-southeast-1', 'Asia Pacific Southeast (Singapore)', 'Singapore'),
        ('ap-northeast-1', 'Asia Pacific Northeast (Tokyo)', 'Japan'),
        ('ap-south-1', 'Asia Pacific South (Mumbai)', 'India')
) AS seed(code, name, country)
WHERE NOT EXISTS (
    SELECT 1
    FROM "Region" existing
    WHERE existing."code" = seed.code
);
