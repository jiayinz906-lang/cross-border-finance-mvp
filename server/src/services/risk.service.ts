import { riskRepository } from "../repositories/risk.repository.js";
import { financeRepository } from "../repositories/finance.repository.js";

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
  }
};
