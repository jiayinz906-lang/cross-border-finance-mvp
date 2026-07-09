import { prisma } from "../prisma/client.js";

export const riskRepository = {
  listRisks(month?: string) {
    return prisma.riskRecord.findMany({
      where: month ? { financeOrder: { month } } : undefined,
      include: { financeOrder: true },
      orderBy: { id: "asc" }
    });
  },

  reviewRisk(id: number, data: { reviewNote: string; reviewConclusion: string; reviewedBy: string }) {
    return prisma.riskRecord.update({
      where: { id },
      data: {
        status: "reviewed",
        reviewNote: data.reviewNote,
        reviewConclusion: data.reviewConclusion,
        reviewedBy: data.reviewedBy,
        reviewedAt: new Date()
      },
      include: { financeOrder: true }
    });
  }
};
