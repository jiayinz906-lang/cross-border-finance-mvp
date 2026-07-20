-- CreateTable
CREATE TABLE "AppUser" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordChangedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "dingtalkUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceOrder" (
    "id" SERIAL NOT NULL,
    "importBatchId" INTEGER,
    "orderNo" TEXT NOT NULL,
    "customerOrderNo" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "month" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerType" TEXT NOT NULL,
    "salespersonName" TEXT NOT NULL,
    "customerServiceName" TEXT,
    "businessType" TEXT NOT NULL,
    "supplierName" TEXT,
    "currency" TEXT NOT NULL,
    "exchangeRate" DOUBLE PRECISION,
    "exchangeRateSource" TEXT,
    "exchangeRateStatus" TEXT NOT NULL,
    "receivableFreight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivableClearance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivableDelivery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivableCompensation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherReceivable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payableFreight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payableClearance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payableDelivery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payableCompensation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjustedReceivable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjustedPayable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjustedGrossProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjustedGrossProfitRate" DOUBLE PRECISION,
    "receivedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orderStatus" TEXT NOT NULL,
    "receivableStatus" TEXT NOT NULL,
    "payableStatus" TEXT NOT NULL,
    "isServiceBusiness" BOOLEAN NOT NULL DEFAULT false,
    "isCompanyCustomerAdjusted" BOOLEAN NOT NULL DEFAULT false,
    "needSupervisorConfirm" BOOLEAN NOT NULL DEFAULT false,
    "calculationNote" TEXT,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorPerformanceOverride" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "operatorName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "orderCount" INTEGER,
    "baseCount" INTEGER,
    "rate" DOUBLE PRECISION,
    "updatedBy" TEXT NOT NULL DEFAULT '主管',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorPerformanceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorPerformanceMonthSetting" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "payoutNote" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL DEFAULT '主管',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorPerformanceMonthSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementRecord" (
    "id" SERIAL NOT NULL,
    "financeOrderId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL,
    "counterparty" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "operator" TEXT NOT NULL DEFAULT 'finance',
    "note" TEXT,
    "voidedBy" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawLedgerLine" (
    "id" SERIAL NOT NULL,
    "importBatchId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "orderNo" TEXT,
    "customerOrderNo" TEXT,
    "rowIndex" INTEGER NOT NULL,
    "sheetName" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "rowHash" TEXT NOT NULL,
    "rawJson" TEXT NOT NULL,
    "canonicalJson" TEXT,
    "parseStatus" TEXT NOT NULL DEFAULT 'parsed',
    "parseMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawLedgerLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessPartner" (
    "id" SERIAL NOT NULL,
    "partnerCode" TEXT NOT NULL,
    "partnerType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxNumber" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceInvoice" (
    "id" SERIAL NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "invoiceType" TEXT NOT NULL,
    "partnerId" INTEGER,
    "financeOrderId" INTEGER,
    "orderNo" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "originalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "localAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allocatedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "source" TEXT NOT NULL DEFAULT 'finance_order',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceInvoiceAllocation" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "settlementRecordId" INTEGER,
    "bankTransactionId" INTEGER,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" TEXT NOT NULL DEFAULT 'finance',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceInvoiceAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" SERIAL NOT NULL,
    "transactionNo" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "direction" TEXT NOT NULL,
    "partnerId" INTEGER,
    "manualLedgerEntryId" INTEGER,
    "counterparty" TEXT NOT NULL,
    "bankReference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "originalAmount" DOUBLE PRECISION NOT NULL,
    "localAmount" DOUBLE PRECISION NOT NULL,
    "matchedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'unmatched',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'finance',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationMatch" (
    "id" SERIAL NOT NULL,
    "bankTransactionId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "suggestedAmount" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "matchReason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTask" (
    "id" SERIAL NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerRole" TEXT NOT NULL,
    "ownerName" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "route" TEXT,
    "dueAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceChargeLine" (
    "id" SERIAL NOT NULL,
    "importBatchId" INTEGER NOT NULL,
    "financeOrderId" INTEGER,
    "rawLedgerLineId" INTEGER,
    "month" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "customerOrderNo" TEXT,
    "customerName" TEXT,
    "salespersonName" TEXT,
    "customerServiceName" TEXT,
    "direction" TEXT NOT NULL,
    "feeType" TEXT NOT NULL,
    "service" TEXT,
    "supplierName" TEXT,
    "currency" TEXT,
    "exchangeRate" DOUBLE PRECISION,
    "originalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "localAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "signedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isCompensation" BOOLEAN NOT NULL DEFAULT false,
    "isServiceBusiness" BOOLEAN NOT NULL DEFAULT false,
    "rowIndex" INTEGER NOT NULL,
    "sourceFileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceChargeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" SERIAL NOT NULL,
    "batchNo" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "importMode" TEXT NOT NULL DEFAULT 'replace_month',
    "status" TEXT NOT NULL DEFAULT 'active',
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "importedOrders" INTEGER NOT NULL DEFAULT 0,
    "logisticsOrders" INTEGER NOT NULL DEFAULT 0,
    "serviceOrders" INTEGER NOT NULL DEFAULT 0,
    "totalReceivable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPayable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalGrossProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskOrderCount" INTEGER NOT NULL DEFAULT 0,
    "abnormalHighProfitCount" INTEGER NOT NULL DEFAULT 0,
    "templateAuditJson" TEXT,
    "previewJson" TEXT,
    "sourceFileData" BYTEA,
    "sourceFileSha256" TEXT,
    "sourceFileSize" INTEGER,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSummary" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "totalReceivable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPayable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalGrossProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossProfitRate" DOUBLE PRECISION,
    "totalCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskOrderCount" INTEGER NOT NULL DEFAULT 0,
    "abnormalHighProfitOrderCount" INTEGER NOT NULL DEFAULT 0,
    "pendingSupervisorConfirmCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthClose" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "unlockedBy" TEXT,
    "unlockedAt" TIMESTAMP(3),
    "closeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExcelImportTemplate" (
    "id" SERIAL NOT NULL,
    "templateKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "headerRowIndex" INTEGER NOT NULL DEFAULT 1,
    "headersJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExcelImportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParameterRule" (
    "id" SERIAL NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "ruleGroup" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParameterRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRecord" (
    "id" SERIAL NOT NULL,
    "financeOrderId" INTEGER NOT NULL,
    "salespersonName" TEXT NOT NULL,
    "customerType" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "grossProfit" DOUBLE PRECISION NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "commissionAmount" DOUBLE PRECISION NOT NULL,
    "manualCommissionAmount" DOUBLE PRECISION,
    "adjustReason" TEXT,
    "needSupervisorConfirm" BOOLEAN NOT NULL DEFAULT false,
    "confirmStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskRecord" (
    "id" SERIAL NOT NULL,
    "financeOrderId" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "riskType" TEXT NOT NULL,
    "riskReasons" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reviewNote" TEXT,
    "reviewConclusion" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostAdjustment" (
    "id" SERIAL NOT NULL,
    "financeOrderId" INTEGER NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" DOUBLE PRECISION,
    "newValue" DOUBLE PRECISION,
    "adjustmentLogic" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "operatorName" TEXT NOT NULL,
    "needSupervisorConfirm" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBusinessRecord" (
    "id" SERIAL NOT NULL,
    "financeOrderId" INTEGER NOT NULL,
    "serviceType" TEXT NOT NULL,
    "originalPrice" DOUBLE PRECISION NOT NULL,
    "suggestedPrice" DOUBLE PRECISION,
    "suggestedCommissionMin" DOUBLE PRECISION,
    "suggestedCommissionMax" DOUBLE PRECISION,
    "costAmount" DOUBLE PRECISION,
    "grossProfit" DOUBLE PRECISION,
    "supervisorFinalPrice" DOUBLE PRECISION,
    "supervisorFinalCommission" DOUBLE PRECISION,
    "confirmStatus" TEXT NOT NULL DEFAULT 'pending',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBusinessRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmationDocument" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "businessType" TEXT,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "grossProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payloadJson" TEXT,
    "documentStatus" TEXT NOT NULL DEFAULT 'generated',
    "sendStatus" TEXT NOT NULL DEFAULT 'unsent',
    "notificationChannel" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "notificationReceiptJson" TEXT,
    "notificationError" TEXT,
    "signatureStatus" TEXT NOT NULL DEFAULT 'pending',
    "supervisorStatus" TEXT NOT NULL DEFAULT 'pending',
    "signatureToken" TEXT,
    "signatureUrl" TEXT,
    "signatureTokenExpiresAt" TIMESTAMP(3),
    "signerIp" TEXT,
    "signerUserAgent" TEXT,
    "signerRole" TEXT,
    "signatureEvidenceJson" TEXT,
    "adjustReason" TEXT,
    "voidReason" TEXT,
    "signedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfirmationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "exportType" TEXT NOT NULL,
    "fileFormat" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "fileName" TEXT NOT NULL,
    "payloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualLedgerEntry" (
    "id" SERIAL NOT NULL,
    "entryNo" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "direction" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "originalAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "localAmount" DOUBLE PRECISION NOT NULL,
    "businessType" TEXT,
    "orderNo" TEXT,
    "customerOrderNo" TEXT,
    "salespersonName" TEXT,
    "customerServiceName" TEXT,
    "supplierName" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAttachment" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "fileData" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" SERIAL NOT NULL,
    "month" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "operator" TEXT NOT NULL DEFAULT '主管',
    "payloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");

-- CreateIndex
CREATE INDEX "FinanceOrder_orderNo_idx" ON "FinanceOrder"("orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceOrder_month_orderNo_key" ON "FinanceOrder"("month", "orderNo");

-- CreateIndex
CREATE INDEX "OperatorPerformanceOverride_month_operatorName_idx" ON "OperatorPerformanceOverride"("month", "operatorName");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorPerformanceOverride_month_operatorName_category_key" ON "OperatorPerformanceOverride"("month", "operatorName", "category");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorPerformanceMonthSetting_month_key" ON "OperatorPerformanceMonthSetting"("month");

-- CreateIndex
CREATE INDEX "SettlementRecord_month_direction_idx" ON "SettlementRecord"("month", "direction");

-- CreateIndex
CREATE INDEX "SettlementRecord_financeOrderId_direction_idx" ON "SettlementRecord"("financeOrderId", "direction");

-- CreateIndex
CREATE INDEX "RawLedgerLine_month_orderNo_idx" ON "RawLedgerLine"("month", "orderNo");

-- CreateIndex
CREATE INDEX "RawLedgerLine_importBatchId_rowIndex_idx" ON "RawLedgerLine"("importBatchId", "rowIndex");

-- CreateIndex
CREATE UNIQUE INDEX "RawLedgerLine_importBatchId_rowIndex_key" ON "RawLedgerLine"("importBatchId", "rowIndex");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessPartner_partnerCode_key" ON "BusinessPartner"("partnerCode");

-- CreateIndex
CREATE INDEX "BusinessPartner_partnerType_isActive_idx" ON "BusinessPartner"("partnerType", "isActive");

-- CreateIndex
CREATE INDEX "BusinessPartner_name_idx" ON "BusinessPartner"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInvoice_invoiceNo_key" ON "FinanceInvoice"("invoiceNo");

-- CreateIndex
CREATE INDEX "FinanceInvoice_month_invoiceType_status_idx" ON "FinanceInvoice"("month", "invoiceType", "status");

-- CreateIndex
CREATE INDEX "FinanceInvoice_partnerId_dueAt_idx" ON "FinanceInvoice"("partnerId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInvoice_month_invoiceType_financeOrderId_key" ON "FinanceInvoice"("month", "invoiceType", "financeOrderId");

-- CreateIndex
CREATE INDEX "FinanceInvoiceAllocation_invoiceId_status_idx" ON "FinanceInvoiceAllocation"("invoiceId", "status");

-- CreateIndex
CREATE INDEX "FinanceInvoiceAllocation_settlementRecordId_idx" ON "FinanceInvoiceAllocation"("settlementRecordId");

-- CreateIndex
CREATE INDEX "FinanceInvoiceAllocation_bankTransactionId_idx" ON "FinanceInvoiceAllocation"("bankTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInvoiceAllocation_invoiceId_settlementRecordId_key" ON "FinanceInvoiceAllocation"("invoiceId", "settlementRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_transactionNo_key" ON "BankTransaction"("transactionNo");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_manualLedgerEntryId_key" ON "BankTransaction"("manualLedgerEntryId");

-- CreateIndex
CREATE INDEX "BankTransaction_month_direction_status_idx" ON "BankTransaction"("month", "direction", "status");

-- CreateIndex
CREATE INDEX "BankTransaction_transactionDate_idx" ON "BankTransaction"("transactionDate");

-- CreateIndex
CREATE INDEX "ReconciliationMatch_status_score_idx" ON "ReconciliationMatch"("status", "score");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationMatch_bankTransactionId_invoiceId_key" ON "ReconciliationMatch"("bankTransactionId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTask_sourceKey_key" ON "WorkflowTask"("sourceKey");

-- CreateIndex
CREATE INDEX "WorkflowTask_month_status_priority_idx" ON "WorkflowTask"("month", "status", "priority");

-- CreateIndex
CREATE INDEX "WorkflowTask_ownerRole_ownerName_status_idx" ON "WorkflowTask"("ownerRole", "ownerName", "status");

-- CreateIndex
CREATE INDEX "FinanceChargeLine_month_orderNo_idx" ON "FinanceChargeLine"("month", "orderNo");

-- CreateIndex
CREATE INDEX "FinanceChargeLine_importBatchId_rowIndex_idx" ON "FinanceChargeLine"("importBatchId", "rowIndex");

-- CreateIndex
CREATE INDEX "FinanceChargeLine_financeOrderId_idx" ON "FinanceChargeLine"("financeOrderId");

-- CreateIndex
CREATE INDEX "FinanceChargeLine_rawLedgerLineId_idx" ON "FinanceChargeLine"("rawLedgerLineId");

-- CreateIndex
CREATE INDEX "FinanceChargeLine_month_direction_feeType_idx" ON "FinanceChargeLine"("month", "direction", "feeType");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_batchNo_key" ON "ImportBatch"("batchNo");

-- CreateIndex
CREATE INDEX "ImportBatch_month_status_idx" ON "ImportBatch"("month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSummary_month_key" ON "FinanceSummary"("month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthClose_month_key" ON "MonthClose"("month");

-- CreateIndex
CREATE UNIQUE INDEX "ExcelImportTemplate_templateKey_key" ON "ExcelImportTemplate"("templateKey");

-- CreateIndex
CREATE UNIQUE INDEX "ParameterRule_ruleKey_key" ON "ParameterRule"("ruleKey");

-- CreateIndex
CREATE INDEX "ParameterRule_ruleGroup_isActive_idx" ON "ParameterRule"("ruleGroup", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmationDocument_signatureToken_key" ON "ConfirmationDocument"("signatureToken");

-- CreateIndex
CREATE INDEX "ConfirmationDocument_month_documentType_idx" ON "ConfirmationDocument"("month", "documentType");

-- CreateIndex
CREATE INDEX "ConfirmationDocument_month_documentType_ownerName_idx" ON "ConfirmationDocument"("month", "documentType", "ownerName");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmationDocument_month_documentType_ownerName_version_key" ON "ConfirmationDocument"("month", "documentType", "ownerName", "version");

-- CreateIndex
CREATE INDEX "ExportJob_month_exportType_idx" ON "ExportJob"("month", "exportType");

-- CreateIndex
CREATE UNIQUE INDEX "ManualLedgerEntry_entryNo_key" ON "ManualLedgerEntry"("entryNo");

-- CreateIndex
CREATE INDEX "ManualLedgerEntry_month_transactionDate_idx" ON "ManualLedgerEntry"("month", "transactionDate");

-- CreateIndex
CREATE INDEX "ManualLedgerEntry_month_direction_status_idx" ON "ManualLedgerEntry"("month", "direction", "status");

-- CreateIndex
CREATE INDEX "ManualLedgerEntry_orderNo_idx" ON "ManualLedgerEntry"("orderNo");

-- CreateIndex
CREATE INDEX "ManualLedgerEntry_customerOrderNo_idx" ON "ManualLedgerEntry"("customerOrderNo");

-- CreateIndex
CREATE INDEX "LedgerAttachment_entryId_idx" ON "LedgerAttachment"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAttachment_entryId_sha256_key" ON "LedgerAttachment"("entryId", "sha256");

-- CreateIndex
CREATE INDEX "ActionLog_entityType_entityId_idx" ON "ActionLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "FinanceOrder" ADD CONSTRAINT "FinanceOrder_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRecord" ADD CONSTRAINT "SettlementRecord_financeOrderId_fkey" FOREIGN KEY ("financeOrderId") REFERENCES "FinanceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawLedgerLine" ADD CONSTRAINT "RawLedgerLine_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_financeOrderId_fkey" FOREIGN KEY ("financeOrderId") REFERENCES "FinanceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInvoiceAllocation" ADD CONSTRAINT "FinanceInvoiceAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinanceInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInvoiceAllocation" ADD CONSTRAINT "FinanceInvoiceAllocation_settlementRecordId_fkey" FOREIGN KEY ("settlementRecordId") REFERENCES "SettlementRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInvoiceAllocation" ADD CONSTRAINT "FinanceInvoiceAllocation_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_manualLedgerEntryId_fkey" FOREIGN KEY ("manualLedgerEntryId") REFERENCES "ManualLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationMatch" ADD CONSTRAINT "ReconciliationMatch_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationMatch" ADD CONSTRAINT "ReconciliationMatch_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinanceInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceChargeLine" ADD CONSTRAINT "FinanceChargeLine_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceChargeLine" ADD CONSTRAINT "FinanceChargeLine_financeOrderId_fkey" FOREIGN KEY ("financeOrderId") REFERENCES "FinanceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceChargeLine" ADD CONSTRAINT "FinanceChargeLine_rawLedgerLineId_fkey" FOREIGN KEY ("rawLedgerLineId") REFERENCES "RawLedgerLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_financeOrderId_fkey" FOREIGN KEY ("financeOrderId") REFERENCES "FinanceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskRecord" ADD CONSTRAINT "RiskRecord_financeOrderId_fkey" FOREIGN KEY ("financeOrderId") REFERENCES "FinanceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostAdjustment" ADD CONSTRAINT "CostAdjustment_financeOrderId_fkey" FOREIGN KEY ("financeOrderId") REFERENCES "FinanceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBusinessRecord" ADD CONSTRAINT "ServiceBusinessRecord_financeOrderId_fkey" FOREIGN KEY ("financeOrderId") REFERENCES "FinanceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAttachment" ADD CONSTRAINT "LedgerAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ManualLedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
