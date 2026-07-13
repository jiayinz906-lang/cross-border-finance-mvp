import { request } from "./request";

export function getCustomerProfitAnalysis(month = "2026-06") {
  return request.get("/analytics/customer-profit", { params: { month } });
}

export function getOperatorPerformanceAnalysis(month = "2026-06") {
  return request.get("/analytics/operator-performance", { params: { month } });
}

export function updateOperatorPerformanceOverride(payload: {
  month: string;
  operatorName: string;
  category: string;
  orderCount?: number | null;
  baseCount?: number | null;
  rate?: number | null;
}) {
  return request.put("/analytics/operator-performance/overrides", payload);
}

export function updateOperatorPerformancePayoutNote(month: string, payoutNote: string) {
  return request.put("/analytics/operator-performance/payout-note", { month, payoutNote });
}
