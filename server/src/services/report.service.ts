import { reportRepository } from "../repositories/report.repository.js";
import { financeService } from "./finance.service.js";
import { payableService } from "./payable.service.js";
import { receivableService } from "./receivable.service.js";
import * as XLSX from "xlsx";
import { allFinanceAccess } from "../security/finance-access.js";
import type { FinanceAccessScope } from "../security/finance-access.js";

function rate(value?: number | null) {
  return typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "-";
}

function money(value?: number | null) {
  return Math.round((value ?? 0) * 100) / 100;
}

function dateText(value?: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toISOString().slice(0, 10);
}

function appendSheet(workbook: XLSX.WorkBook, rows: Record<string, unknown>[], sheetName: string) {
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 说明: "无数据" }]);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
}

export const reportService = {
  async listServiceRecords(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    const rows = await reportRepository.listServiceRecords(month, scope);
    if (scope.mode === "all") return rows;
    return rows.map(({ costAmount, financeOrder, ...record }) => {
      void costAmount;
      return {
        ...record,
        financeOrder: {
          orderNo: financeOrder.orderNo,
          customerOrderNo: financeOrder.customerOrderNo,
          customerName: financeOrder.customerName,
          salespersonName: financeOrder.salespersonName,
          customerServiceName: financeOrder.customerServiceName
        }
      };
    });
  },

  getMonthlyReport(month?: string) {
    return reportRepository.getMonthlyReport(month);
  },

  async exportMonthlyReport(month?: string) {
    const [report, dashboard, receivables, payables] = await Promise.all([
      reportRepository.getMonthlyReport(month),
      financeService.getDashboard(month),
      receivableService.listReceivables(month),
      payableService.listPayables(month)
    ]);
    const selectedMonth = report.summary?.month ?? month ?? "latest";
    const workbook = XLSX.utils.book_new();
    const summary = report.summary;
    const logisticsOrders = report.orders.filter((item) => !item.isServiceBusiness);
    const serviceOrders = report.orders.filter((item) => item.isServiceBusiness);
    const reviewedRisks = report.risks.filter((item) => item.status === "reviewed").length;
    const pendingRisks = report.risks.length - reviewedRisks;

    appendSheet(workbook, [
      { 项目: "月份", 数值: selectedMonth },
      { 项目: "总应收", 数值: money(summary?.totalReceivable) },
      { 项目: "总应付", 数值: money(summary?.totalPayable) },
      { 项目: "调整后毛利", 数值: money(summary?.totalGrossProfit) },
      { 项目: "毛利率", 数值: rate(summary?.grossProfitRate) },
      { 项目: "物流订单数", 数值: logisticsOrders.length },
      { 项目: "注册/服务类订单数", 数值: serviceOrders.length },
      { 项目: "物流提成", 数值: money(summary?.totalCommission) },
      { 项目: "风险记录", 数值: report.risks.length },
      { 项目: "待复核风险", 数值: pendingRisks },
      { 项目: "已复核风险", 数值: reviewedRisks },
      { 项目: "CFO结论", 数值: pendingRisks > 0 ? "存在待复核风险，建议完成风险闭环后锁账。" : "风险已复核，可进入月度锁账与归档。" }
    ], "CFO管理层摘要");

    appendSheet(workbook, [{
      月份: summary?.month ?? selectedMonth,
      总应收: money(summary?.totalReceivable),
      总应付: money(summary?.totalPayable),
      已回款: money(summary?.totalReceived),
      已付款: money(summary?.totalPaid),
      调整后毛利: money(summary?.totalGrossProfit),
      毛利率: rate(summary?.grossProfitRate),
      物流提成: money(summary?.totalCommission),
      风险票数: summary?.riskOrderCount ?? 0,
      异常高利润票数: summary?.abnormalHighProfitOrderCount ?? 0,
      待主管确认: summary?.pendingSupervisorConfirmCount ?? 0
    }], "月度营收毛利总览");

    appendSheet(workbook, dashboard.businessSummary.map((item) => ({
      业务类型: item.businessType,
      票数: item.orderCount,
      应收: money(item.receivable),
      应付: money("payable" in item && typeof item.payable === "number" ? item.payable : 0),
      毛利: money(item.grossProfit),
      物流口径毛利: money(item.logisticsProfit),
      毛利率: rate(item.grossProfitRate),
      环比毛利变化: rate(item.momGrossProfitChange),
      同比毛利变化: rate(item.yoyGrossProfitChange)
    })), "业务类型利润汇总");

    appendSheet(workbook, report.orders.map((item) => ({
      单号: item.orderNo,
      原始订单号: item.customerOrderNo,
      下单日期: dateText(item.orderDate),
      客户: item.customerName,
      业务类型: item.businessType,
      销售代表: item.salespersonName,
      客服代表: item.customerServiceName,
      供应商: item.supplierName,
      是否服务类: item.isServiceBusiness ? "是" : "否",
      应收运费: money(item.receivableFreight),
      应收清关: money(item.receivableClearance),
      应收派送: money(item.receivableDelivery),
      应收赔付: money(item.receivableCompensation),
      其他应收: money(item.otherReceivable),
      应付运费: money(item.payableFreight),
      应付清关: money(item.payableClearance),
      应付派送: money(item.payableDelivery),
      应付赔付: money(item.payableCompensation),
      其他成本: money(item.otherCost),
      调整后应收: money(item.adjustedReceivable),
      调整后应付: money(item.adjustedPayable),
      调整后毛利: money(item.adjustedGrossProfit),
      毛利率: rate(item.adjustedGrossProfitRate),
      汇率状态: item.exchangeRateStatus,
      计算说明: item.calculationNote
    })), "单票毛利明细");

    appendSheet(workbook, receivables.rows.map((item) => ({
      单号: item.orderNo,
      客户: item.customerName,
      业务类型: item.businessType,
      应收: money(item.adjustedReceivable),
      已回款: money(item.receivedAmount),
      未回款: money(item.outstandingReceivable),
      账龄天数: item.agingDays,
      账龄区间: item.agingBucket,
      是否逾期: item.overdue ? "是" : "否",
      回款状态: item.receivableStatus
    })), "应收回款跟进表");

    appendSheet(workbook, payables.rows.map((item) => ({
      单号: item.orderNo,
      供应商: item.supplierName || "未指定供应商",
      业务类型: item.businessType,
      应付: money(item.adjustedPayable),
      已付款: money(item.paidAmount),
      未付款: money(item.outstandingPayable),
      账龄天数: item.agingDays,
      账龄区间: item.agingBucket,
      是否逾期: item.overdue ? "是" : "否",
      付款状态: item.payableStatus
    })), "上游应付分析");

    appendSheet(workbook, payables.supplierAging.map((item) => ({
      供应商: item.supplierName,
      票数: item.orderCount,
      应付金额: money(item.payable),
      已付款: money(item.paid),
      未付款: money(item.outstanding),
      逾期未付款: money(item.overdueOutstanding),
      最大账龄天数: item.maxAgingDays
    })), "供应商应付占比");

    appendSheet(workbook, report.risks.map((item) => ({
      单号: item.financeOrder.orderNo,
      客户: item.financeOrder.customerName,
      业务类型: item.financeOrder.businessType,
      等级: item.riskLevel,
      风险类型: item.riskType,
      原因: item.riskReasons,
      建议: item.suggestion,
      状态: item.status,
      复核结论: item.reviewConclusion,
      复核说明: item.reviewNote,
      复核人: item.reviewedBy,
      复核时间: item.reviewedAt ? dateText(item.reviewedAt) : "-"
    })), "风险复查");

    appendSheet(workbook, report.commissions.map((item) => ({
      单号: item.financeOrder.orderNo,
      业务员: item.salespersonName,
      业务类型: item.businessType,
      毛利: money(item.grossProfit),
      提成比例: rate(item.commissionRate),
      提成金额: money(item.manualCommissionAmount ?? item.commissionAmount),
      状态: item.confirmStatus
    })), "业务员提成汇总");

    appendSheet(workbook, report.serviceRecords.map((item) => ({
      单号: item.financeOrder.orderNo,
      服务类型: item.serviceType,
      成交单价: money(item.originalPrice),
      成本: money(item.costAmount),
      毛利: money(item.grossProfit),
      建议提成下限: money(item.suggestedCommissionMin),
      建议提成上限: money(item.suggestedCommissionMax),
      主管确认价格: money(item.supervisorFinalPrice),
      主管确认提成: money(item.supervisorFinalCommission),
      状态: item.confirmStatus
    })), "注册服务主管确认");

    appendSheet(workbook, [
      { 假设项: "汇率口径", 规则: "人民币按 1；美元/USD/汇率未出按 6.85；其他标注按原始表格标注执行。" },
      { 假设项: "风险口径", 规则: "毛利率低于 10% 标记高风险；高于 50% 标记异常高利润并复核成本漏录。" },
      { 假设项: "物流提成", 规则: "按销售代表自然月物流毛利档位计算；主管可确认调整。" },
      { 假设项: "服务类业务", 规则: "注册、EAC、商标、店铺租赁等单独进入主管确认，不进入物流提成口径。" },
      { 假设项: "追溯口径", 规则: "所有汇总金额来自单票明细，原始 Excel 行另存于数据库 RawLedgerLine。" }
    ], "参数规则与假设");

    return {
      fileName: `${selectedMonth}-finance-report.xlsx`,
      buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
    };
  }
};
