import { agencyRuntimeProfile } from "../config/agent.registry.js";
import { selfHostedStack } from "../config/selfhosted-stack.js";
import { prisma } from "../prisma/client.js";
import { financeRepository } from "../repositories/finance.repository.js";
import { payableService } from "./payable.service.js";
import type { FinanceOrder } from "@prisma/client";
import { allFinanceAccess, ownerAccessWhere, scopedFinanceOrderWhere } from "../security/finance-access.js";
import type { FinanceAccessScope } from "../security/finance-access.js";
import { addNumbers, safeRate, sumNumbers } from "../utils/number.js";

const defaultParameterRules = [
  {
    ruleKey: "exchange_rate_policy",
    ruleGroup: "currency",
    label: "汇率计算规则",
    value: { cnyRate: 1, usdRate: 6.85, useExternalApi: false },
    description: "严格执行原始表格标注汇率：1 为人民币；美金/美元/USD/汇率未出按 6.85；其余按表格标注。"
  },
  {
    ruleKey: "risk_profit_rate_threshold",
    ruleGroup: "risk",
    label: "毛利率风险阈值",
    value: { highRiskBelow: 0.1, abnormalHighAbove: 0.5 },
    description: "毛利率低于 10% 标记高风险；高于 50% 标记异常高利润并复核成本漏录。"
  },
  {
    ruleKey: "logistics_commission_tiers",
    ruleGroup: "commission",
    label: "物流提成档位",
    value: [
      { min: 15000, max: 50000, rate: 0.15 },
      { min: 50000, max: 100000, rate: 0.2 },
      { min: 100000, max: 150000, rate: 0.25 },
      { min: 150000, max: null, rate: 0.3 }
    ],
    description: "物流销售代表按自然月毛利区间计算提成比例。"
  },
  {
    ruleKey: "company_customer_commission_rate",
    ruleGroup: "commission",
    label: "公司客户提成比例",
    value: { rate: 0.1 },
    description: "主管调整为公司客户订单后，提成比例按 10%。"
  },
  {
    ruleKey: "service_business_scope",
    ruleGroup: "service",
    label: "注册/服务类业务范围",
    value: ["注册", "注销", "EAC", "COC", "DOC", "证书", "商标", "店铺", "租赁", "财税"],
    description: "服务类业务单独进入主管确认，不进入物流提成口径。"
  }
];

function parseRuleValue(valueJson: string) {
  try {
    return JSON.parse(valueJson);
  } catch {
    return valueJson;
  }
}

export async function ensureDefaultParameterRules() {
  for (const rule of defaultParameterRules) {
    await prisma.parameterRule.upsert({
      where: { ruleKey: rule.ruleKey },
      update: {},
      create: {
        ruleKey: rule.ruleKey,
        ruleGroup: rule.ruleGroup,
        label: rule.label,
        valueJson: JSON.stringify(rule.value),
        description: rule.description
      }
    });
  }
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

function pointChange(current?: number | null, previous?: number | null): number | null {
  if (typeof current !== "number" || typeof previous !== "number") return null;
  return current - previous;
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

function grossProfitByBusinessType(orders: Array<{ businessType: string; adjustedGrossProfit: number }>) {
  const map = new Map<string, number>();
  for (const order of orders) {
    map.set(order.businessType, addNumbers(map.get(order.businessType) ?? 0, order.adjustedGrossProfit));
  }
  return map;
}

function summarizeOrders(month: string, orders: FinanceOrder[], totalCommission = 0) {
  const totalReceivable = sumNumbers(orders.map((order) => order.adjustedReceivable));
  const totalPayable = sumNumbers(orders.map((order) => order.adjustedPayable));
  const totalGrossProfit = sumNumbers(orders.map((order) => order.adjustedGrossProfit));
  return {
    month,
    totalReceivable,
    totalPayable,
    totalReceived: sumNumbers(orders.map((order) => order.receivedAmount)),
    totalPaid: sumNumbers(orders.map((order) => order.paidAmount)),
    totalGrossProfit,
    grossProfitRate: safeRate(totalGrossProfit, totalReceivable),
    totalCommission,
    riskOrderCount: orders.filter((order) => (order.adjustedGrossProfitRate ?? 1) < 0.1 || order.needSupervisorConfirm).length,
    abnormalHighProfitOrderCount: orders.filter((order) => (order.adjustedGrossProfitRate ?? 0) > 0.5).length,
    pendingSupervisorConfirmCount: orders.filter((order) => order.needSupervisorConfirm).length,
    updatedAt: orders.reduce((latest, order) => order.updatedAt > latest ? order.updatedAt : latest, new Date(0))
  };
}

export async function resolveParameterRules(month?: string) {
  await ensureDefaultParameterRules();
  const rows = await prisma.parameterRule.findMany({
    where: { isActive: true },
    include: {
      versions: {
        where: {
          isActive: true,
          ...(month ? { effectiveMonth: { lte: month } } : { id: -1 })
        },
        orderBy: [{ effectiveMonth: "desc" }, { id: "desc" }],
        take: 1
      }
    },
    orderBy: [{ ruleGroup: "asc" }, { id: "asc" }]
  });

  return rows.map((rule) => {
    const version = rule.versions[0];
    const valueJson = version?.valueJson ?? rule.valueJson;
    return {
      id: rule.id,
      ruleKey: rule.ruleKey,
      ruleGroup: rule.ruleGroup,
      label: rule.label,
      value: parseRuleValue(valueJson),
      valueJson,
      description: version?.description ?? rule.description,
      updatedBy: version?.updatedBy ?? rule.updatedBy,
      updatedAt: version?.updatedAt ?? rule.updatedAt,
      effectiveMonth: version?.effectiveMonth ?? null,
      source: version ? "monthly" : "default"
    };
  });
}

export const financeService = {
  async listLedger(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    const selectedMonth = month ?? (await financeRepository.getLatestSummary())?.month;
    return financeRepository.listOrders(selectedMonth, scope);
  },

  async getSummary(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    const persisted = await financeRepository.getLatestSummary(month);
    if (scope.mode === "all") return persisted;
    const selectedMonth = month ?? persisted?.month;
    if (!selectedMonth) return null;
    const [orders, commissions] = await Promise.all([
      financeRepository.listOrders(selectedMonth, scope),
      prisma.commissionRecord.findMany({
        where: { financeOrder: { is: scopedFinanceOrderWhere({ month: selectedMonth }, scope) } }
      })
    ]);
    return summarizeOrders(
      selectedMonth,
      orders,
      sumNumbers(commissions.map((row) => row.manualCommissionAmount ?? row.commissionAmount))
    );
  },

  async listMonths(scope: FinanceAccessScope = allFinanceAccess) {
    if (scope.mode !== "all") {
      const orders = await financeRepository.listOrders(undefined, scope);
      const rows = new Map<string, { month: string; updatedAt: Date; totalReceivable: number; totalGrossProfit: number }>();
      for (const order of orders) {
        const current = rows.get(order.month) ?? {
          month: order.month,
          updatedAt: order.updatedAt,
          totalReceivable: 0,
          totalGrossProfit: 0
        };
        current.updatedAt = current.updatedAt > order.updatedAt ? current.updatedAt : order.updatedAt;
        current.totalReceivable = addNumbers(current.totalReceivable, order.adjustedReceivable);
        current.totalGrossProfit = addNumbers(current.totalGrossProfit, order.adjustedGrossProfit);
        rows.set(order.month, current);
      }
      return { rows: Array.from(rows.values()).sort((left, right) => right.month.localeCompare(left.month)) };
    }

    const [summaries, activeBatches, manualMonths] = await Promise.all([
      financeRepository.listMonths(),
      prisma.importBatch.findMany({
        where: { status: "active" },
        select: {
          month: true,
          updatedAt: true,
          totalReceivable: true,
          totalGrossProfit: true
        },
        orderBy: { month: "desc" }
      }),
      prisma.manualLedgerEntry.findMany({
        distinct: ["month"],
        select: { month: true, updatedAt: true },
        orderBy: [{ month: "desc" }, { updatedAt: "desc" }]
      })
    ]);
    const rows = new Map<string, { month: string; updatedAt: Date; totalReceivable: number; totalGrossProfit: number }>();
    for (const item of [...summaries, ...activeBatches]) {
      const current = rows.get(item.month);
      if (!current || item.updatedAt > current.updatedAt) rows.set(item.month, item);
    }
    for (const item of manualMonths) {
      if (!rows.has(item.month)) rows.set(item.month, { month: item.month, updatedAt: item.updatedAt, totalReceivable: 0, totalGrossProfit: 0 });
    }
    return {
      rows: Array.from(rows.values()).sort((left, right) => right.month.localeCompare(left.month)).map((item) => ({
        month: item.month,
        updatedAt: item.updatedAt,
        totalReceivable: item.totalReceivable,
        totalGrossProfit: item.totalGrossProfit
      }))
    };
  },

  async listParameterRules(month?: string) {
    return { rows: await resolveParameterRules(month) };
  },

  async updateParameterRule(ruleKey: string, payload: { valueJson?: string; description?: string; updatedBy?: string; effectiveMonth?: string }) {
    await ensureDefaultParameterRules();
    const valueJson = payload.valueJson ?? "";
    try {
      JSON.parse(valueJson);
    } catch {
      throw new Error("规则值必须是合法 JSON。");
    }

    const effectiveMonth = payload.effectiveMonth?.trim();
    if (effectiveMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(effectiveMonth)) {
      throw new Error("生效月份格式必须为 YYYY-MM。");
    }

    if (effectiveMonth) {
      const close = await prisma.monthClose.findUnique({ where: { month: effectiveMonth } });
      if (close?.status === "locked") {
        throw new Error(`${effectiveMonth} 已锁账，不能修改该月生效的参数规则。请先由主管解锁并记录原因。`);
      }
      const rule = await prisma.parameterRule.findUnique({ where: { ruleKey } });
      if (!rule) throw new Error(`参数规则不存在：${ruleKey}`);
      const existing = await prisma.parameterRuleVersion.findUnique({
        where: { parameterRuleId_effectiveMonth: { parameterRuleId: rule.id, effectiveMonth } }
      });
      const version = await prisma.$transaction(async (tx) => {
        const saved = await tx.parameterRuleVersion.upsert({
          where: { parameterRuleId_effectiveMonth: { parameterRuleId: rule.id, effectiveMonth } },
          create: {
            parameterRuleId: rule.id,
            effectiveMonth,
            valueJson,
            description: payload.description ?? rule.description,
            updatedBy: payload.updatedBy || "finance-admin"
          },
          update: {
            valueJson,
            description: payload.description,
            isActive: true,
            updatedBy: payload.updatedBy || "finance-admin"
          }
        });
        await tx.actionLog.create({
          data: {
            month: effectiveMonth,
            entityType: "parameter_rule",
            entityId: ruleKey,
            action: "update_parameter_rule_version",
            operator: payload.updatedBy || "finance-admin",
            beforeJson: existing ? JSON.stringify(existing) : null,
            afterJson: JSON.stringify(saved),
            payloadJson: JSON.stringify({ effectiveMonth })
          }
        });
        return saved;
      });
      return {
        id: rule.id,
        ruleKey: rule.ruleKey,
        ruleGroup: rule.ruleGroup,
        label: rule.label,
        value: parseRuleValue(version.valueJson),
        valueJson: version.valueJson,
        description: version.description,
        updatedBy: version.updatedBy,
        updatedAt: version.updatedAt,
        effectiveMonth: version.effectiveMonth,
        source: "monthly"
      };
    }

    const lockedMonth = await prisma.monthClose.findFirst({ where: { status: "locked" }, orderBy: { updatedAt: "desc" } });
    if (lockedMonth) {
      throw new Error(`${lockedMonth.month} 已锁账，不能修改全局默认规则。请使用按月生效规则，或先由主管解锁。`);
    }
    const before = await prisma.parameterRule.findUnique({ where: { ruleKey } });
    const rule = await prisma.$transaction(async (tx) => {
      const saved = await tx.parameterRule.update({
        where: { ruleKey },
        data: {
          valueJson,
          description: payload.description,
          updatedBy: payload.updatedBy || "finance-admin"
        }
      });
      await tx.actionLog.create({
        data: {
          entityType: "parameter_rule",
          entityId: ruleKey,
          action: "update_parameter_rule_default",
          operator: payload.updatedBy || "finance-admin",
          beforeJson: before ? JSON.stringify(before) : null,
          afterJson: JSON.stringify(saved)
        }
      });
      return saved;
    });

    return {
      id: rule.id,
      ruleKey: rule.ruleKey,
      ruleGroup: rule.ruleGroup,
      label: rule.label,
      value: parseRuleValue(rule.valueJson),
      valueJson: rule.valueJson,
      description: rule.description,
      updatedBy: rule.updatedBy,
      updatedAt: rule.updatedAt,
      effectiveMonth: null,
      source: "default"
    };
  },

  async getDashboard(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    const persistedSummary = await financeRepository.getLatestSummary(month);
    const selectedMonth = month ?? persistedSummary?.month;
    const [orders, persistedSummaries, commissions, confirmationDocuments, risks, historyOrders, historyCommissions] = await Promise.all([
      financeRepository.listOrders(selectedMonth, scope),
      scope.mode === "all" ? financeRepository.listSummaries() : Promise.resolve([]),
      prisma.commissionRecord.findMany({
        where: { financeOrder: { is: scopedFinanceOrderWhere(selectedMonth ? { month: selectedMonth } : {}, scope) } }
      }),
      prisma.confirmationDocument.findMany({
        where: {
          ...(selectedMonth ? { month: selectedMonth } : {}),
          documentType: "logistics_commission",
          ...ownerAccessWhere(scope)
        }
      }),
      prisma.riskRecord.findMany({
        where: { financeOrder: { is: scopedFinanceOrderWhere(selectedMonth ? { month: selectedMonth } : {}, scope) } },
        include: { financeOrder: true }
      }),
      scope.mode === "all" ? Promise.resolve([]) : financeRepository.listOrders(undefined, scope),
      scope.mode === "all" ? Promise.resolve([]) : prisma.commissionRecord.findMany({
        where: { financeOrder: { is: scopedFinanceOrderWhere({}, scope) } },
        include: { financeOrder: { select: { month: true } } }
      })
    ]);

    const summaries = scope.mode === "all"
      ? persistedSummaries
      : Array.from(historyOrders.reduce((groups, order) => {
          groups.set(order.month, [...(groups.get(order.month) ?? []), order]);
          return groups;
        }, new Map<string, FinanceOrder[]>()).entries())
        .map(([summaryMonth, monthOrders]) => summarizeOrders(
          summaryMonth,
          monthOrders,
          historyCommissions
            .filter((row) => row.financeOrder.month === summaryMonth)
            .reduce((sum, row) => addNumbers(sum, row.manualCommissionAmount ?? row.commissionAmount), 0)
        ))
        .sort((left, right) => left.month.localeCompare(right.month));
    const summary = scope.mode === "all"
      ? persistedSummary
      : selectedMonth
        ? summaries.find((item) => item.month === selectedMonth) ?? summarizeOrders(selectedMonth, orders)
        : null;

    const logisticsOrders = orders.filter((order) => !order.isServiceBusiness);
    const serviceOrders = orders.filter((order) => order.isServiceBusiness);
    const payableDashboard = await payableService.listPayables(selectedMonth, scope);
    const logisticsPayableTotal = payableDashboard.totals.totalPayable;
    const businessMap = new Map<string, {
      businessType: string;
      category: "logistics" | "service";
      orderCount: number;
      receivable: number;
      payable: number;
      grossProfit: number;
      logisticsProfit: number;
    }>();
    const salespersonMap = new Map<string, {
      salespersonName: string;
      orderCount: number;
      receivable: number;
      grossProfit: number;
      commission: number;
      highRiskOrderCount: number;
      signatureStatus: string;
    }>();
    const customerMap = new Map<string, {
      customerName: string;
      orderCount: number;
      receivable: number;
      payable: number;
      grossProfit: number;
      grossProfitRate: number | null;
      receivableRatio: number;
      profitRatio: number;
    }>();
    const commissionBySalesperson = new Map<string, number>();
    const signatureByOwner = new Map(confirmationDocuments.map((document) => [document.ownerName, document]));

    for (const commission of commissions) {
      commissionBySalesperson.set(
        commission.salespersonName,
        (commissionBySalesperson.get(commission.salespersonName) ?? 0) + (commission.manualCommissionAmount ?? commission.commissionAmount)
      );
    }

    for (const order of orders) {
      const category = order.isServiceBusiness ? "service" : "logistics";
      const businessKey = `${category}:${order.businessType}`;
      const item = businessMap.get(businessKey) ?? {
        businessType: order.businessType,
        category,
        orderCount: 0,
        receivable: 0,
        payable: 0,
        grossProfit: 0,
        logisticsProfit: 0
      };
      item.orderCount += 1;
      item.receivable = addNumbers(item.receivable, order.adjustedReceivable);
      item.payable = addNumbers(item.payable, order.adjustedPayable);
      item.grossProfit = addNumbers(item.grossProfit, order.adjustedGrossProfit);
      if (!order.isServiceBusiness) item.logisticsProfit = addNumbers(item.logisticsProfit, order.adjustedGrossProfit);
      businessMap.set(businessKey, item);

      if (!order.isServiceBusiness) {
        const salesperson = salespersonMap.get(order.salespersonName) ?? {
          salespersonName: order.salespersonName,
          orderCount: 0,
          receivable: 0,
          grossProfit: 0,
          commission: 0,
          highRiskOrderCount: 0,
          signatureStatus: "not_generated"
        };
        salesperson.orderCount += 1;
        salesperson.receivable = addNumbers(salesperson.receivable, order.adjustedReceivable);
        salesperson.grossProfit = addNumbers(salesperson.grossProfit, order.adjustedGrossProfit);
        salesperson.highRiskOrderCount += order.needSupervisorConfirm || (order.adjustedGrossProfitRate ?? 1) < 0.1 ? 1 : 0;
        salespersonMap.set(order.salespersonName, salesperson);

        const customerName = order.customerName || order.customerOrderNo || "待主管确认";
        const customer = customerMap.get(customerName) ?? {
          customerName,
          orderCount: 0,
          receivable: 0,
          payable: 0,
          grossProfit: 0,
          grossProfitRate: null,
          receivableRatio: 0,
          profitRatio: 0
        };
        customer.orderCount += 1;
        customer.receivable = addNumbers(customer.receivable, order.adjustedReceivable);
        customer.payable = addNumbers(customer.payable, order.adjustedPayable);
        customer.grossProfit = addNumbers(customer.grossProfit, order.adjustedGrossProfit);
        customer.grossProfitRate = safeRate(customer.grossProfit, customer.receivable);
        customerMap.set(customerName, customer);
      }
    }

    for (const salesperson of salespersonMap.values()) {
      const document = signatureByOwner.get(salesperson.salespersonName);
      salesperson.commission = commissionBySalesperson.get(salesperson.salespersonName) ?? 0;
      salesperson.signatureStatus = document?.supervisorStatus === "confirmed"
        ? "confirmed"
        : document?.signatureStatus === "signed"
          ? "signed"
          : document
            ? "pending"
            : "not_generated";
    }

    const riskOverview = {
      highRiskCount: risks.filter((risk) => risk.riskLevel === "high").length,
      mediumRiskCount: risks.filter((risk) => risk.riskLevel === "medium").length,
      negativeProfitCount: orders.filter((order) => order.adjustedGrossProfit < 0).length,
      lowProfitUnderFiveCount: orders.filter((order) => (order.adjustedGrossProfitRate ?? 1) < 0.05).length,
      abnormalHighProfitCount: risks.filter((risk) => risk.riskType === "abnormal_high_profit").length,
      exchangeRateMissingCount: risks.filter((risk) => risk.riskType === "exchange_rate_missing").length,
      costMissingCount: risks.filter((risk) => risk.riskType === "cost_missing").length,
      openRiskCount: risks.filter((risk) => risk.status !== "reviewed").length,
      reviewedRiskCount: risks.filter((risk) => risk.status === "reviewed").length,
      topRiskReason: risks[0]?.riskReasons ?? null
    };
    const logisticsReceivable = sumNumbers(logisticsOrders.map((order) => order.adjustedReceivable));
    const logisticsGrossProfit = sumNumbers(logisticsOrders.map((order) => order.adjustedGrossProfit));
    const customerProfitSummary = Array.from(customerMap.values())
      .map((item) => ({
        ...item,
        receivableRatio: safeRate(item.receivable, logisticsReceivable) ?? 0,
        profitRatio: safeRate(item.grossProfit, logisticsGrossProfit) ?? 0
      }))
      .sort((a, b) => b.grossProfit - a.grossProfit);

    const selected = selectedMonth ? summaries.find((item) => item.month === selectedMonth) : summaries.at(-1);
    const previous = selectedMonth ? summaries.find((item) => item.month === previousMonth(selectedMonth)) : undefined;
    const previousYear = selectedMonth ? summaries.find((item) => item.month === previousYearMonth(selectedMonth)) : undefined;
    const [previousOrderCount, previousYearOrderCount, previousOrders, previousYearOrders] = await Promise.all([
      selectedMonth ? prisma.financeOrder.count({ where: scopedFinanceOrderWhere({ month: previousMonth(selectedMonth) }, scope) }) : Promise.resolve(0),
      selectedMonth ? prisma.financeOrder.count({ where: scopedFinanceOrderWhere({ month: previousYearMonth(selectedMonth) }, scope) }) : Promise.resolve(0),
      selectedMonth ? financeRepository.listOrders(previousMonth(selectedMonth), scope) : Promise.resolve([]),
      selectedMonth ? financeRepository.listOrders(previousYearMonth(selectedMonth), scope) : Promise.resolve([])
    ]);
    const previousBusinessProfit = grossProfitByBusinessType(previousOrders);
    const previousYearBusinessProfit = grossProfitByBusinessType(previousYearOrders);

    return {
      summary,
      orderCount: orders.length,
      logisticsOrderCount: logisticsOrders.length,
      serviceOrderCount: serviceOrders.length,
      logisticsProfit: sumNumbers(logisticsOrders.map((order) => order.adjustedGrossProfit)),
      serviceProfit: sumNumbers(serviceOrders.map((order) => order.adjustedGrossProfit)),
      businessSummary: Array.from(businessMap.values())
        .map((item) => ({
          ...item,
          grossProfitRate: safeRate(item.grossProfit, item.receivable),
          momGrossProfitChange: percentChange(item.grossProfit, previousBusinessProfit.get(item.businessType) ?? 0),
          yoyGrossProfitChange: percentChange(item.grossProfit, previousYearBusinessProfit.get(item.businessType) ?? 0)
        }))
        .sort((a, b) => b.grossProfit - a.grossProfit),
      salespersonSummary: Array.from(salespersonMap.values())
        .sort((a, b) => b.grossProfit - a.grossProfit)
        .map((item, index) => ({ ...item, rank: index + 1 })),
      supplierPayableSummary: payableDashboard.supplierAging
        .map((item) => ({
          ...item,
          ratio: safeRate(item.payable, logisticsPayableTotal) ?? 0
        }))
        .sort((a, b) => b.payable - a.payable),
      customerProfitSummary,
      riskOverview,
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
        yoyReceivable: percentChange(selected?.totalReceivable ?? 0, previousYear?.totalReceivable ?? 0),
        momPayable: percentChange(selected?.totalPayable ?? 0, previous?.totalPayable ?? 0),
        yoyPayable: percentChange(selected?.totalPayable ?? 0, previousYear?.totalPayable ?? 0),
        momGrossProfitRate: pointChange(selected?.grossProfitRate, previous?.grossProfitRate),
        yoyGrossProfitRate: pointChange(selected?.grossProfitRate, previousYear?.grossProfitRate),
        momOrderCount: percentChange(orders.length, previousOrderCount),
        yoyOrderCount: percentChange(orders.length, previousYearOrderCount),
        momCommission: percentChange(selected?.totalCommission ?? 0, previous?.totalCommission ?? 0),
        yoyCommission: percentChange(selected?.totalCommission ?? 0, previousYear?.totalCommission ?? 0),
        momRiskOrderCount: percentChange(selected?.riskOrderCount ?? 0, previous?.riskOrderCount ?? 0),
        yoyRiskOrderCount: percentChange(selected?.riskOrderCount ?? 0, previousYear?.riskOrderCount ?? 0)
      }
    };
  },

  getAgentRules() {
    return {
      agentName: "FP&A Analyst + Financial Analyst + Testing Agents",
      path: "external_refs/agency-agents-main",
      status: "configured",
      agency: agencyRuntimeProfile,
      selfHostedStack,
      coreRules: [
        "前端只上传 Excel，所有解析、聚合、风险识别和提成计算都在后端完成。",
        "订单以运单号聚合，所有前端明细表保留订单编号和原始订单号。",
        "Excel 导入自动映射表头，返回字段映射、模板差异和 agent 审计信息。",
        "利润分析区分总口径、物流业务口径、注册/证书/店铺服务类口径。",
        "利润率低于 10% 标记高风险，高于 50% 标记异常高利润。",
        "注册、EAC 证书、公司注销、店铺租赁等服务类业务单独进入主管确认。",
        "后端 API、数据库落库和页面访问必须通过 testing agents 的证据式验证。"
      ]
    };
  }
};
