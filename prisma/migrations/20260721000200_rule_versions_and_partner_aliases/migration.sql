CREATE TABLE "BusinessPartnerAlias" (
  "id" SERIAL NOT NULL,
  "businessPartnerId" INTEGER NOT NULL,
  "partnerType" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "normalizedAlias" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessPartnerAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessPartnerAlias_partnerType_normalizedAlias_key"
  ON "BusinessPartnerAlias"("partnerType", "normalizedAlias");
CREATE INDEX "BusinessPartnerAlias_businessPartnerId_idx"
  ON "BusinessPartnerAlias"("businessPartnerId");
CREATE INDEX "BusinessPartnerAlias_alias_idx"
  ON "BusinessPartnerAlias"("alias");

ALTER TABLE "BusinessPartnerAlias"
  ADD CONSTRAINT "BusinessPartnerAlias_businessPartnerId_fkey"
  FOREIGN KEY ("businessPartnerId") REFERENCES "BusinessPartner"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ParameterRuleVersion" (
  "id" SERIAL NOT NULL,
  "parameterRuleId" INTEGER NOT NULL,
  "effectiveMonth" TEXT NOT NULL,
  "valueJson" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "updatedBy" TEXT NOT NULL DEFAULT 'system',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParameterRuleVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParameterRuleVersion_parameterRuleId_effectiveMonth_key"
  ON "ParameterRuleVersion"("parameterRuleId", "effectiveMonth");
CREATE INDEX "ParameterRuleVersion_effectiveMonth_isActive_idx"
  ON "ParameterRuleVersion"("effectiveMonth", "isActive");

ALTER TABLE "ParameterRuleVersion"
  ADD CONSTRAINT "ParameterRuleVersion_parameterRuleId_fkey"
  FOREIGN KEY ("parameterRuleId") REFERENCES "ParameterRule"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
