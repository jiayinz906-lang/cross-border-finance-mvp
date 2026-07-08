import type { FinanceOrder } from "@prisma/client";
import { prisma } from "../prisma/client.js";

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function compactRows<T extends { receivable: number; payable: number; grossProfit: number; orderCount: number; customerName: string }>(
  rows: T[],
  sortKey: "receivable" | "grossProfit"
) {
  const sorted = [...rows].sort((a, b) => b[sortKey] - a[sortKey]);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6);
  if (!rest.length) return top;
  const other = rest.reduce((sum, row) => ({
    customerName: "其余客户",
    receivable: sum.receivable + row.receivable,
    payable: sum.payable + row.payable,
    grossProfit: sum.grossProfit + row.grossProfit,
    grossProfitRate: null as number | null,
    orderCount: sum.orderCount + row.orderCount
  }), { customerName: "其余客户", receivable: 0, payable: 0, grossProfit: 0, grossProfitRate: null as number | null, orderCount: 0 });
  other.grossProfitRate = rate(other.grossProfit, other.receivable);
  return [...top, other];
}

function category(order: FinanceOrder) {
  const type = order.businessType;
  if (type.includes("白关") || type.includes("铁路")) return "white";
  if (type.includes("灰关")) return "grey";
  if (type.includes("公司")) return "company";
  if (type.includes("EAC") || type.includes("证书")) return "eac";
  if (type.includes("商标")) return "trademark";
  return "other";
}

function operatorRows(operatorName: string, orders: FinanceOrder[]) {
  const rules = [
    { key: "white", orderType: "汽运白关、铁路白关", baseCount: 9, rate: (count: number) => count >= 11 ? 80 : 50 },
    { key: "grey", orderType: "物流灰关", baseCount: 50, rate: (count: number) => count >= 71 ? 20 : 10 },
    { key: "company", orderType: "公司注册", baseCount: 0, rate: () => 100 },
    { key: "eac", orderType: "EAC注册", baseCount: 0, rate: () => 50 },
    { key: "trademark", orderType: "商标注册", baseCount: 0, rate: () => 50 }
  ];
  const counts = new Map<string, number>();
  for (const order of orders) counts.set(category(order), (counts.get(category(order)) ?? 0) + 1);

  const rows = rules.map((rule) => {
    const orderCount = counts.get(rule.key) ?? 0;
    const commissionOrderCount = orderCount - rule.baseCount;
    const pieceRate = rule.rate(orderCount);
    return {
      operatorName,
      orderType: rule.orderType,
      orderCount,
      baseCount: rule.baseCount,
      commissionOrderCount,
      rate: pieceRate,
      commissionAmount: Math.max(commissionOrderCount, 0) * pieceRate
    };
  });
  const totalCommission = rows.reduce((sum, row) => sum + row.commissionAmount, 0);
  return { operatorName, rows, totalCommission, payablePerformance: Math.round(totalCommission * 0.8) };
}

export const analyticsService = {
  async customerProfit(month = "2026-06") {
    const orders = await prisma.financeOrder.findMany({ where: { month } });
    const map = new Map<string, { customerName: string; receivable: number; payable: number; grossProfit: number; grossProfitRate: number | null; orderCount: number }>();
    for (const order of orders) {
      const customerName = order.customerName || order.customerOrderNo || "待主管确认";
      const row = map.get(customerName) ?? { customerName, receivable: 0, payable: 0, grossProfit: 0, grossProfitRate: null, orderCount: 0 };
      row.receivable += order.adjustedReceivable;
      row.payable += order.adjustedPayable;
      row.grossProfit += order.adjustedGrossProfit;
      row.orderCount += 1;
      row.grossProfitRate = rate(row.grossProfit, row.receivable);
      map.set(customerName, row);
    }
    const rows = Array.from(map.values());
    return {
      rows,
      receivableRank: compactRows(rows, "receivable"),
      profitRank: compactRows(rows, "grossProfit")
    };
  },

  async operatorPerformance(month = "2026-06") {
    const orders = await prisma.financeOrder.findMany({ where: { month } });
    const groups = new Map<string, FinanceOrder[]>();
    for (const order of orders) {
      const operatorName = order.salespersonName || "待主管确认";
      groups.set(operatorName, [...(groups.get(operatorName) ?? []), order]);
    }
    return Array.from(groups.entries())
      .map(([operatorName, groupOrders]) => operatorRows(operatorName, groupOrders))
      .sort((a, b) => b.totalCommission - a.totalCommission);
  }
};
