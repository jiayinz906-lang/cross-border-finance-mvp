import { request } from "./request";

export function getRisks(month?: string) {
  return request.get("/risks", month ? { params: { month } } : undefined);
}
