import { commissionRepository } from "../repositories/commission.repository.js";
import { financeRepository } from "../repositories/finance.repository.js";

export const commissionService = {
  async listCommissions(month?: string) {
    const selectedMonth = month ?? (await financeRepository.getLatestSummary())?.month;
    return commissionRepository.listCommissions(selectedMonth);
  },
  todo: [
    "个人客户订单按毛利 15% 计算",
    "公司客户订单按毛利 10% 计算",
    "主管可调整客户类型",
    "注册、EAC证书、商标注册、店铺租赁等服务类业务进入单独确认表",
    "毛利小于等于 0、订单取消、数据无法确认时不计提成"
  ]
};
