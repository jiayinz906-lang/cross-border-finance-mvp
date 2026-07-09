import { prisma } from "../prisma/client.js";

function monthWhere(month?: string) {
  return month ? { month } : undefined;
}

export const financeRepository = {
  listOrders(month?: string) {
    return prisma.financeOrder.findMany({
      where: monthWhere(month),
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

  listLogisticsOrders(month?: string) {
    return prisma.financeOrder.findMany({
      where: { ...(month ? { month } : {}), isServiceBusiness: false },
      orderBy: [{ month: "desc" }, { orderNo: "asc" }]
    });
  },

  listServiceOrders(month?: string) {
    return prisma.financeOrder.findMany({
      where: { ...(month ? { month } : {}), isServiceBusiness: true },
      orderBy: [{ month: "desc" }, { orderNo: "asc" }]
    });
  }
};
