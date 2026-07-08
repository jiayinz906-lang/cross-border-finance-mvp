import { prisma } from "../prisma/client.js";

export const riskRepository = {
  listRisks(month?: string) {
    return prisma.riskRecord.findMany({
      where: month ? { financeOrder: { month } } : undefined,
      include: { financeOrder: true },
      orderBy: { id: "asc" }
    });
  }
};
