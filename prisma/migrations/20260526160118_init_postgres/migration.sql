-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('C4_CONTEXT', 'C4_CONTAINER', 'C4_COMPONENT', 'ADR', 'OPENAPI', 'ASYNCAPI', 'CONTEXT_MAP', 'DATA_CATALOG');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "ADRStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'DEPRECATED', 'SUPERSEDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RadarRing" AS ENUM ('ADOPT', 'TRIAL', 'ASSESS', 'HOLD');

-- CreateEnum
CREATE TYPE "RadarQuadrant" AS ENUM ('TECHNIQUES', 'TOOLS', 'PLATFORMS', 'LANGUAGES_FRAMEWORKS');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AIProviderType" AS ENUM ('OPENAI', 'ANTHROPIC', 'AZURE_OPENAI', 'LOCAL_OLLAMA', 'CUSTOM');

-- CreateTable
CREATE TABLE "RepositoryConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "accessToken" TEXT,
    "username" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSync" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "languages" TEXT,
    "frameworks" TEXT,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "lastCommitHash" TEXT,
    "lastAnalyzedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "aiProviderId" TEXT,
    "repositoryPath" TEXT,
    "repositoryUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT,
    "content" TEXT,
    "filePath" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "generatedAt" TIMESTAMP(3),
    "generatedBy" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ADR" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ADRStatus" NOT NULL DEFAULT 'PROPOSED',
    "context" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "consequences" TEXT,
    "alternatives" TEXT,
    "triggers" TEXT,
    "relatedCommits" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "supersededBy" TEXT,

    CONSTRAINT "ADR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Technology" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Technology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnologyUsage" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "technologyId" TEXT NOT NULL,
    "version" TEXT,
    "sourceFile" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnologyUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarItem" (
    "id" TEXT NOT NULL,
    "technologyId" TEXT NOT NULL,
    "ring" "RadarRing" NOT NULL,
    "quadrant" "RadarQuadrant" NOT NULL,
    "reason" TEXT,
    "organizationPos" TEXT,
    "thoughtworksPos" TEXT,
    "gartnerPos" TEXT,
    "gapStatus" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GapAnalysis" (
    "id" TEXT NOT NULL,
    "technologyName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "orgPosition" TEXT,
    "twPosition" TEXT,
    "gartnerPosition" TEXT,
    "gapType" TEXT,
    "recommendation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GapAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "documentsGenerated" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRun" TIMESTAMP(3),
    "nextRun" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AIProviderType" NOT NULL,
    "apiKey" TEXT,
    "baseUrl" TEXT,
    "modelName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "maxTokens" INTEGER NOT NULL DEFAULT 4096,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "C4Component" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "description" TEXT,
    "technology" TEXT,
    "relationships" TEXT,
    "parent" TEXT,
    "position" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "C4Component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoundedContext" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "domainType" TEXT,
    "relationships" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoundedContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_slug_key" ON "Repository"("slug");

-- CreateIndex
CREATE INDEX "Document_repositoryId_idx" ON "Document"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_repositoryId_type_version_key" ON "Document"("repositoryId", "type", "version");

-- CreateIndex
CREATE INDEX "ADR_repositoryId_idx" ON "ADR"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ADR_repositoryId_number_key" ON "ADR"("repositoryId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Technology_name_key" ON "Technology"("name");

-- CreateIndex
CREATE INDEX "TechnologyUsage_repositoryId_idx" ON "TechnologyUsage"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TechnologyUsage_repositoryId_technologyId_key" ON "TechnologyUsage"("repositoryId", "technologyId");

-- CreateIndex
CREATE UNIQUE INDEX "RadarItem_technologyId_quadrant_key" ON "RadarItem"("technologyId", "quadrant");

-- CreateIndex
CREATE INDEX "AnalysisRun_repositoryId_status_idx" ON "AnalysisRun"("repositoryId", "status");

-- CreateIndex
CREATE INDEX "AIProvider_isDefault_idx" ON "AIProvider"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "BoundedContext_repositoryId_name_key" ON "BoundedContext"("repositoryId", "name");

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "RepositoryConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_aiProviderId_fkey" FOREIGN KEY ("aiProviderId") REFERENCES "AIProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ADR" ADD CONSTRAINT "ADR_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnologyUsage" ADD CONSTRAINT "TechnologyUsage_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnologyUsage" ADD CONSTRAINT "TechnologyUsage_technologyId_fkey" FOREIGN KEY ("technologyId") REFERENCES "Technology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarItem" ADD CONSTRAINT "RadarItem_technologyId_fkey" FOREIGN KEY ("technologyId") REFERENCES "Technology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
