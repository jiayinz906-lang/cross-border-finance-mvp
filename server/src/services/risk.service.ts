import { riskRepository } from "../repositories/risk.repository.js";
import { financeRepository } from "../repositories/finance.repository.js";
import { prisma } from "../prisma/client.js";

export const riskService = {
  async listRisks(month?: string) {
    const selectedMonth = month ?? (await financeRepository.getLatestSummary())?.month;
    return {
      todo: [
        "利润率低于 10% 标记为高风险",
        "利润率高于 50% 标记为异常高利润",
        "汇率缺失标记风险",
        "应付成本缺失标记风险",
        "已完成未回款标记风险",
        "毛利为负标记风险",
        "输出风险原因和建议处理动作"
      ],
      rows: await riskRepository.listRisks(selectedMonth)
    };
  },

  async reviewRisk(id: number, input: { reviewNote?: string; reviewConclusion?: string; reviewedBy?: string }) {
    if (!Number.isInteger(id)) throw new Error("风险记录 ID 无效");
    const reviewNote = input.reviewNote?.trim();
    if (!reviewNote) throw new Error("请填写风险复核说明");
    const reviewConclusion = input.reviewConclusion?.trim() || "已复核，按说明处理";
    const reviewedBy = input.reviewedBy?.trim() || "主管";

    const risk = await riskRepository.reviewRisk(id, {
      reviewNote,
      reviewConclusion,
      reviewedBy
    });

    await prisma.actionLog.create({
      data: {
        month: risk.financeOrder.month,
        entityType: "risk_record",
        entityId: String(id),
        action: "review_risk_with_note",
        operator: reviewedBy,
        payloadJson: JSON.stringify({
          orderNo: risk.financeOrder.orderNo,
          riskType: risk.riskType,
          reviewConclusion,
          reviewNote
        })
      }
    });

    return risk;
  }
};
