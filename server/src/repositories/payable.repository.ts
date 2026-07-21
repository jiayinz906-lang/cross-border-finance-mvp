import { prisma } from "../prisma/client.js";
import { allFinanceAccess, scopedFinanceOrderWhere } from "../security/finance-access.js";
import type { FinanceAccessScope } from "../security/finance-access.js";

export const payableRepository = {
  listPayables(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    return prisma.financeOrder.findMany({
      where: scopedFinanceOrderWhere({ adjustedPayable: { gt: 0 }, isServiceBusiness: false, ...(month ? { month } : {}) }, scope),
      include: {
        settlementRecords: {
          where: { direction: "payable", status: "active" },
          select: { amount: true }
        }
      },
      orderBy: { orderNo: "asc" }
    });
  }
};
