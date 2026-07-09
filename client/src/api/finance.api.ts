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

export function getFinanceMonths() {
  return request.get("/finance/months");
}

export function getAuthContext() {
  return request.get("/finance/auth-context");
}

export function importFinanceExcel(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request.post("/finance/import", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
}

export function previewFinanceExcel(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request.post("/finance/import-preview", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
}

export function importFinanceTemplate(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request.post("/finance/import-template", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
}

export function getImportTemplates() {
  return request.get("/finance/import-templates");
}

export function getImportBatches(month?: string) {
  return request.get("/finance/import-batches", params(month));
}

export function getRawLedgerLines(filters: { month?: string; orderNo?: string; batchId?: number }) {
  return request.get("/finance/raw-ledger-lines", { params: filters });
}

export function rollbackImportBatch(id: number) {
  return request.post(`/finance/import-batches/${id}/rollback`);
}

export function getParameterRules() {
  return request.get("/finance/parameter-rules");
}

export function updateParameterRule(ruleKey: string, data: { valueJson: string; description?: string; updatedBy?: string }) {
  return request.put(`/finance/parameter-rules/${ruleKey}`, data);
}

export function getAgentRules() {
  return request.get("/agent/rules");
}
