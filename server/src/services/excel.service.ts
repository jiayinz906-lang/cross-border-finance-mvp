import * as XLSX from "xlsx";
import crypto from "node:crypto";
import { agencyRuntimeProfile } from "../config/agent.registry.js";
import { selfHostedStack } from "../config/selfhosted-stack.js";
import { prisma } from "../prisma/client.js";

type CellValue = string | number | boolean | Date | null | undefined;
type RawRow = Record<string, CellValue>;

type CanonicalField =
  | "orderNo"
  | "customerOrderNo"
  | "customerName"
  | "service"
  | "supplier"
  | "direction"
  | "feeType"
  | "amount"
  | "localAmount"
  | "convertedAmount"
  | "salespersonName"
  | "remark"
  | "exchangeRate"
  | "customerServiceName"
  | "orderDate"
  | "internalRemark"
  | "actualWeight"
  | "pieces"
  | "mainProductName";

type HeaderMapping = Partial<Record<CanonicalField, string>>;
type CanonicalRow = Partial<Record<CanonicalField, CellValue>>;
type CommissionTier = { min: number; max: number | null; rate: number };

type ImportRules = {
  cnyRate: number;
  usdRate: number;
  highRiskBelow: number;
  abnormalHighAbove: number;
  companyCustomerCommissionRate: number;
  serviceKeywords: string[];
  commissionTiers: CommissionTier[];
};

type DraftOrder = {
  orderNo: string;
  customerOrderNo?: string | null;
  orderDate: Date;
  month: string;
  customerName: string;
  customerType: string;
  salespersonName: string;
  customerServiceName?: string | null;
  businessType: string;
  supplierName?: string;
  currency: string;
  exchangeRate?: number | null;
  exchangeRateSource?: string | null;
  exchangeRateStatus: string;
  receivableFreight: number;
  receivableClearance: number;
  receivableDelivery: number;
  receivableCompensation: number;
  otherReceivable: number;
  payableFreight: number;
  payableClearance: number;
  payableDelivery: number;
  payableCompensation: number;
  otherCost: number;
  adjustedReceivable: number;
  adjustedPayable: number;
  adjustedGrossProfit: number;
  adjustedGrossProfitRate: number | null;
  receivedAmount: number;
  paidAmount: number;
  orderStatus: string;
  receivableStatus: string;
  payableStatus: string;
  isServiceBusiness: boolean;
  isCompanyCustomerAdjusted: boolean;
  needSupervisorConfirm: boolean;
  calculationNote: string;
  remark?: string;
};

type ParsedRawLine = {
  rowIndex: number;
  orderNo?: string;
  customerOrderNo?: string | null;
  raw: RawRow;
  canonical: CanonicalRow;
  parseStatus: "parsed" | "skipped";
  parseMessage?: string;
};

type FinanceChargeDraft = {
  rowIndex: number;
  orderNo: string;
  customerOrderNo?: string | null;
  customerName?: string | null;
  salespersonName?: string | null;
  customerServiceName?: string | null;
  direction: string;
  feeType: string;
  service?: string | null;
  supplierName?: string | null;
  currency: string;
  exchangeRate: number;
  originalAmount: number;
  localAmount: number;
  signedAmount: number;
  isCompensation: boolean;
  isServiceBusiness: boolean;
};

type ImportQualityIssue = {
  key: string;
  level: "error" | "warning" | "info";
  title: string;
  count: number;
  orderNos: string[];
  message: string;
};

const templateKey = "system_waybill_detail";
const requiredCanonicalFields: CanonicalField[] = ["orderNo", "direction", "feeType"];

const defaultImportRules: ImportRules = {
  cnyRate: 1,
  usdRate: 6.85,
  highRiskBelow: 0.1,
  abnormalHighAbove: 0.5,
  companyCustomerCommissionRate: 0.1,
  serviceKeywords: ["注册", "注销", "证书", "店铺", "租赁", "商标", "财税", "EAC", "COC", "DOC"],
  commissionTiers: [
    { min: 150000, max: null, rate: 0.3 },
    { min: 100000, max: 150000, rate: 0.25 },
    { min: 50000, max: 100000, rate: 0.2 },
    { min: 15000, max: 50000, rate: 0.15 },
    { min: 0, max: 15000, rate: 0.15 }
  ]
};

const templateHeaders = [
  "运单号",
  "客户订单号",
  "用户",
  "服务",
  "收费重(KG)",
  "供应商收费重(KG)",
  "供应商",
  "供应商服务",
  "收付类型",
  "费用类型",
  "金额",
  "单价",
  "本币费用",
  "销售代表",
  "备注",
  "客服代表",
  "下单时间",
  "内部备注",
  "实重",
  "件数",
  "主品名"
];

const fieldAliases: Record<CanonicalField, string[]> = {
  orderNo: ["运单号", "单号", "订单号", "物流单号", "系统单号", "运单编号"],
  customerOrderNo: ["客户订单号", "原始订单号", "平台订单号", "客户单号", "客户编号"],
  customerName: ["用户", "客户", "客户名称", "公司", "客户公司"],
  service: ["服务", "业务类型", "业务类别", "项目", "产品服务"],
  supplier: ["供应商", "上游供应商", "服务商", "渠道商"],
  direction: ["收付类型", "收/付类型", "应收应付", "收支类型", "类型"],
  feeType: ["费用类型", "费用项目", "费用名称", "费用类别"],
  amount: ["金额", "原始金额", "外币金额", "费用金额"],
  localAmount: ["本币费用", "人民币金额", "折算金额", "RMB金额"],
  convertedAmount: ["折合人民币", "折合RMB", "折合金额", "人民币折合"],
  salespersonName: ["销售代表", "业务员", "销售", "业务代表", "负责人"],
  remark: ["备注", "备注_1", "说明"],
  exchangeRate: ["汇率", "币种汇率"],
  customerServiceName: ["客服代表", "客服", "操作员", "客服人员", "客户代表", "跟单客服", "销售助理"],
  orderDate: ["下单时间", "订单时间", "日期", "下单日期", "创建时间"],
  internalRemark: ["内部备注", "内部说明", "财务备注"],
  actualWeight: ["实重", "实际重量", "重量"],
  pieces: ["件数", "数量", "包裹数"],
  mainProductName: ["主品名", "品名", "商品名称"]
};

function text(value: CellValue): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value: CellValue): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: CellValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = text(value).replace(/,/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item instanceof Date) return item.toISOString();
    return item;
  });
}

function rowHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

async function loadImportRules(): Promise<ImportRules> {
  const rows = await prisma.parameterRule.findMany({
    where: {
      isActive: true,
      ruleKey: {
        in: [
          "exchange_rate_policy",
          "risk_profit_rate_threshold",
          "logistics_commission_tiers",
          "company_customer_commission_rate",
          "service_business_scope"
        ]
      }
    }
  });
  const byKey = new Map(rows.map((row) => [row.ruleKey, row.valueJson]));
  const exchange = safeJson<{ cnyRate?: number; usdRate?: number }>(byKey.get("exchange_rate_policy"), {});
  const risk = safeJson<{ highRiskBelow?: number; abnormalHighAbove?: number }>(byKey.get("risk_profit_rate_threshold"), {});
  const company = safeJson<{ rate?: number }>(byKey.get("company_customer_commission_rate"), {});
  const serviceKeywords = safeJson<string[]>(byKey.get("service_business_scope"), defaultImportRules.serviceKeywords);
  const commissionTiers = safeJson<CommissionTier[]>(byKey.get("logistics_commission_tiers"), defaultImportRules.commissionTiers);

  return {
    cnyRate: Number.isFinite(exchange.cnyRate) ? Number(exchange.cnyRate) : defaultImportRules.cnyRate,
    usdRate: Number.isFinite(exchange.usdRate) ? Number(exchange.usdRate) : defaultImportRules.usdRate,
    highRiskBelow: Number.isFinite(risk.highRiskBelow) ? Number(risk.highRiskBelow) : defaultImportRules.highRiskBelow,
    abnormalHighAbove: Number.isFinite(risk.abnormalHighAbove) ? Number(risk.abnormalHighAbove) : defaultImportRules.abnormalHighAbove,
    companyCustomerCommissionRate: Number.isFinite(company.rate) ? Number(company.rate) : defaultImportRules.companyCustomerCommissionRate,
    serviceKeywords: Array.isArray(serviceKeywords) && serviceKeywords.length ? serviceKeywords : defaultImportRules.serviceKeywords,
    commissionTiers: Array.isArray(commissionTiers) && commissionTiers.length
      ? commissionTiers.sort((a, b) => b.min - a.min)
      : defaultImportRules.commissionTiers
  };
}

function normalizeHeader(value: CellValue) {
  return text(value).replace(/\s+/g, "").toLowerCase();
}

function normalizeUploadFileName(value: string) {
  const decoded = Buffer.from(value, "latin1").toString("utf8");
  if (decoded.includes("�")) return value;
  if (/[\u00C0-\u00FF]/.test(value)) return decoded;
  if (/[^\x00-\x7F]/.test(value)) return value;
  return decoded;
}

function buildHeaderMapping(headers: string[]): HeaderMapping {
  const normalizedSource = new Map<string, string>();
  for (const header of headers) normalizedSource.set(normalizeHeader(header), header);

  const mapping: HeaderMapping = {};
  for (const [field, aliases] of Object.entries(fieldAliases) as [CanonicalField, string[]][]) {
    for (const alias of aliases) {
      const source = normalizedSource.get(normalizeHeader(alias));
      if (source) {
        mapping[field] = source;
        break;
      }
    }
  }
  return mapping;
}

function missingRequiredFields(mapping: HeaderMapping) {
  return requiredCanonicalFields.filter((field) => !mapping[field]);
}

function mapRawRow(row: RawRow, mapping: HeaderMapping): CanonicalRow {
  const mapped: CanonicalRow = {};
  for (const [field, sourceHeader] of Object.entries(mapping) as [CanonicalField, string][]) {
    mapped[field] = row[sourceHeader];
  }
  return mapped;
}

async function loadTemplateHeaders() {
  const template = await prisma.excelImportTemplate.findUnique({ where: { templateKey } });
  return safeJson<string[]>(template?.headersJson, templateHeaders);
}

function templateDiagnostics(headers: string[], expectedHeaders = templateHeaders) {
  const current = headers.map(normalizeHeader);
  const expected = expectedHeaders.map(normalizeHeader);
  return {
    matchExact: JSON.stringify(current) === JSON.stringify(expected),
    missingTemplateHeaders: expectedHeaders.filter((header) => !current.includes(normalizeHeader(header))),
    extraHeaders: headers.filter((header) => !expected.includes(normalizeHeader(header)))
  };
}

function exchangeRateMarker(row: CanonicalRow): string {
  return text(row.exchangeRate) || text(row.remark) || text(row.internalRemark);
}

function markedExchangeRate(row: CanonicalRow, rules: ImportRules): { rate: number; status: string; source: string } {
  const marker = exchangeRateMarker(row);
  const parsed = nullableNumber(row.exchangeRate) ?? nullableNumber(marker);
  if (parsed !== null) {
    return {
      rate: parsed,
      status: "confirmed",
      source: parsed === 1 ? "原始表格标注 1，按人民币计算" : `原始表格标注汇率 ${parsed}`
    };
  }

  if (/美金|美元|USD|\$|汇率未出/i.test(marker)) {
    return {
      rate: rules.usdRate,
      status: "confirmed",
      source: `${marker || "美元"}，按参数规则汇率 ${rules.usdRate}`
    };
  }

  return {
    rate: rules.cnyRate,
    status: marker ? "pending" : "confirmed",
    source: marker || "未标注汇率，按人民币暂列"
  };
}

function parseDate(value: CellValue): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(text(value).replace(/-/g, "/"));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function monthOf(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function isServiceBusiness(service: string, feeType: string, rules: ImportRules): boolean {
  return rules.serviceKeywords.some((keyword) => service.includes(keyword) || feeType.includes(keyword));
}

function isCompensationFee(feeType: string) {
  return feeType.includes("赔付") || feeType.includes("赔偿") || feeType.includes("理赔");
}

function isReceivableDirection(direction: string) {
  return direction.includes("应收") || (direction.includes("收") && !direction.includes("付"));
}

function isPayableDirection(direction: string) {
  return direction.includes("应付") || direction.includes("付");
}

function applyAmount(order: DraftOrder, direction: string, feeType: string, amount: number) {
  const isReceivable = isReceivableDirection(direction);
  const isPayable = isPayableDirection(direction);
  if (!isReceivable && !isPayable) return;

  const target =
    feeType.includes("运费") ? "Freight" :
    feeType.includes("清关") || feeType.includes("报关") || feeType.includes("操作") || feeType.includes("拖车") ? "Clearance" :
    feeType.includes("派送") || feeType.includes("配送") ? "Delivery" :
    isCompensationFee(feeType) ? "Compensation" :
    "Other";

  if (isReceivable && target === "Freight") order.receivableFreight += amount;
  if (isReceivable && target === "Clearance") order.receivableClearance += amount;
  if (isReceivable && target === "Delivery") order.receivableDelivery += amount;
  if (isReceivable && target === "Compensation") order.receivableCompensation += amount;
  if (isReceivable && target === "Other") order.otherReceivable += amount;
  if (isPayable && target === "Freight") order.payableFreight += amount;
  if (isPayable && target === "Clearance") order.payableClearance += amount;
  if (isPayable && target === "Delivery") order.payableDelivery += amount;
  if (isPayable && target === "Compensation") order.payableCompensation += amount;
  if (isPayable && target === "Other") order.otherCost += amount;
}

function chargeAmount(row: CanonicalRow, direction: string, feeType: string, rules: ImportRules) {
  const convertedAmount = number(row.convertedAmount);
  const localAmount = number(row.localAmount);
  const originalAmount = number(row.amount);
  const exchange = markedExchangeRate(row, rules);
  const hasConvertedAmount = convertedAmount !== 0;
  const rawAmount = hasConvertedAmount
    ? convertedAmount
    : localAmount !== 0
      ? localAmount * exchange.rate
      : originalAmount * exchange.rate;
  const signedAmount = hasConvertedAmount
    ? isPayableDirection(direction) ? -rawAmount : rawAmount
    : isCompensationFee(feeType)
      ? isPayableDirection(direction) ? -rawAmount : rawAmount
      : rawAmount;
  const aggregateAmount = hasConvertedAmount || isCompensationFee(feeType)
    ? signedAmount
    : Math.abs(rawAmount);

  return {
    exchange,
    originalAmount,
    localAmount: aggregateAmount,
    signedAmount,
    aggregateAmount
  };
}

function chargeDraftFromLine(line: ParsedRawLine, rules: ImportRules): FinanceChargeDraft | null {
  if (!line.orderNo || line.parseStatus === "skipped") return null;
  const canonical = line.canonical;
  const direction = text(canonical.direction);
  const feeType = text(canonical.feeType);
  const service = text(canonical.service) || null;
  const amounts = chargeAmount(canonical, direction, feeType, rules);

  return {
    rowIndex: line.rowIndex,
    orderNo: line.orderNo,
    customerOrderNo: line.customerOrderNo ?? (text(canonical.customerOrderNo) || null),
    customerName: text(canonical.customerName) || null,
    salespersonName: text(canonical.salespersonName) || null,
    customerServiceName: text(canonical.customerServiceName) || null,
    direction,
    feeType,
    service,
    supplierName: text(canonical.supplier) || null,
    currency: amounts.exchange.rate === 1 ? "CNY" : "CNY",
    exchangeRate: amounts.exchange.rate,
    originalAmount: amounts.originalAmount,
    localAmount: amounts.localAmount,
    signedAmount: amounts.signedAmount,
    isCompensation: isCompensationFee(feeType),
    isServiceBusiness: isServiceBusiness(service ?? "", feeType, rules)
  };
}

function makeDraft(row: CanonicalRow, rules: ImportRules): DraftOrder {
  const orderDate = parseDate(row.orderDate);
  const service = text(row.service) || "未分类业务";
  const feeType = text(row.feeType);
  const serviceBusiness = isServiceBusiness(service, feeType, rules);
  const exchange = markedExchangeRate(row, rules);
  const orderNo = text(row.orderNo);
  const salespersonName = text(row.salespersonName) || "未分配";
  const customerServiceName = text(row.customerServiceName) || salespersonName;

  return {
    orderNo,
    customerOrderNo: text(row.customerOrderNo) || text(row.customerName) || orderNo,
    orderDate,
    month: monthOf(orderDate),
    customerName: text(row.customerName) || text(row.customerOrderNo) || orderNo,
    customerType: serviceBusiness ? "service" : "logistics",
    salespersonName,
    customerServiceName,
    businessType: service,
    supplierName: text(row.supplier) || undefined,
    currency: "CNY",
    exchangeRate: exchange.rate,
    exchangeRateSource: exchange.source,
    exchangeRateStatus: exchange.status,
    receivableFreight: 0,
    receivableClearance: 0,
    receivableDelivery: 0,
    receivableCompensation: 0,
    otherReceivable: 0,
    payableFreight: 0,
    payableClearance: 0,
    payableDelivery: 0,
    payableCompensation: 0,
    otherCost: 0,
    adjustedReceivable: 0,
    adjustedPayable: 0,
    adjustedGrossProfit: 0,
    adjustedGrossProfitRate: null,
    receivedAmount: 0,
    paidAmount: 0,
    orderStatus: "completed",
    receivableStatus: "unreceived",
    payableStatus: "unpaid",
    isServiceBusiness: serviceBusiness,
    isCompanyCustomerAdjusted: false,
    needSupervisorConfirm: serviceBusiness || exchange.status === "pending",
    calculationNote: "",
    remark: [text(row.mainProductName), text(row.internalRemark), text(row.remark)].filter(Boolean).join(" / ")
  };
}

function finalize(order: DraftOrder, rules: ImportRules): DraftOrder {
  order.adjustedReceivable = order.receivableFreight + order.receivableClearance + order.receivableDelivery + order.receivableCompensation + order.otherReceivable;
  order.adjustedPayable = order.payableFreight + order.payableClearance + order.payableDelivery + order.payableCompensation + order.otherCost;
  order.adjustedGrossProfit = order.adjustedReceivable - order.adjustedPayable;
  order.adjustedGrossProfitRate = order.adjustedReceivable > 0 ? order.adjustedGrossProfit / order.adjustedReceivable : null;

  const notes = [];
  if (order.exchangeRateStatus === "pending") notes.push("汇率缺失或非数字，待主管复核");
  if (order.adjustedGrossProfitRate !== null && order.adjustedGrossProfitRate < rules.highRiskBelow) notes.push(`利润率低于${rules.highRiskBelow * 100}%`);
  if (order.adjustedGrossProfitRate !== null && order.adjustedGrossProfitRate > rules.abnormalHighAbove) notes.push(`利润率高于${rules.abnormalHighAbove * 100}%`);
  if (order.adjustedPayable === 0 && !order.isServiceBusiness) notes.push("未识别到应付成本");
  if (order.isServiceBusiness) notes.push("注册/证书/店铺等服务类业务，进入主管确认，不计入物流利润分析");
  order.needSupervisorConfirm = order.needSupervisorConfirm || notes.length > 0;
  order.calculationNote = notes.join("；") || "Excel 导入后端自动聚合分析";
  return order;
}

function commissionRate(monthlyLogisticsProfit: number, rules: ImportRules): number {
  const tier = rules.commissionTiers.find((item) => monthlyLogisticsProfit >= item.min && (item.max === null || monthlyLogisticsProfit < item.max));
  return tier?.rate ?? 0.15;
}

function riskLevel(order: { adjustedGrossProfitRate: number | null }, rules: ImportRules): "high" | "medium" {
  if (order.adjustedGrossProfitRate !== null && order.adjustedGrossProfitRate > rules.abnormalHighAbove) return "medium";
  return "high";
}

function riskType(order: {
  exchangeRateStatus: string;
  adjustedGrossProfitRate: number | null;
  adjustedPayable: number;
  isServiceBusiness: boolean;
}, rules: ImportRules): string {
  if (order.exchangeRateStatus === "pending") return "exchange_rate_missing";
  if (order.adjustedGrossProfitRate !== null && order.adjustedGrossProfitRate > rules.abnormalHighAbove) return "abnormal_high_profit";
  if (order.adjustedGrossProfitRate !== null && order.adjustedGrossProfitRate < rules.highRiskBelow) return "low_profit";
  if (order.adjustedPayable === 0 && !order.isServiceBusiness) return "cost_missing";
  if (order.isServiceBusiness) return "service_confirm";
  return "finance_review";
}

function extractHeaders(workbook: XLSX.WorkBook): { sheetName: string; headerRowIndex: number; headers: string[]; mapping: HeaderMapping } {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<CellValue[]>(sheet, { header: 1, defval: null, raw: true });

    for (const [index, row] of rows.entries()) {
      const headers = row.map((cell) => text(cell)).filter(Boolean);
      if (!headers.length) continue;
      const mapping = buildHeaderMapping(headers);
      if (!missingRequiredFields(mapping).length) {
        return { sheetName, headerRowIndex: index + 1, headers, mapping };
      }
    }
  }

  throw new Error("Excel 文件没有找到系统运单明细工作表，请确认至少包含：运单号、收付类型、费用类型。");
}

function findDetailSheet(workbook: XLSX.WorkBook) {
  const detail = extractHeaders(workbook);
  const sheet = workbook.Sheets[detail.sheetName];
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: true, range: detail.headerRowIndex - 1 });
  return { ...detail, rows };
}

function mappingReport(mapping: HeaderMapping) {
  return (Object.entries(mapping) as [CanonicalField, string][]).map(([field, sourceHeader]) => ({ field, sourceHeader }));
}

function importAudit(headers: string[], mapping: HeaderMapping, rules?: ImportRules, expectedHeaders = templateHeaders) {
  return {
    parserMode: "auto-header-mapping",
    fieldMapping: mappingReport(mapping),
    missingRequiredFields: missingRequiredFields(mapping),
    template: templateDiagnostics(headers, expectedHeaders),
    activeRules: rules,
    agency: agencyRuntimeProfile,
    selfHostedStack
  };
}

function summarizeOrders(orders: DraftOrder[], rules: ImportRules) {
  const totalReceivable = orders.reduce((sum, order) => sum + order.adjustedReceivable, 0);
  const totalPayable = orders.reduce((sum, order) => sum + order.adjustedPayable, 0);
  const totalGrossProfit = orders.reduce((sum, order) => sum + order.adjustedGrossProfit, 0);
  return {
    importedOrders: orders.length,
    serviceOrders: orders.filter((order) => order.isServiceBusiness).length,
    logisticsOrders: orders.filter((order) => !order.isServiceBusiness).length,
    totalReceivable,
    totalPayable,
    totalGrossProfit,
    grossProfitRate: totalReceivable > 0 ? totalGrossProfit / totalReceivable : null,
    riskOrderCount: orders.filter((order) => (order.adjustedGrossProfitRate ?? 1) < rules.highRiskBelow || order.needSupervisorConfirm).length,
    abnormalHighProfitOrderCount: orders.filter((order) => (order.adjustedGrossProfitRate ?? 0) > rules.abnormalHighAbove).length,
    pendingSupervisorConfirmCount: orders.filter((order) => order.needSupervisorConfirm).length
  };
}

function compactOrderNos(orderNos: Array<string | undefined>, limit = 20) {
  return Array.from(new Set(orderNos.filter(Boolean) as string[])).slice(0, limit);
}

function buildQualityReport(input: { orders: DraftOrder[]; rawLines: ParsedRawLine[]; rules: ImportRules }) {
  const { orders, rawLines, rules } = input;
  const issues: ImportQualityIssue[] = [];
  const skippedLines = rawLines.filter((line) => line.parseStatus === "skipped");
  const logisticsOrders = orders.filter((order) => !order.isServiceBusiness);
  const serviceOrders = orders.filter((order) => order.isServiceBusiness);
  const duplicateLineMap = new Map<string, ParsedRawLine[]>();

  for (const line of rawLines) {
    if (!line.orderNo) continue;
    const key = [
      line.orderNo,
      text(line.canonical.direction),
      text(line.canonical.feeType),
      text(line.canonical.localAmount) || text(line.canonical.amount),
      text(line.canonical.supplier)
    ].join("|");
    duplicateLineMap.set(key, [...(duplicateLineMap.get(key) ?? []), line]);
  }

  const duplicateLines = Array.from(duplicateLineMap.values()).filter((lines) => lines.length > 1);
  const noReceivableOrders = orders.filter((order) => order.adjustedReceivable <= 0);
  const noPayableLogisticsOrders = logisticsOrders.filter((order) => order.adjustedPayable <= 0);
  const pendingExchangeOrders = orders.filter((order) => order.exchangeRateStatus === "pending");
  const negativeProfitOrders = orders.filter((order) => order.adjustedGrossProfit < 0);
  const lowProfitOrders = orders.filter((order) => (order.adjustedGrossProfitRate ?? 1) < rules.highRiskBelow);
  const abnormalHighProfitOrders = orders.filter((order) => (order.adjustedGrossProfitRate ?? 0) > rules.abnormalHighAbove);
  const missingSalespersonOrders = orders.filter((order) => order.salespersonName === "未分配");
  const missingCustomerServiceOrders = orders.filter((order) => !order.customerServiceName || order.customerServiceName === "未分配");
  const missingSupplierOrders = logisticsOrders.filter((order) => !order.supplierName);

  if (skippedLines.length) {
    issues.push({
      key: "missing_order_no_rows",
      level: "warning",
      title: "缺少运单号的原始行",
      count: skippedLines.length,
      orderNos: [],
      message: "这些 Excel 行会保留原始台账，但不会进入订单汇总。请确认是否为空行、备注行或漏填运单号。"
    });
  }

  if (duplicateLines.length) {
    issues.push({
      key: "duplicate_charge_lines",
      level: "warning",
      title: "疑似重复费用行",
      count: duplicateLines.reduce((sum, lines) => sum + lines.length, 0),
      orderNos: compactOrderNos(duplicateLines.flatMap((lines) => lines.map((line) => line.orderNo))),
      message: "同一运单、收付类型、费用类型、金额和供应商重复出现。请核对是否重复录入。"
    });
  }

  if (noReceivableOrders.length) {
    issues.push({
      key: "orders_without_receivable",
      level: "warning",
      title: "订单无应收",
      count: noReceivableOrders.length,
      orderNos: compactOrderNos(noReceivableOrders.map((order) => order.orderNo)),
      message: "订单没有识别到应收金额，写库后会影响营收和毛利。建议先补齐或确认是否作废订单。"
    });
  }

  if (noPayableLogisticsOrders.length) {
    issues.push({
      key: "logistics_without_payable",
      level: "warning",
      title: "物流订单无应付",
      count: noPayableLogisticsOrders.length,
      orderNos: compactOrderNos(noPayableLogisticsOrders.map((order) => order.orderNo)),
      message: "物流订单未识别到成本，应进入风险复查，防止异常高毛利来自成本漏录。"
    });
  }

  if (pendingExchangeOrders.length) {
    issues.push({
      key: "pending_exchange_rate",
      level: "warning",
      title: "汇率待确认",
      count: pendingExchangeOrders.length,
      orderNos: compactOrderNos(pendingExchangeOrders.map((order) => order.orderNo)),
      message: "存在非数字或无法确认的汇率标注，当前按人民币暂列，需主管复核。"
    });
  }

  if (negativeProfitOrders.length) {
    issues.push({
      key: "negative_profit",
      level: "warning",
      title: "负毛利订单",
      count: negativeProfitOrders.length,
      orderNos: compactOrderNos(negativeProfitOrders.map((order) => order.orderNo)),
      message: "负毛利会直接影响月度利润和提成，建议导入前复核费用类型、收付方向和成本。"
    });
  }

  if (lowProfitOrders.length) {
    issues.push({
      key: "low_profit",
      level: "warning",
      title: "低毛利风险订单",
      count: lowProfitOrders.length,
      orderNos: compactOrderNos(lowProfitOrders.map((order) => order.orderNo)),
      message: `毛利率低于 ${(rules.highRiskBelow * 100).toFixed(0)}%，将进入风险复查。`
    });
  }

  if (abnormalHighProfitOrders.length) {
    issues.push({
      key: "abnormal_high_profit",
      level: "warning",
      title: "异常高毛利订单",
      count: abnormalHighProfitOrders.length,
      orderNos: compactOrderNos(abnormalHighProfitOrders.map((order) => order.orderNo)),
      message: `毛利率高于 ${(rules.abnormalHighAbove * 100).toFixed(0)}%，需复核是否存在应付成本漏录。`
    });
  }

  if (serviceOrders.length) {
    issues.push({
      key: "service_business_detected",
      level: "info",
      title: "注册/证书/店铺服务类",
      count: serviceOrders.length,
      orderNos: compactOrderNos(serviceOrders.map((order) => order.orderNo)),
      message: "服务类业务将单独进入注册确认，不进入物流提成口径。"
    });
  }

  if (missingSalespersonOrders.length || missingCustomerServiceOrders.length || missingSupplierOrders.length) {
    issues.push({
      key: "missing_owner_fields",
      level: "warning",
      title: "负责人或供应商缺失",
      count: missingSalespersonOrders.length + missingCustomerServiceOrders.length + missingSupplierOrders.length,
      orderNos: compactOrderNos([
        ...missingSalespersonOrders.map((order) => order.orderNo),
        ...missingCustomerServiceOrders.map((order) => order.orderNo),
        ...missingSupplierOrders.map((order) => order.orderNo)
      ]),
      message: "缺少销售代表、客服代表或供应商会影响提成、操作员绩效和上游应付分析。"
    });
  }

  return {
    blockingCount: issues.filter((item) => item.level === "error").length,
    warningCount: issues.filter((item) => item.level === "warning").length,
    infoCount: issues.filter((item) => item.level === "info").length,
    issues
  };
}

function buildChargeLineSummary(rawLines: ParsedRawLine[], rules: ImportRules) {
  const chargeLines = rawLines
    .map((line) => chargeDraftFromLine(line, rules))
    .filter(Boolean) as FinanceChargeDraft[];
  const receivableLines = chargeLines.filter((line) => isReceivableDirection(line.direction));
  const payableLines = chargeLines.filter((line) => isPayableDirection(line.direction));
  const compensationLines = chargeLines.filter((line) => line.isCompensation);
  const negativeLines = chargeLines.filter((line) => line.signedAmount < 0);

  return {
    totalLines: chargeLines.length,
    receivableLineCount: receivableLines.length,
    payableLineCount: payableLines.length,
    compensationLineCount: compensationLines.length,
    negativeAmountCount: negativeLines.length,
    serviceLineCount: chargeLines.filter((line) => line.isServiceBusiness).length,
    totalReceivable: receivableLines.reduce((sum, line) => sum + line.localAmount, 0),
    totalPayable: payableLines.reduce((sum, line) => sum + line.localAmount, 0),
    totalCompensation: compensationLines.reduce((sum, line) => sum + line.signedAmount, 0),
    totalSignedAmount: chargeLines.reduce((sum, line) => sum + line.signedAmount, 0),
    feeTypeSummary: Array.from(chargeLines.reduce((map, line) => {
      const item = map.get(line.feeType) ?? { feeType: line.feeType, count: 0, amount: 0 };
      item.count += 1;
      item.amount += line.localAmount;
      map.set(line.feeType, item);
      return map;
    }, new Map<string, { feeType: string; count: number; amount: number }>()).values())
  };
}

function buildImportAuditReport(parsed: {
  fileName: string;
  sheetName: string;
  month: string;
  importedRows: number;
  importedOrders: number;
  logisticsOrders: number;
  serviceOrders: number;
  totalReceivable: number;
  totalPayable: number;
  totalGrossProfit: number;
  grossProfitRate: number | null;
  audit: ReturnType<typeof importAudit>;
  qualityReport: ReturnType<typeof buildQualityReport>;
  rawLines: ParsedRawLine[];
  rules: ImportRules;
}) {
  const chargeLineSummary = buildChargeLineSummary(parsed.rawLines, parsed.rules);
  const blockingIssues = parsed.qualityReport.issues.filter((item) => item.level === "error");
  const warningIssues = parsed.qualityReport.issues.filter((item) => item.level === "warning");
  const infoIssues = parsed.qualityReport.issues.filter((item) => item.level === "info");

  return {
    auditSummary: {
      fileName: parsed.fileName,
      sheetName: parsed.sheetName,
      month: parsed.month,
      importedRows: parsed.importedRows,
      importedOrders: parsed.importedOrders,
      logisticsOrders: parsed.logisticsOrders,
      serviceOrders: parsed.serviceOrders,
      totalReceivable: parsed.totalReceivable,
      totalPayable: parsed.totalPayable,
      totalGrossProfit: parsed.totalGrossProfit,
      grossProfitRate: parsed.grossProfitRate,
      generatedAt: new Date().toISOString(),
      status: blockingIssues.length ? "blocked" : "passed"
    },
    chargeLineSummary,
    blockingIssues,
    warningIssues,
    infoIssues,
    reconciliation: {
      orderReceivable: parsed.totalReceivable,
      chargeReceivable: chargeLineSummary.totalReceivable,
      receivableDifference: parsed.totalReceivable - chargeLineSummary.totalReceivable,
      orderPayable: parsed.totalPayable,
      chargePayable: chargeLineSummary.totalPayable,
      payableDifference: parsed.totalPayable - chargeLineSummary.totalPayable,
      source: "FinanceOrder 聚合与 FinanceChargeLine 费用明细账同源计算"
    }
  };
}

async function writeChargeLinesForBatch(input: {
  batchId: number;
  month: string;
  fileName: string;
  rawLines: ParsedRawLine[];
  rules: ImportRules;
}) {
  const rawRows = await prisma.rawLedgerLine.findMany({
    where: { importBatchId: input.batchId },
    select: { id: true, rowIndex: true }
  });
  const rawIdByRow = new Map(rawRows.map((row) => [row.rowIndex, row.id]));
  const orders = await prisma.financeOrder.findMany({
    where: { importBatchId: input.batchId },
    select: { id: true, orderNo: true }
  });
  const orderIdByNo = new Map(orders.map((order) => [order.orderNo, order.id]));
  const drafts = input.rawLines
    .map((line) => chargeDraftFromLine(line, input.rules))
    .filter(Boolean) as FinanceChargeDraft[];

  if (!drafts.length) return 0;

  await prisma.financeChargeLine.createMany({
    data: drafts.map((line) => ({
      importBatchId: input.batchId,
      financeOrderId: orderIdByNo.get(line.orderNo),
      rawLedgerLineId: rawIdByRow.get(line.rowIndex),
      month: input.month,
      orderNo: line.orderNo,
      customerOrderNo: line.customerOrderNo,
      customerName: line.customerName,
      salespersonName: line.salespersonName,
      customerServiceName: line.customerServiceName,
      direction: line.direction,
      feeType: line.feeType,
      service: line.service,
      supplierName: line.supplierName,
      currency: line.currency,
      exchangeRate: line.exchangeRate,
      originalAmount: line.originalAmount,
      localAmount: line.localAmount,
      signedAmount: line.signedAmount,
      isCompensation: line.isCompensation,
      isServiceBusiness: line.isServiceBusiness,
      rowIndex: line.rowIndex,
      sourceFileName: input.fileName
    }))
  });

  return drafts.length;
}

async function parseWorkbook(buffer: Buffer, originalName: string) {
  const rules = await loadImportRules();
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const fileName = normalizeUploadFileName(originalName);
  const { sheetName, headers, mapping, rows } = findDetailSheet(workbook);
  const missing = missingRequiredFields(mapping);
  if (missing.length) throw new Error(`Excel 表头无法自动对应必填字段：${missing.join("、")}`);
  if (!rows.length) throw new Error("Excel 工作表没有明细数据。");

  const orders = new Map<string, DraftOrder>();
  const rawLines: ParsedRawLine[] = [];
  for (const [index, rawRow] of rows.entries()) {
    const row = mapRawRow(rawRow, mapping);
    const orderNo = text(row.orderNo);
    const rawLine: ParsedRawLine = {
      rowIndex: index + 1,
      orderNo: orderNo || undefined,
      customerOrderNo: text(row.customerOrderNo) || null,
      raw: rawRow,
      canonical: row,
      parseStatus: orderNo ? "parsed" : "skipped",
      parseMessage: orderNo ? undefined : "缺少运单号，未进入订单聚合"
    };
    rawLines.push(rawLine);
    if (!orderNo) continue;

    const draft = orders.get(orderNo) ?? makeDraft(row, rules);
    const feeType = text(row.feeType);
    const direction = text(row.direction);
    const amount = chargeAmount(row, direction, feeType, rules).aggregateAmount;
    draft.supplierName = draft.supplierName || text(row.supplier) || undefined;
    draft.customerOrderNo = text(row.customerOrderNo) || draft.customerOrderNo || text(row.customerName) || orderNo;
    draft.isServiceBusiness = draft.isServiceBusiness || isServiceBusiness(text(row.service), feeType, rules);
    draft.needSupervisorConfirm = draft.needSupervisorConfirm || draft.isServiceBusiness;
    applyAmount(draft, direction, feeType, amount);
    orders.set(orderNo, draft);
  }

  const finalized = Array.from(orders.values()).map((order) => finalize(order, rules));
  const month = finalized[0]?.month ?? monthOf(new Date());
  const monthOrders = finalized.filter((order) => order.month === month);
  const summary = summarizeOrders(monthOrders, rules);
  const expectedHeaders = await loadTemplateHeaders();
  const audit = importAudit(headers, mapping, rules, expectedHeaders);
  const qualityReport = buildQualityReport({ orders: monthOrders, rawLines, rules });

  return {
    fileName,
    sheetName,
    month,
    rows,
    rawLines,
    headers,
    mapping,
    orders: monthOrders,
    importedRows: rows.length,
    rules,
    ...summary,
    audit,
    qualityReport
  };
}

function batchNo(month: string) {
  return `IMP-${month.replace("-", "")}-${Date.now()}`;
}

async function assertMonthOpen(month: string, action: string) {
  const close = await prisma.monthClose.findUnique({ where: { month } });
  if (close?.status === "locked") {
    throw new Error(`${month} 已锁账，不能${action}。如需调整，请先由主管解锁并记录原因。`);
  }
}

async function writeActionLog(input: {
  month?: string;
  entityType: string;
  entityId: string | number;
  action: string;
  operator?: string;
  payload?: unknown;
}) {
  return prisma.actionLog.create({
    data: {
      month: input.month,
      entityType: input.entityType,
      entityId: String(input.entityId),
      action: input.action,
      operator: input.operator ?? "finance-system",
      payloadJson: input.payload ? JSON.stringify(input.payload) : undefined
    }
  });
}

async function rebuildFinanceSummary(month: string) {
  const rules = await loadImportRules();
  const orders = await prisma.financeOrder.findMany({ where: { month } });
  const totalReceivable = orders.reduce((sum, order) => sum + order.adjustedReceivable, 0);
  const totalPayable = orders.reduce((sum, order) => sum + order.adjustedPayable, 0);
  const totalGrossProfit = orders.reduce((sum, order) => sum + order.adjustedGrossProfit, 0);
  const commissions = await prisma.commissionRecord.findMany({ where: { financeOrder: { month } } });
  const riskOrderCount = orders.filter((order) => (order.adjustedGrossProfitRate ?? 1) < rules.highRiskBelow || order.needSupervisorConfirm).length;
  const abnormalHighProfitOrderCount = orders.filter((order) => (order.adjustedGrossProfitRate ?? 0) > rules.abnormalHighAbove).length;

  await prisma.financeSummary.upsert({
    where: { month },
    update: {
      totalReceivable,
      totalPayable,
      totalReceived: orders.reduce((sum, order) => sum + order.receivedAmount, 0),
      totalPaid: orders.reduce((sum, order) => sum + order.paidAmount, 0),
      totalGrossProfit,
      grossProfitRate: totalReceivable > 0 ? totalGrossProfit / totalReceivable : null,
      totalCommission: commissions.reduce((sum, item) => sum + item.commissionAmount, 0),
      riskOrderCount,
      abnormalHighProfitOrderCount,
      pendingSupervisorConfirmCount: orders.filter((order) => order.needSupervisorConfirm).length
    },
    create: {
      month,
      totalReceivable,
      totalPayable,
      totalReceived: orders.reduce((sum, order) => sum + order.receivedAmount, 0),
      totalPaid: orders.reduce((sum, order) => sum + order.paidAmount, 0),
      totalGrossProfit,
      grossProfitRate: totalReceivable > 0 ? totalGrossProfit / totalReceivable : null,
      totalCommission: commissions.reduce((sum, item) => sum + item.commissionAmount, 0),
      riskOrderCount,
      abnormalHighProfitOrderCount,
      pendingSupervisorConfirmCount: orders.filter((order) => order.needSupervisorConfirm).length
    }
  });
}

async function createDerivedRecords(
  order: Awaited<ReturnType<typeof prisma.financeOrder.create>>,
  logisticsProfitBySalesperson: Map<string, number>,
  rules: ImportRules
) {
  if (!order.isServiceBusiness && order.adjustedGrossProfit > 0) {
    const rate = order.isCompanyCustomerAdjusted
      ? rules.companyCustomerCommissionRate
      : commissionRate(logisticsProfitBySalesperson.get(order.salespersonName) ?? 0, rules);
    await prisma.commissionRecord.create({
      data: {
        financeOrderId: order.id,
        salespersonName: order.salespersonName,
        customerType: order.customerType,
        businessType: order.businessType,
        grossProfit: order.adjustedGrossProfit,
        commissionRate: rate,
        commissionAmount: order.adjustedGrossProfit * rate,
        needSupervisorConfirm: order.needSupervisorConfirm,
        confirmStatus: order.needSupervisorConfirm ? "pending" : "confirmed"
      }
    });
  }

  if (order.needSupervisorConfirm || (order.adjustedGrossProfitRate ?? 1) < rules.highRiskBelow || (order.adjustedGrossProfitRate ?? 0) > rules.abnormalHighAbove) {
    await prisma.riskRecord.create({
      data: {
        financeOrderId: order.id,
        riskLevel: riskLevel(order, rules),
        riskType: riskType(order, rules),
        riskReasons: `${order.orderNo}：${order.calculationNote}`,
        suggestion: "复核原始 Excel、汇率、应收应付和成本归集后再确认。",
        status: "open"
      }
    });
  }

  if (order.isServiceBusiness) {
    await prisma.serviceBusinessRecord.create({
      data: {
        financeOrderId: order.id,
        serviceType: order.businessType,
        originalPrice: order.adjustedReceivable,
        suggestedPrice: order.adjustedReceivable,
        suggestedCommissionMin: Math.max(order.adjustedGrossProfit * 0.08, 0),
        suggestedCommissionMax: Math.max(order.adjustedGrossProfit * 0.12, 0),
        costAmount: order.adjustedPayable,
        grossProfit: order.adjustedGrossProfit,
        confirmStatus: "pending",
        remark: "Excel 导入服务类业务，单独主管确认；不进入物流利润分析。"
      }
    });
  }
}

export const excelService = {
  async saveImportTemplate(buffer: Buffer, originalName: string) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const detail = extractHeaders(workbook);
    const fileName = normalizeUploadFileName(originalName);
    const template = await prisma.excelImportTemplate.upsert({
      where: { templateKey },
      update: {
        fileName,
        sheetName: detail.sheetName,
        headerRowIndex: detail.headerRowIndex,
        headersJson: JSON.stringify(detail.headers)
      },
      create: {
        templateKey,
        fileName,
        sheetName: detail.sheetName,
        headerRowIndex: detail.headerRowIndex,
        headersJson: JSON.stringify(detail.headers)
      }
    });
    return {
      templateKey: template.templateKey,
      fileName: template.fileName,
      sheetName: template.sheetName,
      headerRowIndex: template.headerRowIndex,
      headerCount: detail.headers.length,
      headers: detail.headers,
      importedRows: 0,
      importedOrders: 0,
      audit: importAudit(detail.headers, detail.mapping, undefined, detail.headers)
    };
  },

  async listImportTemplates() {
    const templates = await prisma.excelImportTemplate.findMany({
      orderBy: [{ templateKey: "asc" }, { id: "asc" }]
    });

    return templates.map((template) => {
      const headers = safeJson<string[]>(template.headersJson, []);
      return {
        id: template.id,
        templateKey: template.templateKey,
        fileName: normalizeUploadFileName(template.fileName),
        sheetName: template.sheetName,
        headerRowIndex: template.headerRowIndex,
        headerCount: headers.length,
        headers,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt
      };
    });
  },

  async previewWorkbook(buffer: Buffer, originalName: string) {
    const parsed = await parseWorkbook(buffer, originalName);
    const auditReport = buildImportAuditReport(parsed);
    const sampleOrders = parsed.orders.slice(0, 5).map((order) => ({
      orderNo: order.orderNo,
      customerOrderNo: order.customerOrderNo,
      businessType: order.businessType,
      salespersonName: order.salespersonName,
      customerServiceName: order.customerServiceName,
      receivable: order.adjustedReceivable,
      payable: order.adjustedPayable,
      grossProfit: order.adjustedGrossProfit,
      grossProfitRate: order.adjustedGrossProfitRate,
      needSupervisorConfirm: order.needSupervisorConfirm
    }));

    return {
      fileName: parsed.fileName,
      sheetName: parsed.sheetName,
      month: parsed.month,
      importedRows: parsed.importedRows,
      importedOrders: parsed.importedOrders,
      serviceOrders: parsed.serviceOrders,
      logisticsOrders: parsed.logisticsOrders,
      totalReceivable: parsed.totalReceivable,
      totalPayable: parsed.totalPayable,
      totalGrossProfit: parsed.totalGrossProfit,
      grossProfitRate: parsed.grossProfitRate,
      riskOrderCount: parsed.riskOrderCount,
      abnormalHighProfitOrderCount: parsed.abnormalHighProfitOrderCount,
      pendingSupervisorConfirmCount: parsed.pendingSupervisorConfirmCount,
      sampleOrders,
      audit: parsed.audit,
      qualityReport: parsed.qualityReport,
      ...auditReport,
      writeMode: "确认后将保留每一行原始台账，并按月份重建订单、应收应付、毛利、风险和提成派生数据。"
    };
  },

  async importWorkbook(buffer: Buffer, originalName: string) {
    const parsed = await parseWorkbook(buffer, originalName);
    const auditReport = buildImportAuditReport(parsed);
    if (auditReport.blockingIssues.length) {
      throw new Error("导入审计存在阻断项，请先修正 Excel 后重新导入。");
    }
    await assertMonthOpen(parsed.month, "重新导入 Excel");
    const batchNumber = batchNo(parsed.month);

    const batch = await prisma.importBatch.create({
      data: {
        batchNo: batchNumber,
        month: parsed.month,
        fileName: parsed.fileName,
        sheetName: parsed.sheetName,
        importedRows: parsed.importedRows,
        importedOrders: parsed.importedOrders,
        logisticsOrders: parsed.logisticsOrders,
        serviceOrders: parsed.serviceOrders,
        totalReceivable: parsed.totalReceivable,
        totalPayable: parsed.totalPayable,
        totalGrossProfit: parsed.totalGrossProfit,
        riskOrderCount: parsed.riskOrderCount,
        abnormalHighProfitCount: parsed.abnormalHighProfitOrderCount,
        templateAuditJson: JSON.stringify(parsed.audit),
        previewJson: JSON.stringify({
          totalReceivable: parsed.totalReceivable,
          totalPayable: parsed.totalPayable,
          totalGrossProfit: parsed.totalGrossProfit,
          grossProfitRate: parsed.grossProfitRate,
          qualityReport: parsed.qualityReport,
          activeRules: parsed.rules,
          ...auditReport
        })
      }
    });

    await prisma.serviceBusinessRecord.deleteMany({ where: { financeOrder: { month: parsed.month } } });
    await prisma.settlementRecord.deleteMany({ where: { financeOrder: { month: parsed.month } } });
    await prisma.costAdjustment.deleteMany({ where: { financeOrder: { month: parsed.month } } });
    await prisma.riskRecord.deleteMany({ where: { financeOrder: { month: parsed.month } } });
    await prisma.commissionRecord.deleteMany({ where: { financeOrder: { month: parsed.month } } });
    await prisma.financeSummary.deleteMany({ where: { month: parsed.month } });
    await prisma.confirmationDocument.updateMany({
      where: { month: parsed.month, documentStatus: { not: "voided" } },
      data: {
        documentStatus: "voided",
        signatureStatus: "pending",
        supervisorStatus: "pending",
        signatureToken: null,
        signatureUrl: null,
        signatureTokenExpiresAt: null,
        voidReason: "Excel 重新导入并重建月度数据，旧确认单自动作废",
        voidedAt: new Date()
      }
    });
    await prisma.financeChargeLine.deleteMany({ where: { month: parsed.month } });
    await prisma.financeOrder.deleteMany({ where: { month: parsed.month } });
    await prisma.importBatch.updateMany({
      where: { month: parsed.month, id: { not: batch.id }, status: "active" },
      data: { status: "superseded" }
    });

    const createdOrders = [];
    for (const order of parsed.orders) {
      createdOrders.push(await prisma.financeOrder.create({ data: { ...order, importBatchId: batch.id } }));
    }

    if (parsed.rawLines.length) {
      await prisma.rawLedgerLine.createMany({
        data: parsed.rawLines.map((line) => ({
          importBatchId: batch.id,
          month: parsed.month,
          orderNo: line.orderNo,
          customerOrderNo: line.customerOrderNo,
          rowIndex: line.rowIndex,
          sheetName: parsed.sheetName,
          sourceFileName: parsed.fileName,
          rowHash: rowHash(line.raw),
          rawJson: stableJson(line.raw),
          canonicalJson: stableJson(line.canonical),
          parseStatus: line.parseStatus,
          parseMessage: line.parseMessage
        }))
      });
    }

    const chargeLineCount = await writeChargeLinesForBatch({
      batchId: batch.id,
      month: parsed.month,
      fileName: parsed.fileName,
      rawLines: parsed.rawLines,
      rules: parsed.rules
    });

    const logisticsProfitBySalesperson = new Map<string, number>();
    for (const order of createdOrders) {
      if (!order.isServiceBusiness && order.adjustedGrossProfit > 0) {
        logisticsProfitBySalesperson.set(
          order.salespersonName,
          (logisticsProfitBySalesperson.get(order.salespersonName) ?? 0) + order.adjustedGrossProfit
        );
      }
    }

    for (const order of createdOrders) {
      await createDerivedRecords(order, logisticsProfitBySalesperson, parsed.rules);
    }

    await rebuildFinanceSummary(parsed.month);
    await writeActionLog({
      month: parsed.month,
      entityType: "import_batch",
      entityId: batch.id,
      action: "import_excel",
      payload: {
        batchNo: batch.batchNo,
        fileName: parsed.fileName,
        sheetName: parsed.sheetName,
        importedRows: parsed.importedRows,
        importedOrders: createdOrders.length,
        logisticsOrders: createdOrders.filter((order) => !order.isServiceBusiness).length,
        serviceOrders: createdOrders.filter((order) => order.isServiceBusiness).length,
        totalReceivable: parsed.totalReceivable,
        totalPayable: parsed.totalPayable,
        totalGrossProfit: parsed.totalGrossProfit,
        chargeLineCount,
        auditSummary: auditReport.auditSummary,
        chargeLineSummary: auditReport.chargeLineSummary,
        warningIssues: auditReport.warningIssues
      }
    });

    return {
      batchId: batch.id,
      batchNo: batch.batchNo,
      fileName: parsed.fileName,
      sheetName: parsed.sheetName,
      month: parsed.month,
      importedRows: parsed.importedRows,
      importedOrders: createdOrders.length,
      serviceOrders: createdOrders.filter((order) => order.isServiceBusiness).length,
      logisticsOrders: createdOrders.filter((order) => !order.isServiceBusiness).length,
      audit: parsed.audit,
      qualityReport: parsed.qualityReport,
      chargeLineCount,
      ...auditReport
    };
  },

  async listImportBatches(month?: string) {
    return prisma.importBatch.findMany({
      where: month ? { month } : undefined,
      orderBy: { createdAt: "desc" },
      take: 20
    });
  },

  async listRawLedgerLines(params: { month?: string; orderNo?: string; batchId?: number }) {
    const activeBatch = !params.batchId && params.month
      ? await prisma.importBatch.findFirst({
        where: { month: params.month, status: "active" },
        orderBy: { id: "desc" }
      })
      : null;
    const effectiveBatchId = params.batchId ?? activeBatch?.id;

    if (!params.batchId && params.month && !effectiveBatchId) {
      return { rows: [] };
    }

    const rows = await prisma.rawLedgerLine.findMany({
      where: {
        month: params.month,
        orderNo: params.orderNo,
        importBatchId: effectiveBatchId
      },
      orderBy: [{ rowIndex: "asc" }],
      take: 500
    });

    return {
      rows: rows.map((row) => ({
        id: row.id,
        importBatchId: row.importBatchId,
        month: row.month,
        orderNo: row.orderNo,
        customerOrderNo: row.customerOrderNo,
        rowIndex: row.rowIndex,
        sheetName: row.sheetName,
        sourceFileName: row.sourceFileName,
        rowHash: row.rowHash,
        parseStatus: row.parseStatus,
        parseMessage: row.parseMessage,
        raw: safeJson<Record<string, CellValue>>(row.rawJson, {}),
        canonical: safeJson<Record<string, CellValue>>(row.canonicalJson, {})
      }))
    };
  },

  async listChargeLines(params: { month?: string; orderNo?: string; batchId?: number; direction?: string; feeType?: string }) {
    const activeBatch = !params.batchId && params.month
      ? await prisma.importBatch.findFirst({
        where: { month: params.month, status: "active" },
        orderBy: { id: "desc" }
      })
      : null;
    const effectiveBatchId = params.batchId ?? activeBatch?.id;

    if (!params.batchId && params.month && !effectiveBatchId) {
      return { rows: [] };
    }

    const rows = await prisma.financeChargeLine.findMany({
      where: {
        month: params.month,
        orderNo: params.orderNo,
        importBatchId: effectiveBatchId,
        direction: params.direction ? { contains: params.direction } : undefined,
        feeType: params.feeType ? { contains: params.feeType } : undefined
      },
      orderBy: [{ rowIndex: "asc" }, { id: "asc" }],
      take: 1000
    });

    return {
      rows: rows.map((row) => ({
        id: row.id,
        importBatchId: row.importBatchId,
        financeOrderId: row.financeOrderId,
        rawLedgerLineId: row.rawLedgerLineId,
        month: row.month,
        orderNo: row.orderNo,
        customerOrderNo: row.customerOrderNo,
        customerName: row.customerName,
        salespersonName: row.salespersonName,
        customerServiceName: row.customerServiceName,
        direction: row.direction,
        feeType: row.feeType,
        service: row.service,
        supplierName: row.supplierName,
        currency: row.currency,
        exchangeRate: row.exchangeRate,
        originalAmount: row.originalAmount,
        localAmount: row.localAmount,
        signedAmount: row.signedAmount,
        isCompensation: row.isCompensation,
        isServiceBusiness: row.isServiceBusiness,
        rowIndex: row.rowIndex,
        sourceFileName: row.sourceFileName
      }))
    };
  },

  async rollbackImportBatch(id: number) {
    const batch = await prisma.importBatch.findUnique({ where: { id } });
    if (!batch) throw new Error("导入批次不存在。");
    if (batch.status === "reverted") throw new Error("导入批次已回滚。");
    await assertMonthOpen(batch.month, "回滚导入批次");

    await prisma.serviceBusinessRecord.deleteMany({ where: { financeOrder: { importBatchId: id } } });
    await prisma.settlementRecord.deleteMany({ where: { financeOrder: { importBatchId: id } } });
    await prisma.costAdjustment.deleteMany({ where: { financeOrder: { importBatchId: id } } });
    await prisma.riskRecord.deleteMany({ where: { financeOrder: { importBatchId: id } } });
    await prisma.commissionRecord.deleteMany({ where: { financeOrder: { importBatchId: id } } });
    await prisma.financeChargeLine.deleteMany({ where: { importBatchId: id } });
    await prisma.financeOrder.deleteMany({ where: { importBatchId: id } });
    await prisma.importBatch.update({ where: { id }, data: { status: "reverted", revertedAt: new Date() } });
    await rebuildFinanceSummary(batch.month);
    await writeActionLog({
      month: batch.month,
      entityType: "import_batch",
      entityId: id,
      action: "rollback_import_batch",
      payload: {
        batchNo: batch.batchNo,
        fileName: batch.fileName,
        importedOrders: batch.importedOrders,
        importedRows: batch.importedRows
      }
    });

    return { id, month: batch.month, status: "reverted" };
  }
};
