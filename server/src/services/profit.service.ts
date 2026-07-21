import { financeRepository } from "../repositories/finance.repository.js";
import { allFinanceAccess } from "../security/finance-access.js";
import type { FinanceAccessScope } from "../security/finance-access.js";

function rate(profit: number, receivable: number): number | null {
  return receivable === 0 ? null : profit / receivable;
}

type Bucket = {
  name: string;
  orderCount: number;
  receivable: number;
  payable: number;
  grossProfit: number;
};

function addTo(map: Map<string, Bucket>, key: string, receivable: number, payable: number, profit: number) {
  const item = map.get(key) ?? { name: key, orderCount: 0, receivable: 0, payable: 0, grossProfit: 0 };
  item.orderCount += 1;
  item.receivable += receivable;
  item.payable += payable;
  item.grossProfit += profit;
  map.set(key, item);
}

function values(map: Map<string, Bucket>) {
  return Array.from(map.values())
    .map((item) => ({ ...item, grossProfitRate: rate(item.grossProfit, item.receivable) }))
    .sort((a, b) => b.grossProfit - a.grossProfit);
}

export const profitService = {
  async getAnalysis(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    const selectedMonth = month ?? (await financeRepository.getLatestSummary())?.month;
    const orders = await financeRepository.listLogisticsOrders(selectedMonth, scope);
    const byBusinessType = new Map<string, Bucket>();
    const bySalesperson = new Map<string, Bucket>();
    const byCustomer = new Map<string, Bucket>();

    for (const order of orders) {
      addTo(byBusinessType, order.businessType, order.adjustedReceivable, order.adjustedPayable, order.adjustedGrossProfit);
      addTo(bySalesperson, order.salespersonName, order.adjustedReceivable, order.adjustedPayable, order.adjustedGrossProfit);
      addTo(byCustomer, order.customerName, order.adjustedReceivable, order.adjustedPayable, order.adjustedGrossProfit);
    }

    const totalReceivable = orders.reduce((sum, order) => sum + order.adjustedReceivable, 0);
    const totalPayable = orders.reduce((sum, order) => sum + order.adjustedPayable, 0);
    const totalGrossProfit = orders.reduce((sum, order) => sum + order.adjustedGrossProfit, 0);

    return {
      scope: "logistics_only",
      note: "利润分析仅统计物流业务，注册、证书、店铺租赁、公司注销等服务类业务已排除。",
      totals: {
        orderCount: orders.length,
        totalReceivable,
        totalPayable,
        totalGrossProfit,
        grossProfitRate: rate(totalGrossProfit, totalReceivable)
      },
      byBusinessType: values(byBusinessType),
      bySalesperson: values(bySalesperson),
      byCustomer: values(byCustomer),
      rows: orders.map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        customerOrderNo: order.customerOrderNo,
        customerName: order.customerName,
        salespersonName: order.salespersonName,
        businessType: order.businessType,
        adjustedReceivable: order.adjustedReceivable,
        adjustedPayable: order.adjustedPayable,
        adjustedGrossProfit: order.adjustedGrossProfit,
        adjustedGrossProfitRate: order.adjustedGrossProfitRate,
        calculationNote: order.calculationNote
      }))
    };
  }
};
