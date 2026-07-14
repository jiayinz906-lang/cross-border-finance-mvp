DROP INDEX IF EXISTS "FinanceOrder_orderNo_key";

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceOrder_month_orderNo_key"
  ON "FinanceOrder"("month", "orderNo");

CREATE INDEX IF NOT EXISTS "FinanceOrder_orderNo_idx"
  ON "FinanceOrder"("orderNo");

ALTER TABLE "ImportBatch"
  ADD COLUMN IF NOT EXISTS "sourceFileData" BYTEA,
  ADD COLUMN IF NOT EXISTS "sourceFileSha256" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceFileSize" INTEGER;
