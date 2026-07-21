import { prisma } from "../prisma/client.js";
import { allFinanceAccess, scopedFinanceOrderWhere } from "../security/finance-access.js";
import type { FinanceAccessScope } from "../security/finance-access.js";

export const riskRepository = {
  listRisks(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    return prisma.riskRecord.findMany({
      where: { financeOrder: { is: scopedFinanceOrderWhere(month ? { month } : {}, scope) } },
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
