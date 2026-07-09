import type { FinanceOrder } from "./finance.types";

export type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";

export type PayableRow = FinanceOrder & {
  outstandingPayable: number;
  agingDays: number;
  agingBucket: AgingBucket;
  overdue: boolean;
};

export type SupplierPayableAging = {
  supplierName: string;
  orderCount: number;
  payable: number;
  paid: number;
  outstanding: number;
  overdueOutstanding: number;
  maxAgingDays: number;
};

export type PayableResponse = {
  month: string;
  asOfDate: string;
  totals: {
    totalPayable: number;
    totalPaid: number;
    totalOutstanding: number;
    overdueOutstanding: number;
    overdueOrderCount: number;
  };
  agingBuckets: Record<AgingBucket, number>;
  supplierAging: SupplierPayableAging[];
  rows: PayableRow[];
};
