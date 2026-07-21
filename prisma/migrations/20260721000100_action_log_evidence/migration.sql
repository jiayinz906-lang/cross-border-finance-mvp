ALTER TABLE "ActionLog"
  ADD COLUMN "operatorUserId" INTEGER,
  ADD COLUMN "operatorRole" TEXT,
  ADD COLUMN "ipAddress" TEXT,
  ADD COLUMN "userAgent" TEXT,
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "beforeJson" TEXT,
  ADD COLUMN "afterJson" TEXT;

CREATE INDEX "ActionLog_month_action_idx" ON "ActionLog"("month", "action");
CREATE INDEX "ActionLog_operatorUserId_createdAt_idx" ON "ActionLog"("operatorUserId", "createdAt");
