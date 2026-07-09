import { agencyRuntimeProfile } from "../config/agent.registry.js";
import { selfHostedStack } from "../config/selfhosted-stack.js";
import { prisma } from "../prisma/client.js";
import { financeRepository } from "../repositories/finance.repository.js";

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

async function ensureDefaultParameterRules() {
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

  async listMonths() {
    const rows = await financeRepository.listMonths();
    return {
      rows: rows.map((item) => ({
        month: item.month,
        updatedAt: item.updatedAt,
        totalReceivable: item.totalReceivable,
        totalGrossProfit: item.totalGrossProfit
      }))
    };
  },

  async listParameterRules() {
    await ensureDefaultParameterRules();
    const rows = await prisma.parameterRule.findMany({
      where: { isActive: true },
      orderBy: [{ ruleGroup: "asc" }, { id: "asc" }]
    });

    return {
      rows: rows.map((rule) => ({
        id: rule.id,
        ruleKey: rule.ruleKey,
        ruleGroup: rule.ruleGroup,
        label: rule.label,
        value: parseRuleValue(rule.valueJson),
        valueJson: rule.valueJson,
        description: rule.description,
        updatedBy: rule.updatedBy,
        updatedAt: rule.updatedAt
      }))
    };
  },

  async updateParameterRule(ruleKey: string, payload: { valueJson?: string; description?: string; updatedBy?: string }) {
    await ensureDefaultParameterRules();
    const valueJson = payload.valueJson ?? "";
    try {
      JSON.parse(valueJson);
    } catch {
      throw new Error("规则值必须是合法 JSON。");
    }

    const rule = await prisma.parameterRule.update({
      where: { ruleKey },
      data: {
        valueJson,
        description: payload.description,
        updatedBy: payload.updatedBy || "finance-admin"
      }
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
      updatedAt: rule.updatedAt
    };
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
      if (!order.isServiceBusiness) item.logisticsProfit += order.adjustedGrossProfit;
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
