import { request } from "./request";

export function getCustomerProfitAnalysis(month?: string) {
  return request.get("/analytics/customer-profit", { params: { month } });
}

export function getOperatorPerformanceAnalysis(month?: string) {
  return request.get("/analytics/operator-performance", { params: { month } });
}

export function updateOperatorPerformanceOverride(payload: {
  month: string;
  operatorName: string;
  category: string;
  orderCount?: number | null;
  baseCount?: number | null;
  rate?: number | null;
  reason?: string;
}) {
  return request.put("/analytics/operator-performance/overrides", payload);
}

export function updateOperatorPerformancePayoutNote(month: string, payoutNote: string) {
  return request.put("/analytics/operator-performance/payout-note", { month, payoutNote });
}
