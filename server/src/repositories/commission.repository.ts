import { prisma } from "../prisma/client.js";

export const commissionRepository = {
  listCommissions(month?: string) {
    return prisma.commissionRecord.findMany({
      where: month ? { financeOrder: { month } } : undefined,
      include: { financeOrder: true },
      orderBy: { id: "asc" }
    });
  },

  getCommission(id: number) {
    return prisma.commissionRecord.findUnique({
      where: { id },
      include: { financeOrder: true }
    });
  },

  updateCommissionRate(id: number, commissionRate: number, manualCommissionAmount: number) {
    return prisma.commissionRecord.update({
      where: { id },
      data: {
        commissionRate,
        manualCommissionAmount,
        commissionAmount: manualCommissionAmount
      },
      include: { financeOrder: true }
    });
  },

  async refreshMonthCommissionTotal(month: string) {
    const records = await prisma.commissionRecord.findMany({
      where: { financeOrder: { month } }
    });
    const totalCommission = records.reduce((sum, item) => sum + (item.manualCommissionAmount ?? item.commissionAmount), 0);
    await prisma.financeSummary.update({
      where: { month },
      data: { totalCommission }
    });
    return totalCommission;
  }
};
