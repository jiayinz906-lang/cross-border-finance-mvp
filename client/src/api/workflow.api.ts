import { request } from "./request";
import { downloadAuthenticatedFile } from "./download";

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
  notificationChannel?: string | null;
  notifiedAt?: string | null;
  notificationReceiptJson?: string | null;
  notificationError?: string | null;
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

export function getDocuments(month?: string, documentType?: string) {
  return request.get("/workflow/documents", { params: { month, documentType } });
}

export function generateLogisticsDocuments(month?: string) {
  return request.post("/workflow/documents/logistics/generate", { month });
}

export function generateServiceDocuments(month?: string) {
  return request.post("/workflow/documents/service/generate", { month });
}

export function generateOperatorDocuments(month?: string) {
  return request.post("/workflow/documents/operator/generate", { month });
}

export function generateSalaryDocuments(month?: string) {
  return request.post("/workflow/documents/salary/generate", { month });
}

export function sendSignatureLink(id: number) {
  return request.post(`/workflow/documents/${id}/send-signature`);
}

export function markSignatureLinkNotified(id: number, channel = "manual_copy") {
  return request.post(`/workflow/documents/${id}/mark-notified`, { channel });
}

export type PublicSignatureDocument = {
  document: {
    id: number;
    month: string;
    ownerName: string;
    version: number;
    documentType: string;
    orderCount: number;
    grossProfit: number;
    commissionAmount: number;
    expiresAt: string;
  };
  payload: {
    title: string;
    documentCode: string;
    monthLabel: string;
    generatedAt: string;
    summary: Record<string, unknown>;
    details: Array<Record<string, unknown>>;
    statement: string;
  };
};

export function getPublicSignatureDocument(token: string) {
  return request.get<PublicSignatureDocument>(`/workflow/signature/${encodeURIComponent(token)}`);
}

export function signDocumentByToken(token: string, signedName: string) {
  return request.post(`/workflow/signature/${encodeURIComponent(token)}/sign`, {
    signedName,
    acceptedStatement: true
  });
}

export function employeeConfirmDocument(id: number) {
  return request.post(`/workflow/documents/${id}/employee-confirm`, {
    acceptedStatement: true
  });
}

export function supervisorConfirmDocument(id: number, adjustReason?: string) {
  return request.post(`/workflow/documents/${id}/supervisor-confirm`, { adjustReason });
}

export function voidDocument(id: number, voidReason: string) {
  return request.post(`/workflow/documents/${id}/void`, { voidReason });
}

export function createExportJob(exportType: string, fileFormat = "xlsx", month?: string, payload?: unknown) {
  return request.post("/workflow/exports", { month, exportType, fileFormat, payload });
}

export function exportDownloadUrl(id: number) {
  return `${request.defaults.baseURL}/workflow/exports/${id}/download`;
}

export function confirmationDocumentDownloadUrl(id: number, format: "pdf" | "png" = "pdf") {
  return `${request.defaults.baseURL}/workflow/documents/${id}/download?format=${encodeURIComponent(format)}`;
}

export async function downloadConfirmationDocumentFile(id: number, format: "pdf" | "png" = "pdf") {
  return downloadAuthenticatedFile(`/workflow/documents/${id}/download`, `confirmation-${id}.${format}`, { format });
}

export function downloadExportJobFile(id: number, fallbackFileName = `export-${id}.xlsx`) {
  return downloadAuthenticatedFile(`/workflow/exports/${id}/download`, fallbackFileName);
}

export function downloadMonthlyReport(month: string) {
  return downloadAuthenticatedFile("/reports/monthly/export", `${month}-finance-report.xlsx`, { month });
}

export function downloadSystemBackup(month?: string) {
  return downloadAuthenticatedFile("/workflow/backup/export", month ? `${month}-system-backup.xlsx` : "xjd-finance-system-backup.xlsx", month ? { month } : undefined);
}

export function monthlyReportExportUrl(month?: string) {
  month ??= new Date().toISOString().slice(0, 7);
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

export function confirmSalespersonCommission(salespersonName: string, month?: string, manualRate?: number, adjustReason?: string) {
  return request.post(`/workflow/commissions/${encodeURIComponent(salespersonName)}/confirm`, { month, manualRate, adjustReason });
}

export function getMonthCloseStatus(month?: string) {
  return request.get("/workflow/month-close", { params: { month } });
}

export function getMonthWorkflowStatus(month?: string) {
  return request.get<MonthWorkflowStatus>("/workflow/month-status", { params: { month } });
}

export function lockMonth(month?: string, note?: string) {
  return request.post("/workflow/month-close/lock", { month, note, operator: "主管" });
}

export function unlockMonth(month?: string, note?: string) {
  return request.post("/workflow/month-close/unlock", { month, note, operator: "主管" });
}

export function getActionLogs(filters: { month?: string; entityType?: string; entityId?: string; action?: string; operator?: string } = {}) {
  return request.get("/workflow/actions", { params: filters });
}
