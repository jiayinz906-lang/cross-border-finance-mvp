import * as XLSX from "xlsx";
import { prisma } from "../prisma/client.js";

type CellValue = string | number | boolean | Date | null | undefined;
type RawRow = Record<string, CellValue>;

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
  otherReceivable: number;
  payableFreight: number;
  payableClearance: number;
  payableDelivery: number;
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

const serviceBusinessKeywords = ["注册", "证书", "店铺", "商标", "注销", "EAC"];
const fallbackExchangeRate = 6.85;
const requiredDetailHeaders = ["运单号", "收付类型", "费用类型"];
const templateKey = "system_waybill_detail";

function text(value: CellValue): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function firstText(row: RawRow, keys: string[]): string {
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }
  return "";
}

function number(value: CellValue): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: CellValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function exchangeRateMarker(row: RawRow): string {
  return text(row["汇率"]) || text(row["备注"]) || text(row["备注_1"]);
}

function markedExchangeRate(row: RawRow): { rate: number; status: string; source: string } {
  const marker = exchangeRateMarker(row);
  const parsed = nullableNumber(marker);
  if (parsed !== null) {
    return {
      rate: parsed,
      status: "confirmed",
      source: parsed === 1 ? "原始表格标注1，按人民币" : `原始表格标注汇率 ${parsed}`
    };
  }

  if (/美金|美元|USD|\$|汇率未出/i.test(marker)) {
    return {
      rate: fallbackExchangeRate,
      status: "confirmed",
      source: `${marker || "美金"}，按固定汇率 ${fallbackExchangeRate}`
    };
  }

  return {
    rate: 1,
    status: marker ? "pending" : "confirmed",
    source: marker || "未标注汇率，按人民币暂列"
  };
}

function parseDate(value: CellValue): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  const parsed = new Date(text(value).replace(/-/g, "/"));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function monthOf(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function isServiceBusiness(service: string, feeType: string): boolean {
  return serviceBusinessKeywords.some((keyword) => service.includes(keyword) || feeType.includes(keyword));
}

function applyAmount(order: DraftOrder, direction: string, feeType: string, amount: number) {
  const isReceivable = direction.includes("应收");
  const isPayable = direction.includes("应付");
  if (!isReceivable && !isPayable) {
    return;
  }

  const target =
    feeType.includes("运费") ? "Freight" :
    feeType.includes("清关") || feeType.includes("报关") || feeType.includes("操作") || feeType.includes("拖车") ? "Clearance" :
    feeType.includes("派送") ? "Delivery" :
    "Other";

  if (isReceivable && target === "Freight") order.receivableFreight += amount;
  if (isReceivable && target === "Clearance") order.receivableClearance += amount;
  if (isReceivable && target === "Delivery") order.receivableDelivery += amount;
  if (isReceivable && target === "Other") order.otherReceivable += amount;
  if (isPayable && target === "Freight") order.payableFreight += amount;
  if (isPayable && target === "Clearance") order.payableClearance += amount;
  if (isPayable && target === "Delivery") order.payableDelivery += amount;
  if (isPayable && target === "Other") order.otherCost += amount;
}

function makeDraft(row: RawRow): DraftOrder {
  const orderDate = parseDate(row["下单时间"]);
  const service = text(row["服务"]) || "未分类业务";
  const feeType = text(row["费用类型"]);
  const serviceBusiness = isServiceBusiness(service, feeType);
  const exchange = markedExchangeRate(row);
  const orderNo = text(row["运单号"]);
  const salespersonName = text(row["销售代表"]) || "未分配";
  const customerServiceName = firstText(row, ["客服代表", "客服", "操作员", "客服人员", "客户代表", "跟单客服", "销售助理"]) || salespersonName;

  return {
    orderNo,
    customerOrderNo: text(row["客户订单号"]) || text(row["用户"]) || orderNo,
    orderDate,
    month: monthOf(orderDate),
    customerName: text(row["用户"]) || text(row["客户订单号"]) || text(row["运单号"]),
    customerType: serviceBusiness ? "service" : "logistics",
    salespersonName,
    customerServiceName,
    businessType: service,
    supplierName: text(row["供应商"]) || undefined,
    currency: "CNY",
    exchangeRate: exchange.rate,
    exchangeRateSource: exchange.source,
    exchangeRateStatus: exchange.status,
    receivableFreight: 0,
    receivableClearance: 0,
    receivableDelivery: 0,
    otherReceivable: 0,
    payableFreight: 0,
    payableClearance: 0,
    payableDelivery: 0,
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
    remark: [text(row["主品名"]), text(row["内部备注"])].filter(Boolean).join(" / ")
  };
}

function finalize(order: DraftOrder): DraftOrder {
  order.adjustedReceivable = order.receivableFreight + order.receivableClearance + order.receivableDelivery + order.otherReceivable;
  order.adjustedPayable = order.payableFreight + order.payableClearance + order.payableDelivery + order.otherCost;
  order.adjustedGrossProfit = order.adjustedReceivable - order.adjustedPayable;
  order.adjustedGrossProfitRate = order.adjustedReceivable > 0 ? order.adjustedGrossProfit / order.adjustedReceivable : null;

  const notes = [];
  if (order.exchangeRateStatus === "pending") notes.push("汇率缺失或非数字，待主管复核");
  if (order.adjustedGrossProfitRate !== null && order.adjustedGrossProfitRate < 0.1) notes.push("利润率低于 10%");
  if (order.adjustedGrossProfitRate !== null && order.adjustedGrossProfitRate > 0.5) notes.push("利润率高于 50%");
  if (order.adjustedPayable === 0 && !order.isServiceBusiness) notes.push("未识别到应付成本");
  if (order.isServiceBusiness) notes.push("注册/证书/店铺等服务类业务，进入主管确认，不计入物流利润分析");
  order.needSupervisorConfirm = order.needSupervisorConfirm || notes.length > 0;
  order.calculationNote = notes.join("；") || "Excel 导入后端自动聚合分析";
  return order;
}

function commissionRate(monthlyLogisticsProfit: number): number {
  if (monthlyLogisticsProfit >= 150000) return 0.3;
  if (monthlyLogisticsProfit >= 100000) return 0.25;
  if (monthlyLogisticsProfit >= 50000) return 0.2;
  return 0.15;
}

function riskLevel(order: { adjustedGrossProfitRate: number | null }): "high" | "medium" {
  if (order.adjustedGrossProfitRate !== null && order.adjustedGrossProfitRate > 0.5) {
    return "medium";
  }
  return "high";
}

function riskType(order: {
  exchangeRateStatus: string;
  adjustedGrossProfitRate: number | null;
  adjustedPayable: number;
  isServiceBusiness: boolean;
}): string {
  if (order.exchangeRateStatus === "pending") return "exchange_rate_missing";
  if (order.adjustedGrossProfitRate !== null && order.adjustedGrossProfitRate > 0.5) return "abnormal_high_profit";
  if (order.adjustedGrossProfitRate !== null && order.adjustedGrossProfitRate < 0.1) return "low_profit";
  if (order.adjustedPayable === 0 && !order.isServiceBusiness) return "cost_missing";
  if (order.isServiceBusiness) return "service_confirm";
  return "finance_review";
}

function normalizeHeader(value: CellValue) {
  return text(value).replace(/\s+/g, "");
}

function extractHeaders(workbook: XLSX.WorkBook): { sheetName: string; headerRowIndex: number; headers: string[] } {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<CellValue[]>(sheet, { header: 1, defval: null, raw: true });

    for (const [index, row] of rows.entries()) {
      const headers = row.map((cell) => text(cell)).filter(Boolean);
      const normalized = new Set(headers.map(normalizeHeader));
      if (requiredDetailHeaders.every((header) => normalized.has(header))) {
        return { sheetName, headerRowIndex: index + 1, headers };
      }
    }
  }

  throw new Error("Excel 文件没有找到系统运单明细工作表，请确认包含：运单号、收付类型、费用类型");
}

function findDetailSheet(workbook: XLSX.WorkBook): { sheetName: string; headerRowIndex: number; headers: string[]; rows: RawRow[] } {
  const detail = extractHeaders(workbook);
  const sheet = workbook.Sheets[detail.sheetName];
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: true, range: detail.headerRowIndex - 1 });
  return { ...detail, rows };
}

async function validateHeaders(headers: string[]) {
  const template = await prisma.excelImportTemplate.findUnique({ where: { templateKey } });
  if (!template) return;

  const expected = JSON.parse(template.headersJson) as string[];
  const current = headers.map(normalizeHeader);
  const saved = expected.map(normalizeHeader);
  if (JSON.stringify(current) !== JSON.stringify(saved)) {
    throw new Error(`Excel 表头与数据库模板不一致，请按模板导入。当前表头：${headers.join("、")}`);
  }
}

export const excelService = {
  async saveImportTemplate(buffer: Buffer, originalName: string) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const detail = extractHeaders(workbook);
    const template = await prisma.excelImportTemplate.upsert({
      where: { templateKey },
      update: {
        fileName: originalName,
        sheetName: detail.sheetName,
        headerRowIndex: detail.headerRowIndex,
        headersJson: JSON.stringify(detail.headers)
      },
      create: {
        templateKey,
        fileName: originalName,
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
      importedOrders: 0
    };
  },

  async importWorkbook(buffer: Buffer, originalName: string) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const { sheetName, headers, rows } = findDetailSheet(workbook);
    await validateHeaders(headers);
    if (!rows.length) {
      throw new Error("Excel 工作表没有明细数据");
    }

    const orders = new Map<string, DraftOrder>();
    for (const row of rows) {
      const orderNo = text(row["运单号"]);
      if (!orderNo) continue;

      const draft = orders.get(orderNo) ?? makeDraft(row);
      const feeType = text(row["费用类型"]);
      const direction = text(row["收付类型"]);
      const originalAmount = number(row["金额"]) || number(row["本币费用"]);
      const amount = Math.abs(originalAmount * markedExchangeRate(row).rate);
      draft.supplierName = draft.supplierName || text(row["供应商"]) || undefined;
      draft.customerOrderNo = text(row["客户订单号"]) || draft.customerOrderNo || text(row["用户"]) || orderNo;
      draft.isServiceBusiness = draft.isServiceBusiness || isServiceBusiness(text(row["服务"]), feeType);
      draft.needSupervisorConfirm = draft.needSupervisorConfirm || draft.isServiceBusiness;
      applyAmount(draft, direction, feeType, amount);
      orders.set(orderNo, draft);
    }

    const finalized = Array.from(orders.values()).map(finalize);
    const month = finalized[0]?.month ?? monthOf(new Date());
    const monthOrders = finalized.filter((order) => order.month === month);

    await prisma.serviceBusinessRecord.deleteMany({ where: { financeOrder: { month } } });
    await prisma.costAdjustment.deleteMany({ where: { financeOrder: { month } } });
    await prisma.riskRecord.deleteMany({ where: { financeOrder: { month } } });
    await prisma.commissionRecord.deleteMany({ where: { financeOrder: { month } } });
    await prisma.financeSummary.deleteMany({ where: { month } });
    await prisma.financeOrder.deleteMany({ where: { month } });

    const createdOrders = [];
    for (const order of monthOrders) {
      createdOrders.push(await prisma.financeOrder.create({ data: order }));
    }

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
      if (!order.isServiceBusiness && order.adjustedGrossProfit > 0) {
        const rate = commissionRate(logisticsProfitBySalesperson.get(order.salespersonName) ?? 0);
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

      if (order.needSupervisorConfirm || (order.adjustedGrossProfitRate ?? 1) < 0.1 || (order.adjustedGrossProfitRate ?? 0) > 0.5) {
        await prisma.riskRecord.create({
          data: {
            financeOrderId: order.id,
            riskLevel: riskLevel(order),
            riskType: riskType(order),
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

    const totalReceivable = createdOrders.reduce((sum, order) => sum + order.adjustedReceivable, 0);
    const totalPayable = createdOrders.reduce((sum, order) => sum + order.adjustedPayable, 0);
    const totalGrossProfit = createdOrders.reduce((sum, order) => sum + order.adjustedGrossProfit, 0);
    const commissions = await prisma.commissionRecord.findMany({ where: { financeOrder: { month } } });

    await prisma.financeSummary.create({
      data: {
        month,
        totalReceivable,
        totalPayable,
        totalReceived: createdOrders.reduce((sum, order) => sum + order.receivedAmount, 0),
        totalPaid: createdOrders.reduce((sum, order) => sum + order.paidAmount, 0),
        totalGrossProfit,
        grossProfitRate: totalReceivable > 0 ? totalGrossProfit / totalReceivable : null,
        totalCommission: commissions.reduce((sum, item) => sum + item.commissionAmount, 0),
        riskOrderCount: createdOrders.filter((order) => (order.adjustedGrossProfitRate ?? 1) < 0.1 || order.needSupervisorConfirm).length,
        abnormalHighProfitOrderCount: createdOrders.filter((order) => (order.adjustedGrossProfitRate ?? 0) > 0.5).length,
        pendingSupervisorConfirmCount: createdOrders.filter((order) => order.needSupervisorConfirm).length
      }
    });

    return {
      fileName: originalName,
      sheetName,
      month,
      importedRows: rows.length,
      importedOrders: createdOrders.length,
      serviceOrders: createdOrders.filter((order) => order.isServiceBusiness).length,
      logisticsOrders: createdOrders.filter((order) => !order.isServiceBusiness).length
    };
  }
};
