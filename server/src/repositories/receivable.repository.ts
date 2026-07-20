import { prisma } from "../prisma/client.js";

export const receivableRepository = {
  listReceivables(month?: string) {
    return prisma.financeOrder.findMany({
      where: { adjustedReceivable: { gt: 0 }, ...(month ? { month } : {}) },
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
