import { request } from "./request";
import { downloadAuthenticatedFile } from "./download";

export function getReceivables(month?: string) {
  return request.get("/receivables", month ? { params: { month } } : undefined);
}

export function exportReceivables(month: string) {
  return downloadAuthenticatedFile("/receivables/export", `${month}-customer-receivables.xlsx`, { month });
}

export function recordReceipt(orderId: number, data: { amount: number; settledAt?: string; operator?: string; note?: string }) {
  return request.post(`/receivables/${orderId}/receipts`, data);
}

export function getReceiptRecords(month?: string) {
  return request.get("/receivables/settlements", month ? { params: { month } } : undefined);
}

export function voidReceipt(id: number, data: { operator?: string; reason?: string }) {
  return request.post(`/receivables/settlements/${id}/void`, data);
}
