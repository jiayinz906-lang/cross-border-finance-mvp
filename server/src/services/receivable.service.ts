import { receivableRepository } from "../repositories/receivable.repository.js";
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
      const outstanding = Math.max(0, order.adjustedReceivable - order.receivedAmount);
      const agingDays = daysBetween(order.orderDate, asOfDate);
      const agingBucket = bucket(agingDays);
      agingBuckets[agingBucket] += outstanding;

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
      customer.received += order.receivedAmount;
      customer.outstanding += outstanding;
      customer.overdueOutstanding += agingDays > 30 ? outstanding : 0;
      customer.maxAgingDays = Math.max(customer.maxAgingDays, agingDays);
      customerMap.set(order.customerName, customer);

      return {
        ...order,
        outstandingReceivable: outstanding,
        agingDays,
        agingBucket,
        overdue: outstanding > 0 && agingDays > 30
      };
    });

    const totalReceivable = enrichedRows.reduce((sum, order) => sum + order.adjustedReceivable, 0);
    const totalReceived = enrichedRows.reduce((sum, order) => sum + order.receivedAmount, 0);
    const totalOutstanding = enrichedRows.reduce((sum, order) => sum + order.outstandingReceivable, 0);

    return {
      month: selectedMonth,
      asOfDate,
      totals: {
        totalReceivable,
        totalReceived,
        totalOutstanding,
        overdueOutstanding: enrichedRows.filter((order) => order.overdue).reduce((sum, order) => sum + order.outstandingReceivable, 0),
        overdueOrderCount: enrichedRows.filter((order) => order.overdue).length
      },
      agingBuckets,
      customerAging: Array.from(customerMap.values()).sort((a, b) => b.outstanding - a.outstanding),
      rows: enrichedRows
    };
  }
};
