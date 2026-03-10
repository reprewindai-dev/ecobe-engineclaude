-- Add DekesHandoff table for ECOBE → DEKES integration event tracking.
-- Events are persisted locally first; forwarding to DEKES is optional (requires DEKES_ENDPOINT env var).
-- DEKES status callbacks update this table via POST /api/v1/integrations/dekes/handoff-status.

CREATE TABLE "DekesHandoff" (
    "id"                  TEXT NOT NULL,
    "handoffId"           TEXT NOT NULL,
    "organizationId"      TEXT,
    "decisionId"          TEXT,
    "decisionFrameId"     TEXT,
    "eventType"           TEXT NOT NULL,
    "severity"            TEXT NOT NULL,
    "payloadJson"         JSONB NOT NULL DEFAULT '{}',
    "status"              TEXT NOT NULL DEFAULT 'queued',
    "dekesClassification" TEXT,
    "dekesActionType"     TEXT,
    "dekesActionId"       TEXT,
    "sentAt"              TIMESTAMP(3),
    "processedAt"         TIMESTAMP(3),
    "failedAt"            TIMESTAMP(3),
    "errorMessage"        TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DekesHandoff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DekesHandoff_handoffId_key"   ON "DekesHandoff"("handoffId");
CREATE INDEX "DekesHandoff_organizationId_createdAt" ON "DekesHandoff"("organizationId", "createdAt");
CREATE INDEX "DekesHandoff_status_createdAt"         ON "DekesHandoff"("status", "createdAt");
CREATE INDEX "DekesHandoff_eventType_createdAt"      ON "DekesHandoff"("eventType", "createdAt");
