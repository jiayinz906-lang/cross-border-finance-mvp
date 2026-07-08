import { prisma } from "../prisma/client.js";

export const payableRepository = {
  listPayables(month?: string) {
    return prisma.financeOrder.findMany({
      where: { adjustedPayable: { gt: 0 }, ...(month ? { month } : {}) },
      orderBy: { orderNo: "asc" }
    });
  }
};
