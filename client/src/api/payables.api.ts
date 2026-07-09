import { request } from "./request";

export function getPayables(month?: string) {
  return request.get("/payables", month ? { params: { month } } : undefined);
}

export function recordPayment(orderId: number, data: { amount: number; settledAt?: string; operator?: string; note?: string }) {
  return request.post(`/payables/${orderId}/payments`, data);
}

export function getPaymentRecords(month?: string) {
  return request.get("/payables/settlements", month ? { params: { month } } : undefined);
}
