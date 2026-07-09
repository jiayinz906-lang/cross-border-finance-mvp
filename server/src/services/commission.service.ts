import { commissionRepository } from "../repositories/commission.repository.js";
import { financeRepository } from "../repositories/finance.repository.js";

export const commissionService = {
  async listCommissions(month?: string) {
    const selectedMonth = month ?? (await financeRepository.getLatestSummary())?.month;
    return commissionRepository.listCommissions(selectedMonth);
  },
  async updateCommissionRate(id: number, commissionRate: number) {
    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 1) {
      throw new Error("commissionRate must be between 0 and 1");
    }

    const record = await commissionRepository.getCommission(id);
    if (!record) {
      throw new Error("commission record not found");
    }

    const manualCommissionAmount = record.grossProfit * commissionRate;
    const updated = await commissionRepository.updateCommissionRate(id, commissionRate, manualCommissionAmount);
    const totalCommission = await commissionRepository.refreshMonthCommissionTotal(updated.financeOrder.month);
    return { row: updated, totalCommission };
  },
  todo: [
    "个人客户订单按毛利 15% 计算",
    "公司客户订单按毛利 10% 计算",
    "主管可调整客户类型",
    "注册、EAC证书、商标注册、店铺租赁等服务类业务进入单独确认表",
    "毛利小于等于 0、订单取消、数据无法确认时不计提成"
  ]
};
