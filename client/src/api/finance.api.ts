import { request } from "./request";

function params(month?: string) {
  return month ? { params: { month } } : undefined;
}

export function getHealth() {
  return request.get("/health");
}

export function getFinanceLedger(month?: string) {
  return request.get("/finance/ledger", params(month));
}

export function getFinanceSummary(month?: string) {
  return request.get("/finance/summary", params(month));
}

export function getFinanceDashboard(month?: string) {
  return request.get("/finance/dashboard", params(month));
}

export function importFinanceExcel(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request.post("/finance/import", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
}

export function getAgentRules() {
  return request.get("/agent/rules");
}
