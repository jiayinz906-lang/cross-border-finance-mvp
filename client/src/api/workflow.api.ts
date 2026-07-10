import { request } from "./request";

export type ConfirmationDocument = {
  id: number;
  month: string;
  documentType: string;
  ownerName: string;
  version: number;
  businessType?: string | null;
  orderCount: number;
  grossProfit: number;
  commissionAmount: number;
  documentStatus: string;
  sendStatus: string;
  signatureStatus: string;
  supervisorStatus: string;
  signatureUrl?: string | null;
  adjustReason?: string | null;
  voidReason?: string | null;
  signedAt?: string | null;
  confirmedAt?: string | null;
  payloadJson?: string | null;
};

export type MonthWorkflowStep = {
  key: string;
  status: "pending" | "active" | "done" | "blocked" | string;
  count: number;
  ownerRole: string;
  nextAction: string;
};

export type MonthWorkflowStatus = {
  month: string;
  locked: boolean;
  readyToClose: boolean;
  blockers: string[];
  steps: MonthWorkflowStep[];
};

export type MonthCloseStatus = {
  id: number | null;
  month: string;
  status: "open" | "locked" | string;
  lockedBy?: string | null;
  lockedAt?: string | null;
  unlockedBy?: string | null;
  unlockedAt?: string | null;
  closeNote?: string | null;
};

export type ActionLogRow = {
  id: number;
  month?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  operator: string;
  payloadJson?: string | null;
  createdAt: string;
};

export function getDocuments(month = "2026-06", documentType?: string) {
  return request.get("/workflow/documents", { params: { month, documentType } });
}

export function generateLogisticsDocuments(month = "2026-06") {
  return request.post("/workflow/documents/logistics/generate", { month });
}

export function generateServiceDocuments(month = "2026-06") {
  return request.post("/workflow/documents/service/generate", { month });
}

export function generateOperatorDocuments(month = "2026-06") {
  return request.post("/workflow/documents/operator/generate", { month });
}

export function sendSignatureLink(id: number) {
  return request.post(`/workflow/documents/${id}/send-signature`);
}

export function signDocumentByToken(token: string) {
  return request.post(`/workflow/signature/${encodeURIComponent(token)}/sign`);
}

export function supervisorConfirmDocument(id: number, adjustReason?: string) {
  return request.post(`/workflow/documents/${id}/supervisor-confirm`, { adjustReason });
}

export function voidDocument(id: number, voidReason: string) {
  return request.post(`/workflow/documents/${id}/void`, { voidReason });
}

export function createExportJob(exportType: string, fileFormat = "xlsx", month = "2026-06", payload?: unknown) {
  return request.post("/workflow/exports", { month, exportType, fileFormat, payload });
}

export function exportDownloadUrl(id: number) {
  return `${request.defaults.baseURL}/workflow/exports/${id}/download`;
}

export function confirmationDocumentDownloadUrl(id: number, format: "xlsx" | "pdf" | "png" = "xlsx") {
  return `${request.defaults.baseURL}/workflow/documents/${id}/download?format=${encodeURIComponent(format)}`;
}

export async function downloadConfirmationDocumentFile(id: number, format: "xlsx" | "pdf" | "png" = "xlsx") {
  const response = await request.get(`/workflow/documents/${id}/download`, {
    params: { format },
    responseType: "blob"
  });
  const disposition = response.headers["content-disposition"] as string | undefined;
  const matched = disposition?.match(/filename="?(?:UTF-8'')?([^";]+)"?/i);
  const fileName = matched?.[1] ? decodeURIComponent(matched[1]) : `confirmation-${id}.${format}`;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function monthlyReportExportUrl(month = "2026-06") {
  return `${request.defaults.baseURL}/reports/monthly/export?month=${encodeURIComponent(month)}`;
}

export function systemBackupExportUrl(month?: string) {
  const query = month ? `?month=${encodeURIComponent(month)}` : "";
  return `${request.defaults.baseURL}/workflow/backup/export${query}`;
}

export function markRiskReviewed(id: number) {
  return request.post(`/workflow/risks/${id}/reviewed`);
}

export function confirmServiceRecord(id: number, finalCommission: number) {
  return request.post(`/workflow/service-records/${id}/confirm`, { finalCommission });
}

export function confirmSalespersonCommission(salespersonName: string, month = "2026-06", manualRate?: number, adjustReason?: string) {
  return request.post(`/workflow/commissions/${encodeURIComponent(salespersonName)}/confirm`, { month, manualRate, adjustReason });
}

export function getMonthCloseStatus(month = "2026-06") {
  return request.get("/workflow/month-close", { params: { month } });
}

export function getMonthWorkflowStatus(month = "2026-06") {
  return request.get<MonthWorkflowStatus>("/workflow/month-status", { params: { month } });
}

export function lockMonth(month = "2026-06", note?: string) {
  return request.post("/workflow/month-close/lock", { month, note, operator: "主管" });
}

export function unlockMonth(month = "2026-06", note?: string) {
  return request.post("/workflow/month-close/unlock", { month, note, operator: "主管" });
}

export function getActionLogs(filters: { month?: string; entityType?: string; entityId?: string; action?: string; operator?: string } = {}) {
  return request.get("/workflow/actions", { params: filters });
}
