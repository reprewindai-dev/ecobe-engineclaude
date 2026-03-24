-- AlterTable
ALTER TABLE "CarbonLedgerEntry"
ADD COLUMN "baselineWaterIntensityLPerKwh" DOUBLE PRECISION,
ADD COLUMN "baselineWaterL" DOUBLE PRECISION,
ADD COLUMN "baselineWaterScarcityImpact" DOUBLE PRECISION,
ADD COLUMN "chosenWaterIntensityLPerKwh" DOUBLE PRECISION,
ADD COLUMN "chosenWaterL" DOUBLE PRECISION,
ADD COLUMN "chosenWaterScarcityImpact" DOUBLE PRECISION,
ADD COLUMN "droughtRiskIndex" DOUBLE PRECISION,
ADD COLUMN "waterConfidenceScore" DOUBLE PRECISION,
ADD COLUMN "waterDatasetVersion" TEXT,
ADD COLUMN "waterFallbackUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "waterGuardrailTriggered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "waterPolicyProfile" TEXT,
ADD COLUMN "waterQualityIndex" DOUBLE PRECISION,
ADD COLUMN "waterReferenceTime" TIMESTAMP(3),
ADD COLUMN "waterSavedL" DOUBLE PRECISION,
ADD COLUMN "waterSignalType" TEXT,
ADD COLUMN "waterSource" TEXT,
ADD COLUMN "waterStressIndex" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "RoutingCandidate"
ADD COLUMN "waterConfidenceScore" DOUBLE PRECISION,
ADD COLUMN "waterEstimateLiters" DOUBLE PRECISION,
ADD COLUMN "waterGuardrailTriggered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "waterIntensityLPerKwh" DOUBLE PRECISION,
ADD COLUMN "waterScarcityImpact" DOUBLE PRECISION,
ADD COLUMN "waterScore" DOUBLE PRECISION,
ADD COLUMN "waterStressIndex" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "WaterSignal" (
    "id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "waterIntensityLPerKwh" DOUBLE PRECISION NOT NULL,
    "waterStressIndex" DOUBLE PRECISION NOT NULL,
    "waterQualityIndex" DOUBLE PRECISION,
    "droughtRiskIndex" DOUBLE PRECISION,
    "scarcityCfMonthly" DOUBLE PRECISION,
    "scarcityCfAnnual" DOUBLE PRECISION,
    "siteWaterIntensityLPerKwh" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "referenceTime" TIMESTAMP(3) NOT NULL,
    "dataQuality" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "datasetVersion" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaterSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaterSignal_region_referenceTime_idx" ON "WaterSignal"("region", "referenceTime");

-- CreateIndex
CREATE INDEX "WaterSignal_source_referenceTime_idx" ON "WaterSignal"("source", "referenceTime");

-- CreateIndex
CREATE UNIQUE INDEX "WaterSignal_region_referenceTime_source_key"
ON "WaterSignal"("region", "referenceTime", "source");
