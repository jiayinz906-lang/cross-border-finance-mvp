ALTER TABLE "ImportBatch"
ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'excel';

ALTER TABLE "ManualLedgerEntry"
ADD COLUMN "documentNo" TEXT,
ADD COLUMN "lineNo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "customerName" TEXT,
ADD COLUMN "convertedAmount" DOUBLE PRECISION,
ADD COLUMN "unitPrice" DOUBLE PRECISION,
ADD COLUMN "feeType" TEXT,
ADD COLUMN "supplierService" TEXT,
ADD COLUMN "chargeWeight" DOUBLE PRECISION,
ADD COLUMN "supplierChargeWeight" DOUBLE PRECISION,
ADD COLUMN "actualWeight" DOUBLE PRECISION,
ADD COLUMN "pieces" INTEGER,
ADD COLUMN "mainProductName" TEXT,
ADD COLUMN "internalRemark" TEXT;

CREATE INDEX "ManualLedgerEntry_month_documentNo_idx"
ON "ManualLedgerEntry"("month", "documentNo");
