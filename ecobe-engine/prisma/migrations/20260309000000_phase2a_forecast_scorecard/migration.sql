-- Phase 2A: Forecast scorecard + CarbonForecast schema hardening

-- Add source and horizonHours to CarbonForecast
ALTER TABLE "CarbonForecast" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'electricity_maps';
ALTER TABLE "CarbonForecast" ADD COLUMN "horizonHours" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Drop old unique constraint (region, forecastTime) — now source is the differentiator
DROP INDEX IF EXISTS "region_forecastTime";
-- Create new unique constraint including source
CREATE UNIQUE INDEX "region_forecastTime_source" ON "CarbonForecast"("region", "forecastTime", "source");
-- Add index for source-bucketed queries
CREATE INDEX "CarbonForecast_region_source_forecastTime_idx" ON "CarbonForecast"("region", "source", "forecastTime");

-- Create RegionForecastScorecard table
CREATE TABLE "RegionForecastScorecard" (
  "id"                       TEXT NOT NULL,
  "region"                   TEXT NOT NULL,
  "mae24h"                   DOUBLE PRECISION,
  "mae48h"                   DOUBLE PRECISION,
  "mae72h"                   DOUBLE PRECISION,
  "mape24h"                  DOUBLE PRECISION,
  "mape48h"                  DOUBLE PRECISION,
  "mape72h"                  DOUBLE PRECISION,
  "fallbackRate"             DOUBLE PRECISION NOT NULL DEFAULT 0,
  "staleRejectionRate"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "providerDisagreementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "forecastHitRate"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reliabilityTier"          TEXT NOT NULL DEFAULT 'unknown',
  "sampleCount"              INTEGER NOT NULL DEFAULT 0,
  "lastComputedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegionForecastScorecard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RegionForecastScorecard_region_key" ON "RegionForecastScorecard"("region");
CREATE INDEX "RegionForecastScorecard_region_idx" ON "RegionForecastScorecard"("region");
