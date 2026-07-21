import type { Prisma } from "@prisma/client";
import { AppError } from "../errors/app-error.js";

type MonthLockClient = Pick<Prisma.TransactionClient, "monthClose">;

export async function assertMonthOpen(db: MonthLockClient, month: string, action = "修改财务数据") {
  const close = await db.monthClose.findUnique({ where: { month } });
  if (close?.status === "locked") {
    throw new AppError(409, "MONTH_LOCKED", `${month} 已锁账，不能${action}。请先由主管解锁并记录原因。`);
  }
  return close;
}
