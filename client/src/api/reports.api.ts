import { request } from "./request";

export function getMonthlyReport(month?: string) {
  return request.get("/reports/monthly", month ? { params: { month } } : undefined);
}

export function monthlyReportExportUrl(month?: string) {
  const query = month ? `?month=${encodeURIComponent(month)}` : "";
  return `${request.defaults.baseURL}/reports/monthly/export${query}`;
}
