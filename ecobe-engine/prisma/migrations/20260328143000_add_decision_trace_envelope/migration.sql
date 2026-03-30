CREATE TABLE "DecisionTraceEnvelope" (
    "id" TEXT NOT NULL,
    "sequenceNumber" SERIAL NOT NULL,
    "decisionFrameId" TEXT NOT NULL,
    "traceHash" TEXT NOT NULL,
    "previousTraceHash" TEXT,
    "inputSignalHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionTraceEnvelope_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DecisionTraceEnvelope_sequenceNumber_key" ON "DecisionTraceEnvelope"("sequenceNumber");
CREATE UNIQUE INDEX "DecisionTraceEnvelope_decisionFrameId_key" ON "DecisionTraceEnvelope"("decisionFrameId");
CREATE INDEX "DecisionTraceEnvelope_decisionFrameId_createdAt_idx" ON "DecisionTraceEnvelope"("decisionFrameId", "createdAt");
CREATE INDEX "DecisionTraceEnvelope_traceHash_idx" ON "DecisionTraceEnvelope"("traceHash");
