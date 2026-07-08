import { prisma } from "../prisma/client.js";

export const commissionRepository = {
  listCommissions(month?: string) {
    return prisma.commissionRecord.findMany({
      where: month ? { financeOrder: { month } } : undefined,
      include: { financeOrder: true },
      orderBy: { id: "asc" }
    });
  }
};
