-- DropIndex
DROP INDEX "Setting_key_key";

-- AlterTable
ALTER TABLE "AIProvider" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RepositoryConnection" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "AIProvider_tenantId_idx" ON "AIProvider"("tenantId");

-- CreateIndex
CREATE INDEX "Repository_tenantId_idx" ON "Repository"("tenantId");

-- CreateIndex
CREATE INDEX "RepositoryConnection_tenantId_idx" ON "RepositoryConnection"("tenantId");

-- CreateIndex
CREATE INDEX "Setting_tenantId_idx" ON "Setting"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_tenantId_key_key" ON "Setting"("tenantId", "key");

