-- CreateTable
CREATE TABLE "EntsoeGenerationRaw" (
    "id" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "carbonIntensityGco2Kwh" DOUBLE PRECISION NOT NULL,
    "fuelBreakdownMw" JSONB NOT NULL DEFAULT '{}',
    "method" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceFreshness" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntsoeGenerationRaw_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntsoeGenerationRaw_zone_observedAt_idx" ON "EntsoeGenerationRaw"("zone", "observedAt");

-- CreateIndex
CREATE INDEX "EntsoeGenerationRaw_observedAt_idx" ON "EntsoeGenerationRaw"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EntsoeGenerationRaw_zone_observedAt_key" ON "EntsoeGenerationRaw"("zone", "observedAt");
