import { receivableRepository } from "../repositories/receivable.repository.js";
import { financeRepository } from "../repositories/finance.repository.js";
import * as XLSX from "xlsx";

type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";
type BillingStatus = "unsettled" | "partial" | "settled" | "refund_due";

function monthEnd(month?: string) {
  if (!month) return new Date();
  const [year, monthNo] = month.split("-").map(Number);
  return new Date(year, monthNo, 0, 23, 59, 59, 999);
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
}

function bucket(days: number): AgingBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function settlementSnapshot(total: number, persistedAmount: number, records: Array<{ amount: number }>) {
  const recordedAmount = records.reduce((sum, record) => sum + record.amount, 0);
  const registeredAmount = Math.max(persistedAmount, recordedAmount);
  const settledAmount = Math.min(total, registeredAmount);
  const outstandingAmount = Math.max(0, total - registeredAmount);
  const refundAmount = Math.max(0, registeredAmount - total);
  const settlementRate = total > 0 ? Math.min(1, settledAmount / total) : 0;
  const billingStatus: BillingStatus = refundAmount > 0
    ? "refund_due"
    : outstandingAmount <= 0
      ? "settled"
      : settledAmount > 0
        ? "partial"
        : "unsettled";

  return { registeredAmount, settledAmount, outstandingAmount, refundAmount, settlementRate, billingStatus };
}

function statusLabel(status: BillingStatus) {
  if (status === "settled") return "已结清";
  if (status === "partial") return "部分回款";
  if (status === "refund_due") return "需退款";
  return "待回款";
}

export const receivableService = {
  async listReceivables(month?: string) {
    const selectedMonth = month ?? (await financeRepository.getLatestSummary())?.month;
    const rows = await receivableRepository.listReceivables(selectedMonth);
    const asOfDate = monthEnd(selectedMonth);
    const agingBuckets: Record<AgingBucket, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const customerMap = new Map<string, {
      customerName: string;
      orderCount: number;
      receivable: number;
      received: number;
      outstanding: number;
      overdueOutstanding: number;
      maxAgingDays: number;
    }>();

    const enrichedRows = rows.map((order) => {
      const { settlementRecords, ...financeOrder } = order;
      const settlement = settlementSnapshot(order.adjustedReceivable, order.receivedAmount, settlementRecords);
      const agingDays = daysBetween(order.orderDate, asOfDate);
      const agingBucket = bucket(agingDays);
      agingBuckets[agingBucket] += settlement.outstandingAmount;

      const customer = customerMap.get(order.customerName) ?? {
        customerName: order.customerName,
        orderCount: 0,
        receivable: 0,
        received: 0,
        outstanding: 0,
        overdueOutstanding: 0,
        maxAgingDays: 0
      };
      customer.orderCount += 1;
      customer.receivable += order.adjustedReceivable;
      customer.received += settlement.settledAmount;
      customer.outstanding += settlement.outstandingAmount;
      customer.overdueOutstanding += agingDays > 30 ? settlement.outstandingAmount : 0;
      customer.maxAgingDays = Math.max(customer.maxAgingDays, agingDays);
      customerMap.set(order.customerName, customer);

      return {
        ...financeOrder,
        receivedAmount: settlement.settledAmount,
        registeredReceiptAmount: settlement.registeredAmount,
        outstandingReceivable: settlement.outstandingAmount,
        refundableReceiptAmount: settlement.refundAmount,
        settlementRate: settlement.settlementRate,
        billingStatus: settlement.billingStatus,
        agingDays,
        agingBucket,
        overdue: settlement.outstandingAmount > 0 && agingDays > 30
      };
    });

    const totalReceivable = enrichedRows.reduce((sum, order) => sum + order.adjustedReceivable, 0);
    const totalReceived = enrichedRows.reduce((sum, order) => sum + order.receivedAmount, 0);
    const totalRegistered = enrichedRows.reduce((sum, order) => sum + order.registeredReceiptAmount, 0);
    const totalOutstanding = enrichedRows.reduce((sum, order) => sum + order.outstandingReceivable, 0);
    const totalRefund = enrichedRows.reduce((sum, order) => sum + order.refundableReceiptAmount, 0);

    return {
      month: selectedMonth,
      asOfDate,
      totals: {
        totalReceivable,
        totalReceived,
        totalRegistered,
        totalOutstanding,
        totalRefund,
        overdueOutstanding: enrichedRows.filter((order) => order.overdue).reduce((sum, order) => sum + order.outstandingReceivable, 0),
        overdueOrderCount: enrichedRows.filter((order) => order.overdue).length
      },
      agingBuckets,
      customerAging: Array.from(customerMap.values()).sort((a, b) => b.outstanding - a.outstanding),
      rows: enrichedRows
    };
  },

  async exportReceivables(month?: string) {
    const result = await receivableService.listReceivables(month);
    const rows = result.rows.map((row) => ({
      客户: row.customerName,
      系统订单号: row.orderNo,
      原始订单号: row.customerOrderNo || "-",
      业务类型: row.businessType,
      销售代表: row.salespersonName,
      订单日期: new Date(row.orderDate).toISOString().slice(0, 10),
      应收金额: row.adjustedReceivable,
      已登记回款: row.registeredReceiptAmount,
      已核销回款: row.receivedAmount,
      剩余未回款: row.outstandingReceivable,
      需退款: row.refundableReceiptAmount,
      结算进度: `${(row.settlementRate * 100).toFixed(2)}%`,
      结算状态: statusLabel(row.billingStatus),
      账龄天数: row.agingDays,
      账龄段: row.agingBucket
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 说明: "无应收账单" }]), "客户应收账单");
    return {
      buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer,
      fileName: `${result.month || "finance"}-customer-receivables.xlsx`
    };
  }
};
