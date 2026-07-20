import { payableRepository } from "../repositories/payable.repository.js";
import { financeRepository } from "../repositories/finance.repository.js";
import { prisma } from "../prisma/client.js";
import * as XLSX from "xlsx";

type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";
type BillingStatus = "unsettled" | "partial" | "settled" | "refund_due";

type SupplierAccumulator = {
  supplierName: string;
  orderNos: Set<string>;
  payable: number;
  paid: number;
  outstanding: number;
  refundAmount: number;
  overdueOutstanding: number;
  maxAgingDays: number;
};

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
  if (status === "partial") return "部分付款";
  if (status === "refund_due") return "待退款/冲销";
  return "待付款";
}

function addSupplierAmount(
  supplierMap: Map<string, SupplierAccumulator>,
  input: {
    supplierName: string;
    orderNo: string;
    payable: number;
    paid: number;
    agingDays: number;
  }
) {
  const balance = input.payable - input.paid;
  const outstanding = Math.max(0, balance);
  const refundAmount = Math.max(0, -balance);
  const supplier = supplierMap.get(input.supplierName) ?? {
    supplierName: input.supplierName,
    orderNos: new Set<string>(),
    payable: 0,
    paid: 0,
    outstanding: 0,
    refundAmount: 0,
    overdueOutstanding: 0,
    maxAgingDays: 0
  };
  supplier.orderNos.add(input.orderNo);
  supplier.payable += input.payable;
  supplier.paid += input.paid;
  supplier.outstanding += outstanding;
  supplier.refundAmount += refundAmount;
  supplier.overdueOutstanding += input.agingDays > 30 ? outstanding : 0;
  supplier.maxAgingDays = Math.max(supplier.maxAgingDays, input.agingDays);
  supplierMap.set(input.supplierName, supplier);
}

export const payableService = {
  async listPayables(month?: string) {
    const selectedMonth = month ?? (await financeRepository.getLatestSummary())?.month;
    const rows = await payableRepository.listPayables(selectedMonth);
    const asOfDate = monthEnd(selectedMonth);
    const agingBuckets: Record<AgingBucket, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const supplierMap = new Map<string, SupplierAccumulator>();

    const activeBatch = selectedMonth
      ? await prisma.importBatch.findFirst({
        where: { month: selectedMonth, status: "active" },
        orderBy: { id: "desc" }
      })
      : null;
    const chargeLines = activeBatch && rows.length
      ? await prisma.financeChargeLine.findMany({
        where: {
          importBatchId: activeBatch.id,
          isServiceBusiness: false,
          direction: { contains: "应付" },
          orderNo: { in: rows.map((order) => order.orderNo) }
        },
        orderBy: [{ orderNo: "asc" }, { rowIndex: "asc" }]
      })
      : [];
    const chargesByOrder = new Map<string, typeof chargeLines>();
    for (const line of chargeLines) {
      const list = chargesByOrder.get(line.orderNo) ?? [];
      list.push(line);
      chargesByOrder.set(line.orderNo, list);
    }

    const enrichedRows = rows.map((order) => {
      const { settlementRecords, ...financeOrder } = order;
      const settlement = settlementSnapshot(order.adjustedPayable, order.paidAmount, settlementRecords);
      const agingDays = daysBetween(order.orderDate, asOfDate);
      const agingBucket = bucket(agingDays);
      agingBuckets[agingBucket] += settlement.outstandingAmount;

      const supplierAmounts = new Map<string, number>();
      for (const line of chargesByOrder.get(order.orderNo) ?? []) {
        const supplierName = line.supplierName?.trim() || "未指定供应商";
        supplierAmounts.set(supplierName, (supplierAmounts.get(supplierName) ?? 0) + line.localAmount);
      }
      if (!supplierAmounts.size) {
        supplierAmounts.set(order.supplierName?.trim() || "未指定供应商", order.adjustedPayable);
      }

      const positivePayableBasis = Array.from(supplierAmounts.values())
        .reduce((sum, amount) => sum + Math.max(0, amount), 0);
      for (const [supplierName, payable] of supplierAmounts.entries()) {
        const paid = positivePayableBasis > 0
          ? settlement.settledAmount * (Math.max(0, payable) / positivePayableBasis)
          : 0;
        addSupplierAmount(supplierMap, {
          supplierName,
          orderNo: order.orderNo,
          payable,
          paid,
          agingDays
        });
      }

      return {
        ...financeOrder,
        supplierName: Array.from(supplierAmounts.keys()).join("、"),
        supplierNames: Array.from(supplierAmounts.keys()),
        paidAmount: settlement.settledAmount,
        registeredPaymentAmount: settlement.registeredAmount,
        outstandingPayable: settlement.outstandingAmount,
        refundablePaymentAmount: settlement.refundAmount,
        settlementRate: settlement.settlementRate,
        billingStatus: settlement.billingStatus,
        agingDays,
        agingBucket,
        overdue: settlement.outstandingAmount > 0 && agingDays > 30
      };
    });

    const totalPayable = enrichedRows.reduce((sum, order) => sum + order.adjustedPayable, 0);
    const totalPaid = enrichedRows.reduce((sum, order) => sum + order.paidAmount, 0);
    const totalRegistered = enrichedRows.reduce((sum, order) => sum + order.registeredPaymentAmount, 0);
    const totalOutstanding = enrichedRows.reduce((sum, order) => sum + order.outstandingPayable, 0);
    const totalRefund = enrichedRows.reduce((sum, order) => sum + order.refundablePaymentAmount, 0);

    return {
      month: selectedMonth,
      asOfDate,
      totals: {
        totalPayable,
        totalPaid,
        totalRegistered,
        totalOutstanding,
        totalRefund,
        overdueOutstanding: enrichedRows.filter((order) => order.overdue).reduce((sum, order) => sum + order.outstandingPayable, 0),
        overdueOrderCount: enrichedRows.filter((order) => order.overdue).length
      },
      agingBuckets,
      supplierAging: Array.from(supplierMap.values())
        .map((supplier) => ({
          supplierName: supplier.supplierName,
          orderCount: supplier.orderNos.size,
          payable: supplier.payable,
          paid: supplier.paid,
          outstanding: supplier.outstanding,
          refundAmount: supplier.refundAmount,
          overdueOutstanding: supplier.overdueOutstanding,
          maxAgingDays: supplier.maxAgingDays
        }))
        .sort((a, b) => b.outstanding - a.outstanding),
      rows: enrichedRows
    };
  },

  async exportPayables(month?: string) {
    const result = await payableService.listPayables(month);
    const rows = result.rows.map((row) => ({
      供应商: row.supplierName || "未指定供应商",
      系统订单号: row.orderNo,
      原始订单号: row.customerOrderNo || "-",
      业务类型: row.businessType,
      销售代表: row.salespersonName,
      订单日期: new Date(row.orderDate).toISOString().slice(0, 10),
      应付金额: row.adjustedPayable,
      已登记付款: row.registeredPaymentAmount,
      已核销付款: row.paidAmount,
      剩余未付款: row.outstandingPayable,
      待退款或冲销: row.refundablePaymentAmount,
      结算进度: `${(row.settlementRate * 100).toFixed(2)}%`,
      结算状态: statusLabel(row.billingStatus),
      账龄天数: row.agingDays,
      账龄段: row.agingBucket
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 说明: "无应付账单" }]), "供应商应付账单");
    return {
      buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer,
      fileName: `${result.month || "finance"}-supplier-payables.xlsx`
    };
  }
};
