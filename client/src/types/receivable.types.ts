import type { FinanceOrder } from "./finance.types";

export type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";

export type ReceivableRow = FinanceOrder & {
  registeredReceiptAmount: number;
  outstandingReceivable: number;
  refundableReceiptAmount: number;
  settlementRate: number;
  billingStatus: "unsettled" | "partial" | "settled" | "refund_due";
  agingDays: number;
  agingBucket: AgingBucket;
  overdue: boolean;
};

export type CustomerReceivableAging = {
  customerName: string;
  orderCount: number;
  receivable: number;
  received: number;
  outstanding: number;
  overdueOutstanding: number;
  maxAgingDays: number;
};

export type ReceivableResponse = {
  month: string;
  asOfDate: string;
  totals: {
    totalReceivable: number;
    totalReceived: number;
    totalRegistered: number;
    totalOutstanding: number;
    totalRefund: number;
    overdueOutstanding: number;
    overdueOrderCount: number;
  };
  agingBuckets: Record<AgingBucket, number>;
  customerAging: CustomerReceivableAging[];
  rows: ReceivableRow[];
};
