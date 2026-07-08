import { prisma } from "../prisma/client.js";

export const reportRepository = {
  async getMonthlyReport(month?: string) {
    const summary = month
      ? await prisma.financeSummary.findUnique({ where: { month } })
      : await prisma.financeSummary.findFirst({ orderBy: { updatedAt: "desc" } });
    const selectedMonth = month ?? summary?.month;
    const where = selectedMonth ? { financeOrder: { month: selectedMonth } } : undefined;

    const [risks, commissions, serviceRecords] = await Promise.all([
      prisma.riskRecord.findMany({ where, include: { financeOrder: true } }),
      prisma.commissionRecord.findMany({ where, include: { financeOrder: true } }),
      prisma.serviceBusinessRecord.findMany({ where, include: { financeOrder: true } })
    ]);

    return { summary, risks, commissions, serviceRecords };
  }
};
