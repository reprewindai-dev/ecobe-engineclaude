-- CreateTable
CREATE TABLE "DecisionReceipt" (
    "id" TEXT NOT NULL,
    "decisionFrameId" TEXT NOT NULL,
    "receiptHash" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "alg" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "traceHash" TEXT NOT NULL,
    "envelope" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DecisionReceipt_decisionFrameId_key" ON "DecisionReceipt"("decisionFrameId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionReceipt_receiptHash_key" ON "DecisionReceipt"("receiptHash");

-- CreateIndex
CREATE INDEX "DecisionReceipt_keyId_createdAt_idx" ON "DecisionReceipt"("keyId", "createdAt");

