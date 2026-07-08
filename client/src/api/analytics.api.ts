import { request } from "./request";

export function getCustomerProfitAnalysis(month = "2026-06") {
  return request.get("/analytics/customer-profit", { params: { month } });
}

export function getOperatorPerformanceAnalysis(month = "2026-06") {
  return request.get("/analytics/operator-performance", { params: { month } });
}
