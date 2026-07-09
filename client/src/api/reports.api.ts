import { request } from "./request";

export function getMonthlyReport(month?: string) {
  return request.get("/reports/monthly", month ? { params: { month } } : undefined);
}
