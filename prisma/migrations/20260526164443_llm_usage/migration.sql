-- CreateTable
CREATE TABLE "LLMUsage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "analysisRunId" TEXT,
    "repositoryId" TEXT,
    "agentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LLMUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LLMUsage_provider_model_idx" ON "LLMUsage"("provider", "model");

-- CreateIndex
CREATE INDEX "LLMUsage_repositoryId_idx" ON "LLMUsage"("repositoryId");

-- CreateIndex
CREATE INDEX "LLMUsage_analysisRunId_idx" ON "LLMUsage"("analysisRunId");

-- CreateIndex
CREATE INDEX "LLMUsage_createdAt_idx" ON "LLMUsage"("createdAt");

