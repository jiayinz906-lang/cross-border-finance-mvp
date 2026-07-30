import type { ManualDocumentInput, ManualDocumentListResult, ManualLedgerListResult, ManualLedgerSummary } from "../types/manual-ledger.types";
import { request } from "./request";

export type ManualLedgerFilters = {
  month?: string;
  keyword?: string;
  direction?: string;
  status?: string;
  sourceType?: string;
  page?: number;
  pageSize?: number;
};

export function getManualLedgerEntries(filters: ManualLedgerFilters) {
  return request.get<ManualLedgerListResult>("/finance/manual-entries", { params: filters });
}

export function getManualLedgerSummary(month?: string) {
  return request.get<ManualLedgerSummary>("/finance/manual-entries/summary", { params: month ? { month } : undefined });
}

export function getManualDocuments(filters: Pick<ManualLedgerFilters, "month" | "keyword" | "status" | "page" | "pageSize">) {
  return request.get<ManualDocumentListResult>("/finance/manual-documents", { params: filters });
}

export function createManualDocument(values: ManualDocumentInput, files: File[]) {
  const formData = new FormData();
  formData.append("payload", JSON.stringify(values));
  files.forEach((file) => formData.append("files", file));
  return request.post("/finance/manual-documents", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000
  });
}

export function confirmManualDocument(documentNo: string) {
  return request.post(`/finance/manual-documents/${encodeURIComponent(documentNo)}/confirm`, undefined, { timeout: 120000 });
}

export function voidManualDocument(documentNo: string, reason: string) {
  return request.post(`/finance/manual-documents/${encodeURIComponent(documentNo)}/void`, { reason }, { timeout: 120000 });
}

export function createManualLedgerEntry(values: Record<string, unknown>, files: File[]) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") formData.append(key, String(value));
  });
  files.forEach((file) => formData.append("files", file));
  return request.post("/finance/manual-entries", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000
  });
}

export function confirmManualLedgerEntry(id: number) {
  return request.post(`/finance/manual-entries/${id}/confirm`);
}

export function voidManualLedgerEntry(id: number, reason: string) {
  return request.post(`/finance/manual-entries/${id}/void`, { reason });
}

export function getLedgerAttachment(entryId: number, attachmentId: number, download = false) {
  return request.get<Blob>(`/finance/manual-entries/${entryId}/attachments/${attachmentId}`, {
    params: download ? { download: "true" } : undefined,
    responseType: "blob"
  });
}
