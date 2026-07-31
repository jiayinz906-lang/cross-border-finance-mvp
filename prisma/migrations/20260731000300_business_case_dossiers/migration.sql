CREATE TABLE "BusinessCase" (
  "id" SERIAL PRIMARY KEY,
  "caseNo" TEXT NOT NULL UNIQUE,
  "month" TEXT NOT NULL,
  "caseType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerCode" TEXT,
  "salespersonName" TEXT,
  "customerServiceName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "startDate" TIMESTAMP(3), "endDate" TIMESTAMP(3),
  "deliveryDate" TIMESTAMP(3), "arrivalDate" TIMESTAMP(3),
  "contactName" TEXT, "contactPhone" TEXT, "address" TEXT,
  "productName" TEXT, "taxNumber" TEXT, "detailsJson" TEXT,
  "attachmentUrls" TEXT, "remark" TEXT,
  "createdBy" TEXT NOT NULL, "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BusinessCase_month_caseType_status_idx" ON "BusinessCase"("month", "caseType", "status");
CREATE INDEX "BusinessCase_customerName_idx" ON "BusinessCase"("customerName");
CREATE INDEX "BusinessCase_salespersonName_idx" ON "BusinessCase"("salespersonName");

CREATE TABLE "BusinessCaseItem" (
  "id" SERIAL PRIMARY KEY, "businessCaseId" INTEGER NOT NULL,
  "serialNo" INTEGER NOT NULL, "name" TEXT NOT NULL,
  "brand" TEXT, "model" TEXT, "manufacturer" TEXT, "material" TEXT,
  "purpose" TEXT, "description" TEXT, "imageUrl" TEXT, "linkUrl" TEXT,
  "certificate" TEXT, "hsCode" TEXT, "status" TEXT NOT NULL DEFAULT 'pending',
  "remark" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessCaseItem_businessCaseId_fkey" FOREIGN KEY ("businessCaseId") REFERENCES "BusinessCase"("id") ON DELETE CASCADE,
  CONSTRAINT "BusinessCaseItem_businessCaseId_serialNo_key" UNIQUE ("businessCaseId", "serialNo")
);
CREATE INDEX "BusinessCaseItem_businessCaseId_idx" ON "BusinessCaseItem"("businessCaseId");

CREATE TABLE "BusinessCaseComment" (
  "id" SERIAL PRIMARY KEY, "businessCaseId" INTEGER NOT NULL,
  "content" TEXT NOT NULL, "attachmentUrls" TEXT, "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessCaseComment_businessCaseId_fkey" FOREIGN KEY ("businessCaseId") REFERENCES "BusinessCase"("id") ON DELETE CASCADE
);
CREATE INDEX "BusinessCaseComment_businessCaseId_createdAt_idx" ON "BusinessCaseComment"("businessCaseId", "createdAt");
