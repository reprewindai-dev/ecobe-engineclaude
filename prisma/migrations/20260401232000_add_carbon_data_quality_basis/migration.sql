DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CarbonDataQuality') THEN
    CREATE TYPE "CarbonDataQuality" AS ENUM ('EXACT', 'DERIVED', 'INCOMPLETE');
  END IF;
END
$$;

ALTER TABLE "CIDecision"
  ADD COLUMN IF NOT EXISTS "baselineEnergyKwh" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "chosenEnergyKwh" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "baselineCo2G" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "chosenCo2G" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "co2DeltaG" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "carbonDataQuality" "CarbonDataQuality" NOT NULL DEFAULT 'INCOMPLETE';

ALTER TABLE "DashboardRoutingDecision"
  ADD COLUMN IF NOT EXISTS "baselineEnergyKwh" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "chosenEnergyKwh" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "baselineCo2G" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "chosenCo2G" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "co2DeltaG" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "carbonDataQuality" "CarbonDataQuality" NOT NULL DEFAULT 'INCOMPLETE';

UPDATE "CIDecision"
SET
  "baselineEnergyKwh" = COALESCE("baselineEnergyKwh", "estimatedKwh"),
  "chosenEnergyKwh" = COALESCE("chosenEnergyKwh", "estimatedKwh")
WHERE "baselineEnergyKwh" IS NULL
   OR "chosenEnergyKwh" IS NULL;

UPDATE "CIDecision"
SET
  "baselineCo2G" = CASE
    WHEN "baselineEnergyKwh" IS NOT NULL
      AND "baselineEnergyKwh" > 0
      AND "baseline" > 0
      AND "baseline" <= 2000
      THEN "baseline" * "baselineEnergyKwh"
    ELSE NULL
  END,
  "chosenCo2G" = CASE
    WHEN "chosenEnergyKwh" IS NOT NULL
      AND "chosenEnergyKwh" > 0
      AND "carbonIntensity" > 0
      AND "carbonIntensity" <= 2000
      THEN "carbonIntensity" * "chosenEnergyKwh"
    ELSE NULL
  END,
  "co2DeltaG" = CASE
    WHEN "baselineEnergyKwh" IS NOT NULL
      AND "baselineEnergyKwh" > 0
      AND "baseline" > 0
      AND "baseline" <= 2000
      AND "chosenEnergyKwh" IS NOT NULL
      AND "chosenEnergyKwh" > 0
      AND "carbonIntensity" > 0
      AND "carbonIntensity" <= 2000
      THEN ("baseline" * "baselineEnergyKwh") - ("carbonIntensity" * "chosenEnergyKwh")
    ELSE NULL
  END,
  "carbonDataQuality" = CASE
    WHEN "baselineEnergyKwh" IS NOT NULL AND "chosenEnergyKwh" IS NOT NULL AND "estimatedKwh" IS NULL
      THEN 'EXACT'::"CarbonDataQuality"
    WHEN "baselineEnergyKwh" IS NOT NULL AND "chosenEnergyKwh" IS NOT NULL
      THEN 'DERIVED'::"CarbonDataQuality"
    ELSE 'INCOMPLETE'::"CarbonDataQuality"
  END;

UPDATE "DashboardRoutingDecision"
SET
  "baselineEnergyKwh" = COALESCE("baselineEnergyKwh", "estimatedKwh"),
  "chosenEnergyKwh" = COALESCE("chosenEnergyKwh", "estimatedKwh")
WHERE "baselineEnergyKwh" IS NULL
   OR "chosenEnergyKwh" IS NULL;

UPDATE "DashboardRoutingDecision"
SET
  "baselineCo2G" = CASE
    WHEN "baselineEnergyKwh" IS NOT NULL
      AND "baselineEnergyKwh" > 0
      AND "carbonIntensityBaselineGPerKwh" > 0
      AND "carbonIntensityBaselineGPerKwh" <= 2000
      THEN "carbonIntensityBaselineGPerKwh" * "baselineEnergyKwh"
    ELSE NULL
  END,
  "chosenCo2G" = CASE
    WHEN "chosenEnergyKwh" IS NOT NULL
      AND "chosenEnergyKwh" > 0
      AND "carbonIntensityChosenGPerKwh" > 0
      AND "carbonIntensityChosenGPerKwh" <= 2000
      THEN "carbonIntensityChosenGPerKwh" * "chosenEnergyKwh"
    ELSE NULL
  END,
  "co2DeltaG" = CASE
    WHEN "baselineEnergyKwh" IS NOT NULL
      AND "baselineEnergyKwh" > 0
      AND "carbonIntensityBaselineGPerKwh" > 0
      AND "carbonIntensityBaselineGPerKwh" <= 2000
      AND "chosenEnergyKwh" IS NOT NULL
      AND "chosenEnergyKwh" > 0
      AND "carbonIntensityChosenGPerKwh" > 0
      AND "carbonIntensityChosenGPerKwh" <= 2000
      THEN ("carbonIntensityBaselineGPerKwh" * "baselineEnergyKwh") - ("carbonIntensityChosenGPerKwh" * "chosenEnergyKwh")
    ELSE NULL
  END,
  "carbonDataQuality" = CASE
    WHEN "baselineEnergyKwh" IS NOT NULL AND "chosenEnergyKwh" IS NOT NULL AND "estimatedKwh" IS NULL
      THEN 'EXACT'::"CarbonDataQuality"
    WHEN "baselineEnergyKwh" IS NOT NULL AND "chosenEnergyKwh" IS NOT NULL
      THEN 'DERIVED'::"CarbonDataQuality"
    ELSE 'INCOMPLETE'::"CarbonDataQuality"
  END,
  "co2BaselineG" = CASE
    WHEN "baselineEnergyKwh" IS NOT NULL
      AND "baselineEnergyKwh" > 0
      AND "carbonIntensityBaselineGPerKwh" > 0
      AND "carbonIntensityBaselineGPerKwh" <= 2000
      THEN "carbonIntensityBaselineGPerKwh" * "baselineEnergyKwh"
    ELSE NULL
  END,
  "co2ChosenG" = CASE
    WHEN "chosenEnergyKwh" IS NOT NULL
      AND "chosenEnergyKwh" > 0
      AND "carbonIntensityChosenGPerKwh" > 0
      AND "carbonIntensityChosenGPerKwh" <= 2000
      THEN "carbonIntensityChosenGPerKwh" * "chosenEnergyKwh"
    ELSE NULL
  END;
