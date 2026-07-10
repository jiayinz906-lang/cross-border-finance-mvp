import { payableRepository } from "../repositories/payable.repository.js";
import { financeRepository } from "../repositories/finance.repository.js";
import { prisma } from "../prisma/client.js";

type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";
type CanonicalLine = Record<string, unknown>;

type SupplierAccumulator = {
  supplierName: string;
  orderNos: Set<string>;
  payable: number;
  paid: number;
  outstanding: number;
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

function parseCanonical(raw?: string | null): CanonicalLine {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as CanonicalLine : {};
  } catch {
    return {};
  }
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .replace(/￥|¥|元|RMB|CNY/gi, "")
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isPayableDirection(value: string) {
  const direction = value.toLowerCase();
  return direction.includes("应付") || direction.includes("payable") || direction === "付";
}

function isCompensationFee(value: string) {
  return value.includes("赔付") || value.includes("赔偿") || value.toLowerCase().includes("compensation");
}

function payableAmountFromRawLine(canonical: CanonicalLine) {
  const direction = text(canonical.direction);
  if (!isPayableDirection(direction)) return 0;

  const convertedAmount = number(canonical.convertedAmount);
  const localAmount = number(canonical.localAmount);
  const originalAmount = number(canonical.amount);
  const rawAmount = convertedAmount !== 0 ? convertedAmount : localAmount !== 0 ? localAmount : originalAmount;
  if (rawAmount === 0) return 0;

  const feeType = text(canonical.feeType);
  if (convertedAmount !== 0 || isCompensationFee(feeType)) {
    return -rawAmount;
  }
  return Math.abs(rawAmount);
}

export const payableService = {
  async listPayables(month?: string) {
    const selectedMonth = month ?? (await financeRepository.getLatestSummary())?.month;
    const rows = await payableRepository.listPayables(selectedMonth);
    const asOfDate = monthEnd(selectedMonth);
    const agingBuckets: Record<AgingBucket, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const supplierMap = new Map<string, SupplierAccumulator>();
    const orderByNo = new Map(rows.map((order) => [order.orderNo, order]));

    const enrichedRows = rows.map((order) => {
      const outstanding = Math.max(0, order.adjustedPayable - order.paidAmount);
      const agingDays = daysBetween(order.orderDate, asOfDate);
      const agingBucket = bucket(agingDays);
      agingBuckets[agingBucket] += outstanding;

      return {
        ...order,
        outstandingPayable: outstanding,
        agingDays,
        agingBucket,
        overdue: outstanding > 0 && agingDays > 30
      };
    });

    if (selectedMonth && rows.length > 0) {
      const activeBatch = await prisma.importBatch.findFirst({
        where: { month: selectedMonth, status: "active" },
        orderBy: { id: "desc" }
      });

      const rawLines = activeBatch
        ? await prisma.rawLedgerLine.findMany({
          where: {
            importBatchId: activeBatch.id,
            parseStatus: "parsed",
            orderNo: { in: rows.map((order) => order.orderNo) }
          },
          orderBy: { rowIndex: "asc" }
        })
        : [];

      for (const rawLine of rawLines) {
        if (!rawLine.orderNo) continue;
        const order = orderByNo.get(rawLine.orderNo);
        if (!order) continue;

        const canonical = parseCanonical(rawLine.canonicalJson);
        const payableAmount = payableAmountFromRawLine(canonical);
        if (payableAmount === 0) continue;

        const supplierName = text(canonical.supplier) || "未指定供应商";
        const agingDays = daysBetween(order.orderDate, asOfDate);
        const supplier = supplierMap.get(supplierName) ?? {
          supplierName,
          orderNos: new Set<string>(),
          payable: 0,
          paid: 0,
          outstanding: 0,
          overdueOutstanding: 0,
          maxAgingDays: 0
        };
        supplier.orderNos.add(order.orderNo);
        supplier.payable += payableAmount;
        supplier.outstanding += payableAmount;
        supplier.overdueOutstanding += agingDays > 30 ? payableAmount : 0;
        supplier.maxAgingDays = Math.max(supplier.maxAgingDays, agingDays);
        supplierMap.set(supplierName, supplier);
      }
    }

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
      supplierAging: Array.from(supplierMap.values())
        .map((supplier) => ({
          supplierName: supplier.supplierName,
          orderCount: supplier.orderNos.size,
          payable: supplier.payable,
          paid: supplier.paid,
          outstanding: supplier.outstanding,
          overdueOutstanding: supplier.overdueOutstanding,
          maxAgingDays: supplier.maxAgingDays
        }))
        .sort((a, b) => b.outstanding - a.outstanding),
      rows: enrichedRows
    };
  }
};
