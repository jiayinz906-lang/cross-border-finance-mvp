import { request } from "./request";

export function getRisks(month?: string) {
  return request.get("/risks", month ? { params: { month } } : undefined);
}

export function reviewRisk(id: number, data: { reviewNote: string; reviewConclusion?: string; reviewedBy?: string }) {
  return request.post(`/risks/${id}/review`, data);
}
