import { request } from "./request";

export function getCommissions(month?: string) {
  return request.get("/commissions", month ? { params: { month } } : undefined);
}
