import { reportRepository } from "../repositories/report.repository.js";
import * as XLSX from "xlsx";

export const reportService = {
  getMonthlyReport(month?: string) {
    return reportRepository.getMonthlyReport(month);
  },

  async exportMonthlyReport(month?: string) {
    const report = await reportRepository.getMonthlyReport(month);
    const selectedMonth = report.summary?.month ?? month ?? "latest";
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([report.summary ?? {}]), "月度营收毛利总览");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.risks.map((item) => ({
      单号: item.financeOrder.orderNo,
      客户: item.financeOrder.customerName,
      业务类型: item.financeOrder.businessType,
      等级: item.riskLevel,
      风险类型: item.riskType,
      原因: item.riskReasons,
      建议: item.suggestion,
      状态: item.status
    }))), "风险复查");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.commissions.map((item) => ({
      单号: item.financeOrder.orderNo,
      业务员: item.salespersonName,
      业务类型: item.businessType,
      毛利: item.grossProfit,
      提成比例: item.commissionRate,
      提成金额: item.manualCommissionAmount ?? item.commissionAmount,
      状态: item.confirmStatus
    }))), "物流提成");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.serviceRecords.map((item) => ({
      单号: item.financeOrder.orderNo,
      服务类型: item.serviceType,
      成交单价: item.originalPrice,
      成本: item.costAmount,
      毛利: item.grossProfit,
      建议提成下限: item.suggestedCommissionMin,
      建议提成上限: item.suggestedCommissionMax,
      主管确认提成: item.supervisorFinalCommission,
      状态: item.confirmStatus
    }))), "注册确认");

    return {
      fileName: `${selectedMonth}-finance-report.xlsx`,
      buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
    };
  }
};
