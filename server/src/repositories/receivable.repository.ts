import { prisma } from "../prisma/client.js";
import { allFinanceAccess, scopedFinanceOrderWhere } from "../security/finance-access.js";
import type { FinanceAccessScope } from "../security/finance-access.js";

export const receivableRepository = {
  listReceivables(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    return prisma.financeOrder.findMany({
      where: scopedFinanceOrderWhere({ adjustedReceivable: { gt: 0 }, ...(month ? { month } : {}) }, scope),
      include: {
        settlementRecords: {
          where: { direction: "receivable", status: "active" },
          select: { amount: true }
        }
      },
      orderBy: { orderNo: "asc" }
    });
  }
};
