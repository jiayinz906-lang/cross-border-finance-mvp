import { request } from "./request";

export function getReceivables(month?: string) {
  return request.get("/receivables", month ? { params: { month } } : undefined);
}
