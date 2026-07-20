import { request } from "./request";
import { downloadAuthenticatedFile } from "./download";

export function getPayables(month?: string) {
  return request.get("/payables", month ? { params: { month } } : undefined);
}

export function exportPayables(month: string) {
  return downloadAuthenticatedFile("/payables/export", `${month}-supplier-payables.xlsx`, { month });
}

export function recordPayment(orderId: number, data: { amount: number; settledAt?: string; operator?: string; note?: string }) {
  return request.post(`/payables/${orderId}/payments`, data);
}

export function getPaymentRecords(month?: string) {
  return request.get("/payables/settlements", month ? { params: { month } } : undefined);
}

export function voidPayment(id: number, data: { operator?: string; reason?: string }) {
  return request.post(`/payables/settlements/${id}/void`, data);
}
