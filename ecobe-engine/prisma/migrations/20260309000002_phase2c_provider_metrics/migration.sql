-- Phase 2C: Provider performance monitoring
-- Adds totalLatencyMs and totalCalls to IntegrationMetric for rolling avg latency tracking.

ALTER TABLE "IntegrationMetric"
  ADD COLUMN "totalLatencyMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "totalCalls"     INTEGER          NOT NULL DEFAULT 0;
