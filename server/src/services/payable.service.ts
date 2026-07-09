import { payableRepository } from "../repositories/payable.repository.js";
import { financeRepository } from "../repositories/finance.repository.js";

type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";

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

export const payableService = {
  async listPayables(month?: string) {
    const selectedMonth = month ?? (await financeRepository.getLatestSummary())?.month;
    const rows = await payableRepository.listPayables(selectedMonth);
    const asOfDate = monthEnd(selectedMonth);
    const agingBuckets: Record<AgingBucket, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const supplierMap = new Map<string, {
      supplierName: string;
      orderCount: number;
      payable: number;
      paid: number;
      outstanding: number;
      overdueOutstanding: number;
      maxAgingDays: number;
    }>();

    const enrichedRows = rows.map((order) => {
      const outstanding = Math.max(0, order.adjustedPayable - order.paidAmount);
      const agingDays = daysBetween(order.orderDate, asOfDate);
      const agingBucket = bucket(agingDays);
      agingBuckets[agingBucket] += outstanding;
      const supplierName = order.supplierName || "未指定供应商";

      const supplier = supplierMap.get(supplierName) ?? {
        supplierName,
        orderCount: 0,
        payable: 0,
        paid: 0,
        outstanding: 0,
        overdueOutstanding: 0,
        maxAgingDays: 0
      };
      supplier.orderCount += 1;
      supplier.payable += order.adjustedPayable;
      supplier.paid += order.paidAmount;
      supplier.outstanding += outstanding;
      supplier.overdueOutstanding += agingDays > 30 ? outstanding : 0;
      supplier.maxAgingDays = Math.max(supplier.maxAgingDays, agingDays);
      supplierMap.set(supplierName, supplier);

      return {
        ...order,
        outstandingPayable: outstanding,
        agingDays,
        agingBucket,
        overdue: outstanding > 0 && agingDays > 30
      };
    });

    const totalPayable = enrichedRows.reduce((sum, order) => sum + order.adjustedPayable, 0);
    const totalPaid = enrichedRows.reduce((sum, order) => sum + order.paidAmount, 0);
    const totalOutstanding = enrichedRows.reduce((sum, order) => sum + order.outstandingPayable, 0);

    return {
      month: selectedMonth,
      asOfDate,
      totals: {
        totalPayable,
        totalPaid,
        totalOutstanding,
        overdueOutstanding: enrichedRows.filter((order) => order.overdue).reduce((sum, order) => sum + order.outstandingPayable, 0),
        overdueOrderCount: enrichedRows.filter((order) => order.overdue).length
      },
      agingBuckets,
      supplierAging: Array.from(supplierMap.values()).sort((a, b) => b.outstanding - a.outstanding),
      rows: enrichedRows
    };
  }
};
