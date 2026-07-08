import { prisma } from "../prisma/client.js";

export const receivableRepository = {
  listReceivables(month?: string) {
    return prisma.financeOrder.findMany({
      where: { adjustedReceivable: { gt: 0 }, ...(month ? { month } : {}) },
      orderBy: { orderNo: "asc" }
    });
  }
};
