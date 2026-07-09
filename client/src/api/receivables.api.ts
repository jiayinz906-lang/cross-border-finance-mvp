import { request } from "./request";

export function getReceivables(month?: string) {
  return request.get("/receivables", month ? { params: { month } } : undefined);
}

export function recordReceipt(orderId: number, data: { amount: number; settledAt?: string; operator?: string; note?: string }) {
  return request.post(`/receivables/${orderId}/receipts`, data);
}

export function getReceiptRecords(month?: string) {
  return request.get("/receivables/settlements", month ? { params: { month } } : undefined);
}
