-- CreateTable
CREATE TABLE "RuntimeIncident" (
    "id" TEXT NOT NULL,
    "incidentKey" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRecoveredAt" TIMESTAMP(3),
    "detectionCount" INTEGER NOT NULL DEFAULT 1,
    "recoveryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeIncident_incidentKey_key" ON "RuntimeIncident"("incidentKey");

-- CreateIndex
CREATE INDEX "RuntimeIncident_status_severity_updatedAt_idx" ON "RuntimeIncident"("status", "severity", "updatedAt");

-- CreateIndex
CREATE INDEX "RuntimeIncident_component_updatedAt_idx" ON "RuntimeIncident"("component", "updatedAt");
