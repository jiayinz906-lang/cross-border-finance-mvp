import { request } from "./request";

export function getCommissions(month?: string) {
  return request.get("/commissions", month ? { params: { month } } : undefined);
}

export function updateCommissionRate(id: number, commissionRate: number) {
  return request.patch(`/commissions/${id}/rate`, { commissionRate });
}
