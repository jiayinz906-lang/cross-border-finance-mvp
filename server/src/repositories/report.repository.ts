import { prisma } from "../prisma/client.js";
import { allFinanceAccess, scopedFinanceOrderWhere } from "../security/finance-access.js";
import type { FinanceAccessScope } from "../security/finance-access.js";

export const reportRepository = {
  listServiceRecords(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    return prisma.serviceBusinessRecord.findMany({
      where: {
        financeOrder: {
          is: scopedFinanceOrderWhere({ ...(month ? { month } : {}), isServiceBusiness: true }, scope)
        }
      },
      include: { financeOrder: true },
      orderBy: { id: "asc" }
    });
  },

  async getMonthlyReport(month?: string) {
    const summary = month
      ? await prisma.financeSummary.findUnique({ where: { month } })
      : await prisma.financeSummary.findFirst({ orderBy: { updatedAt: "desc" } });
    const selectedMonth = month ?? summary?.month;
    const where = selectedMonth ? { financeOrder: { month: selectedMonth } } : undefined;

    const [orders, risks, commissions, serviceRecords] = await Promise.all([
      prisma.financeOrder.findMany({
        where: selectedMonth ? { month: selectedMonth } : undefined,
        orderBy: { orderNo: "asc" }
      }),
      prisma.riskRecord.findMany({ where, include: { financeOrder: true } }),
      prisma.commissionRecord.findMany({ where, include: { financeOrder: true } }),
      prisma.serviceBusinessRecord.findMany({ where, include: { financeOrder: true } })
    ]);

    return { summary, orders, risks, commissions, serviceRecords };
  }
};
