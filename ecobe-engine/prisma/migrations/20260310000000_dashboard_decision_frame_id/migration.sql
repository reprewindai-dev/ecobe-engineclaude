-- Add decisionFrameId to DashboardRoutingDecision for engine auto-write deduplication.
-- This enables upsert logic: engine writes first with core fields; a later client call
-- with the same decisionFrameId enriches (not duplicates) the row.

ALTER TABLE "DashboardRoutingDecision" ADD COLUMN "decisionFrameId" TEXT;

CREATE UNIQUE INDEX "DashboardRoutingDecision_decisionFrameId_key"
  ON "DashboardRoutingDecision"("decisionFrameId");
