import { financeRepository } from "../repositories/finance.repository.js";

function safeRate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

function previousMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function previousYearMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year - 1}-${String(monthNumber).padStart(2, "0")}`;
}

export const financeService = {
  async listLedger(month?: string) {
    const selectedMonth = month ?? (await financeRepository.getLatestSummary())?.month;
    return financeRepository.listOrders(selectedMonth);
  },

  getSummary(month?: string) {
    return financeRepository.getLatestSummary(month);
  },

  async getDashboard(month?: string) {
    const summary = await financeRepository.getLatestSummary(month);
    const selectedMonth = month ?? summary?.month;
    const [orders, summaries] = await Promise.all([
      financeRepository.listOrders(selectedMonth),
      financeRepository.listSummaries()
    ]);

    const logisticsOrders = orders.filter((order) => !order.isServiceBusiness);
    const serviceOrders = orders.filter((order) => order.isServiceBusiness);
    const businessMap = new Map<string, {
      businessType: string;
      orderCount: number;
      receivable: number;
      payable: number;
      grossProfit: number;
      logisticsProfit: number;
    }>();

    for (const order of orders) {
      const item = businessMap.get(order.businessType) ?? {
        businessType: order.businessType,
        orderCount: 0,
        receivable: 0,
        payable: 0,
        grossProfit: 0,
        logisticsProfit: 0
      };
      item.orderCount += 1;
      item.receivable += order.adjustedReceivable;
      item.payable += order.adjustedPayable;
      item.grossProfit += order.adjustedGrossProfit;
      if (!order.isServiceBusiness) {
        item.logisticsProfit += order.adjustedGrossProfit;
      }
      businessMap.set(order.businessType, item);
    }

    const selected = selectedMonth ? summaries.find((item) => item.month === selectedMonth) : summaries.at(-1);
    const previous = selectedMonth ? summaries.find((item) => item.month === previousMonth(selectedMonth)) : undefined;
    const previousYear = selectedMonth ? summaries.find((item) => item.month === previousYearMonth(selectedMonth)) : undefined;

    return {
      summary,
      orderCount: orders.length,
      logisticsOrderCount: logisticsOrders.length,
      serviceOrderCount: serviceOrders.length,
      logisticsProfit: logisticsOrders.reduce((sum, order) => sum + order.adjustedGrossProfit, 0),
      serviceProfit: serviceOrders.reduce((sum, order) => sum + order.adjustedGrossProfit, 0),
      businessSummary: Array.from(businessMap.values())
        .map((item) => ({
          ...item,
          grossProfitRate: safeRate(item.grossProfit, item.receivable)
        }))
        .sort((a, b) => b.grossProfit - a.grossProfit),
      monthlyTrend: summaries.map((item) => ({
        month: item.month,
        receivable: item.totalReceivable,
        payable: item.totalPayable,
        grossProfit: item.totalGrossProfit,
        grossProfitRate: item.grossProfitRate,
        commission: item.totalCommission
      })),
      comparison: {
        month: selected?.month ?? selectedMonth ?? null,
        momGrossProfit: percentChange(selected?.totalGrossProfit ?? 0, previous?.totalGrossProfit ?? 0),
        yoyGrossProfit: percentChange(selected?.totalGrossProfit ?? 0, previousYear?.totalGrossProfit ?? 0),
        momReceivable: percentChange(selected?.totalReceivable ?? 0, previous?.totalReceivable ?? 0),
        yoyReceivable: percentChange(selected?.totalReceivable ?? 0, previousYear?.totalReceivable ?? 0)
      }
    };
  },

  getAgentRules() {
    return {
      agentName: "FP&A Analyst Agent：跨境物流月度财务分析",
      path: "agents/finance/finance-fpa-analyst.md",
      status: "configured",
      coreRules: [
        "前端只上传 Excel，所有解析、聚合、风险识别和提成计算都在后端完成。",
        "订单以运单号聚合，所有前端明细表保留订单编号。",
        "利润分析仅统计物流业务，不包含注册、证书、店铺租赁等服务类业务。",
        "利润率低于 10% 标记高风险，高于 50% 标记异常高利润。",
        "注册、EAC 证书、公司注销、店铺租赁等服务类业务单独进入主管确认。"
      ]
    };
  }
};
