import { prisma } from "../prisma/client.js";
import { allFinanceAccess, scopedFinanceOrderWhere } from "../security/finance-access.js";
import type { FinanceAccessScope } from "../security/finance-access.js";

function monthWhere(month?: string) {
  return month ? { month } : undefined;
}

export const financeRepository = {
  listOrders(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    return prisma.financeOrder.findMany({
      where: scopedFinanceOrderWhere(monthWhere(month) ?? {}, scope),
      orderBy: [{ month: "desc" }, { orderNo: "asc" }]
    });
  },

  getLatestSummary(month?: string) {
    if (month) {
      return prisma.financeSummary.findUnique({ where: { month } });
    }
    return prisma.financeSummary.findFirst({ orderBy: { updatedAt: "desc" } });
  },

  listSummaries() {
    return prisma.financeSummary.findMany({ orderBy: { month: "asc" } });
  },

  listMonths() {
    return prisma.financeSummary.findMany({
      select: { month: true, updatedAt: true, totalReceivable: true, totalGrossProfit: true },
      orderBy: { month: "desc" }
    });
  },

  listLogisticsOrders(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    return prisma.financeOrder.findMany({
      where: scopedFinanceOrderWhere({ ...(month ? { month } : {}), isServiceBusiness: false }, scope),
      orderBy: [{ month: "desc" }, { orderNo: "asc" }]
    });
  },

  listServiceOrders(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    return prisma.financeOrder.findMany({
      where: scopedFinanceOrderWhere({ ...(month ? { month } : {}), isServiceBusiness: true }, scope),
      orderBy: [{ month: "desc" }, { orderNo: "asc" }]
    });
  }
};
