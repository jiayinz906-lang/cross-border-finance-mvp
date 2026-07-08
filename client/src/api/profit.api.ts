import { request } from "./request";

export function getProfitAnalysis(month?: string) {
  return request.get("/profit/analysis", month ? { params: { month } } : undefined);
}
