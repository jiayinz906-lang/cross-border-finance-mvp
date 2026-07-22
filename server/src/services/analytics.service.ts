import type { FinanceOrder } from "@prisma/client";
import { prisma } from "../prisma/client.js";
import { resolveMonth } from "../utils/month.js";
import { allFinanceAccess, scopedFinanceOrderWhere } from "../security/finance-access.js";
import type { FinanceAccessScope } from "../security/finance-access.js";

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
  if (type.includes("空运") && type.includes("白关")) return "air_white";
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

type PerformanceOverride = {
  orderCount: number | null;
  baseCount: number | null;
  rate: number | null;
};

function overrideKey(operatorName: string, category: string) {
  return `${operatorName}::${category}`;
}

function asOptionalNonNegativeInteger(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${field} must be a non-negative integer.`);
  return parsed;
}

function asOptionalNonNegativeNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} must be a non-negative number.`);
  return Math.round(parsed * 100) / 100;
}

function performanceBracket(key: string, orderCount: number): PerformanceBracket {
  if (key === "air_white") return { baseCount: 0, rate: 50, label: "按实际票数计发（50 元/票）" };
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

function operatorRows(operatorName: string, orders: FinanceOrder[], overrides: Map<string, PerformanceOverride>) {
  const rules = [
    {
      key: "air_white",
      orderType: "空运白关",
      note: "按客服代表当月导入 Excel 的空运白关实际票数计发：固定 50 元/票"
    },
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
  const grossProfits = new Map<string, number>();
  for (const order of orders) {
    const key = category(order);
    if (key === "other") continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    grossProfits.set(key, (grossProfits.get(key) ?? 0) + order.adjustedGrossProfit);
  }

  const rows = rules.map((rule, index) => {
    const rawOrderCount = counts.get(rule.key) ?? 0;
    const rawGrossProfit = Math.round((grossProfits.get(rule.key) ?? 0) * 100) / 100;
    const override = overrides.get(overrideKey(operatorName, rule.key));
    const hasFixedAirWhiteRule = rule.key === "air_white";
    const orderCount = override?.orderCount ?? rawOrderCount;
    const bracket = performanceBracket(rule.key, orderCount);
    const baseCount = hasFixedAirWhiteRule ? 0 : (override?.baseCount ?? bracket.baseCount);
    const rate = hasFixedAirWhiteRule ? 50 : (override?.rate ?? bracket.rate);
    const commissionOrderCount = Math.max(orderCount - baseCount, 0);
    const manuallyAdjusted = override?.orderCount !== null && override?.orderCount !== undefined
      || (!hasFixedAirWhiteRule && override?.baseCount !== null && override?.baseCount !== undefined)
      || (!hasFixedAirWhiteRule && override?.rate !== null && override?.rate !== undefined);
    return {
      id: `${operatorName}-${rule.key}`,
      category: rule.key,
      operatorName,
      orderType: rule.orderType,
      rawOrderCount,
      rawGrossProfit,
      orderCount,
      baseCount,
      commissionOrderCount,
      rate,
      rateUnit: "元/票",
      calculationMode: "ticket",
      commissionAmount: Math.round(commissionOrderCount * rate * 100) / 100,
      note: `${rule.note}；Excel 原始票数：${rawOrderCount}；${bracket.label}${manuallyAdjusted ? "；已手工调整绩效参数" : ""}`,
      bracketLabel: manuallyAdjusted ? `${bracket.label}（手工调整）` : bracket.label,
      rowSpan: index === 0 ? rules.length : 0
    };
  });
  const totalCommission = rows.reduce((sum, row) => sum + row.commissionAmount, 0);
  return { operatorName, rows, totalCommission, payablePerformance: Math.round(totalCommission * 100) / 100 };
}

export const analyticsService = {
  async customerProfit(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    month = resolveMonth(month);
    const orders = await prisma.financeOrder.findMany({ where: scopedFinanceOrderWhere({ month, isServiceBusiness: false }, scope) });
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

  async operatorPerformance(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    month = resolveMonth(month);
    const overrides = await prisma.operatorPerformanceOverride.findMany({ where: { month } });
    const overrideMap = new Map<string, PerformanceOverride>(
      overrides.map((row) => [overrideKey(row.operatorName, row.category), row])
    );
    const orders = await prisma.financeOrder.findMany({
      where: scopedFinanceOrderWhere({
        month,
        importBatch: { is: { status: "active" } }
      }, scope)
    });
    const groups = new Map<string, FinanceOrder[]>();
    for (const order of orders) {
      const operatorName = customerServiceName(order);
      groups.set(operatorName, [...(groups.get(operatorName) ?? []), order]);
    }
    return Array.from(groups.entries())
      .map(([operatorName, groupOrders]) => operatorRows(operatorName, groupOrders, overrideMap))
      .sort((a, b) => b.totalCommission - a.totalCommission);
  },

  async operatorPerformanceWithSettings(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    month = resolveMonth(month);
    const [rows, setting] = await Promise.all([
      this.operatorPerformance(month, scope),
      prisma.operatorPerformanceMonthSetting.findUnique({ where: { month } })
    ]);
    return {
      rows,
      payoutNote: setting?.payoutNote || `随 ${month} 薪资一起发放`
    };
  },

  async updateOperatorPerformanceOverride(input: {
    month: string;
    operatorName: string;
    category: string;
    orderCount?: unknown;
    baseCount?: unknown;
    rate?: unknown;
    updatedBy: string;
  }) {
    const allowedCategories = new Set(["air_white", "white", "grey", "company", "eac", "trademark"]);
    if (!allowedCategories.has(input.category)) throw new Error("Unsupported operator performance category.");
    const close = await prisma.monthClose.findUnique({ where: { month: input.month } });
    if (close?.status === "locked") throw new Error("Locked month cannot change operator performance.");
    const fixedAirWhiteRule = input.category === "air_white";
    const overrideValues = {
      orderCount: asOptionalNonNegativeInteger(input.orderCount, "orderCount"),
      baseCount: fixedAirWhiteRule ? null : asOptionalNonNegativeInteger(input.baseCount, "baseCount"),
      rate: fixedAirWhiteRule ? null : asOptionalNonNegativeNumber(input.rate, "rate")
    };
    await prisma.operatorPerformanceOverride.upsert({
      where: { month_operatorName_category: { month: input.month, operatorName: input.operatorName, category: input.category } },
      create: {
        month: input.month,
        operatorName: input.operatorName,
        category: input.category,
        ...overrideValues,
        updatedBy: input.updatedBy
      },
      update: {
        ...overrideValues,
        updatedBy: input.updatedBy
      }
    });
    await prisma.actionLog.create({
      data: {
        month: input.month,
        entityType: "operator_performance_override",
        entityId: `${input.operatorName}:${input.category}`,
        action: "update_operator_performance_override",
        operator: input.updatedBy,
        payloadJson: JSON.stringify(overrideValues)
      }
    });
    return this.operatorPerformanceWithSettings(input.month);
  },

  async updateOperatorPerformancePayoutNote(month: string, payoutNote: string, updatedBy: string) {
    const normalized = String(payoutNote ?? "").trim();
    if (!normalized) throw new Error("Payout note is required.");
    const close = await prisma.monthClose.findUnique({ where: { month } });
    if (close?.status === "locked") throw new Error("Locked month cannot change operator performance.");
    await prisma.operatorPerformanceMonthSetting.upsert({
      where: { month },
      create: { month, payoutNote: normalized.slice(0, 240), updatedBy },
      update: { payoutNote: normalized.slice(0, 240), updatedBy }
    });
    await prisma.actionLog.create({
      data: {
        month,
        entityType: "operator_performance_setting",
        entityId: month,
        action: "update_operator_performance_payout_note",
        operator: updatedBy,
        payloadJson: JSON.stringify({ payoutNote: normalized.slice(0, 240) })
      }
    });
    return this.operatorPerformanceWithSettings(month);
  }
};
