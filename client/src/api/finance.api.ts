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

export function importFinanceExcel(file: File, targetMonth?: string) {
  const formData = new FormData();
  formData.append("file", file);
  if (targetMonth) formData.append("targetMonth", targetMonth);
  return request.post("/finance/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000
  });
}

export function previewFinanceExcel(file: File, targetMonth?: string) {
  const formData = new FormData();
  formData.append("file", file);
  if (targetMonth) formData.append("targetMonth", targetMonth);
  return request.post("/finance/import-preview", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000
  });
}

export function importFinanceTemplate(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request.post("/finance/import-template", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000
  });
}

export function getImportTemplates() {
  return request.get("/finance/import-templates");
}

export function getImportBatches(month?: string) {
  return request.get("/finance/import-batches", params(month));
}

export function importBatchSourcePath(id: number) {
  return `/finance/import-batches/${id}/source`;
}

export function getRawLedgerLines(filters: { month?: string; orderNo?: string; batchId?: number }) {
  return request.get("/finance/raw-ledger-lines", { params: filters });
}

export function getChargeLines(filters: { month?: string; orderNo?: string; batchId?: number; direction?: string; feeType?: string }) {
  return request.get("/finance/charge-lines", { params: filters });
}

export function rollbackImportBatch(id: number) {
  return request.post(`/finance/import-batches/${id}/rollback`);
}

export function getParameterRules(month?: string) {
  return request.get("/finance/parameter-rules", { params: month ? { month } : undefined });
}

export function updateParameterRule(ruleKey: string, data: { valueJson: string; description?: string; updatedBy?: string; effectiveMonth?: string }) {
  return request.put(`/finance/parameter-rules/${ruleKey}`, data);
}

export function getAgentRules() {
  return request.get("/agent/rules");
}
