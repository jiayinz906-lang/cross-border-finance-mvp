import { request } from "./request";

export type ConfirmationDocument = {
  id: number;
  month: string;
  documentType: string;
  ownerName: string;
  businessType?: string | null;
  orderCount: number;
  grossProfit: number;
  commissionAmount: number;
  documentStatus: string;
  sendStatus: string;
  signatureStatus: string;
  supervisorStatus: string;
  signatureUrl?: string | null;
  signedAt?: string | null;
  confirmedAt?: string | null;
  payloadJson?: string | null;
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

export function sendSignatureLink(id: number) {
  return request.post(`/workflow/documents/${id}/send-signature`);
}

export function supervisorConfirmDocument(id: number) {
  return request.post(`/workflow/documents/${id}/supervisor-confirm`);
}

export function voidDocument(id: number) {
  return request.post(`/workflow/documents/${id}/void`);
}

export function createExportJob(exportType: string, fileFormat = "xlsx", month = "2026-06", payload?: unknown) {
  return request.post("/workflow/exports", { month, exportType, fileFormat, payload });
}

export function exportDownloadUrl(id: number) {
  return `${request.defaults.baseURL}/workflow/exports/${id}/download`;
}

export function monthlyReportExportUrl(month = "2026-06") {
  return `${request.defaults.baseURL}/reports/monthly/export?month=${encodeURIComponent(month)}`;
}

export function markRiskReviewed(id: number) {
  return request.post(`/workflow/risks/${id}/reviewed`);
}

export function confirmServiceRecord(id: number, finalCommission: number) {
  return request.post(`/workflow/service-records/${id}/confirm`, { finalCommission });
}

export function confirmSalespersonCommission(salespersonName: string, month = "2026-06", manualRate?: number) {
  return request.post(`/workflow/commissions/${encodeURIComponent(salespersonName)}/confirm`, { month, manualRate });
}
