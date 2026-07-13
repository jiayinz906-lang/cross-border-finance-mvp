import type { FinanceOrder } from "@prisma/client";
import { prisma } from "../prisma/client.js";

type CustomerRow = {
  customerName: string;
  receivable: number;
  payable: number;
  grossProfit: number;
  grossProfitRate: number | null;
  orderCount: number;
};

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function compactRows(rows: CustomerRow[], sortKey: "receivable" | "grossProfit") {
  const sorted = [...rows].sort((a, b) => b[sortKey] - a[sortKey]);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6);
  if (!rest.length) return top;

  const other = rest.reduce<CustomerRow>((sum, row) => ({
    customerName: "其余客户",
    receivable: sum.receivable + row.receivable,
    payable: sum.payable + row.payable,
    grossProfit: sum.grossProfit + row.grossProfit,
    grossProfitRate: null,
    orderCount: sum.orderCount + row.orderCount
  }), { customerName: "其余客户", receivable: 0, payable: 0, grossProfit: 0, grossProfitRate: null, orderCount: 0 });
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

function customerServiceName(order: FinanceOrder) {
  return order.customerServiceName || order.salespersonName || "待主管确认";
}

type PerformanceBracket = {
  baseCount: number;
  rate: number;
  label: string;
};

function performanceBracket(key: string, orderCount: number): PerformanceBracket {
  if (key === "white") {
    if (orderCount <= 9) return { baseCount: 9, rate: 0, label: "基础操作量内（0-9 票）" };
    if (orderCount <= 10) return { baseCount: 9, rate: 50, label: "首档（10 票，50 元/票）" };
    return { baseCount: 9, rate: 80, label: "第二档（11 票及以上，80 元/票）" };
  }
  if (key === "grey") {
    if (orderCount <= 50) return { baseCount: 50, rate: 0, label: "基础操作量内（0-50 票）" };
    if (orderCount <= 70) return { baseCount: 50, rate: 10, label: "第一档（51-70 票，10 元/票）" };
    return { baseCount: 50, rate: 20, label: "第二档（71 票及以上，20 元/票）" };
  }
  if (key === "company") return { baseCount: 0, rate: 100, label: "按完成单计发（100 元/票）" };
  return { baseCount: 0, rate: 50, label: "按完成单计发（50 元/票）" };
}

function operatorRows(operatorName: string, orders: FinanceOrder[]) {
  const rules = [
    {
      key: "white",
      orderType: "汽运白关、铁路白关",
      note: "其他客户1-10票发放50元/票；11票以上发放80元/票；基础操作量不拿提成"
    },
    {
      key: "grey",
      orderType: "物流灰关",
      note: "51-70票10元/票；71-100票20元/票"
    },
    {
      key: "company",
      orderType: "公司注册",
      note: "按照每笔工单完成，发放100元/票"
    },
    {
      key: "eac",
      orderType: "EAC注册",
      note: "按照每笔工单完成，发放50元/票"
    },
    {
      key: "trademark",
      orderType: "商标注册",
      note: "按照每笔工单完成，发放50元/票"
    }
  ];

  const counts = new Map<string, number>();
  for (const order of orders) {
    const key = category(order);
    if (key === "other") continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const rows = rules.map((rule, index) => {
    const orderCount = counts.get(rule.key) ?? 0;
    const bracket = performanceBracket(rule.key, orderCount);
    const commissionOrderCount = Math.max(orderCount - bracket.baseCount, 0);
    return {
      id: `${operatorName}-${rule.key}`,
      operatorName,
      orderType: rule.orderType,
      orderCount,
      baseCount: bracket.baseCount,
      commissionOrderCount,
      rate: bracket.rate,
      commissionAmount: commissionOrderCount * bracket.rate,
      note: `${rule.note}；${bracket.label}`,
      bracketLabel: bracket.label,
      rowSpan: index === 0 ? rules.length : 0
    };
  });
  const totalCommission = rows.reduce((sum, row) => sum + row.commissionAmount, 0);
  return { operatorName, rows, totalCommission, payablePerformance: Math.round(totalCommission * 100) / 100 };
}

export const analyticsService = {
  async customerProfit(month = "2026-06") {
    const orders = await prisma.financeOrder.findMany({ where: { month, isServiceBusiness: false } });
    const map = new Map<string, CustomerRow>();
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
    const orders = await prisma.financeOrder.findMany({
      where: {
        month,
        importBatch: { is: { status: "active" } }
      }
    });
    const groups = new Map<string, FinanceOrder[]>();
    for (const order of orders) {
      const operatorName = customerServiceName(order);
      groups.set(operatorName, [...(groups.get(operatorName) ?? []), order]);
    }
    return Array.from(groups.entries())
      .map(([operatorName, groupOrders]) => operatorRows(operatorName, groupOrders))
      .sort((a, b) => b.totalCommission - a.totalCommission);
  }
};
