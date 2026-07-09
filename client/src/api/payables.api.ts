import { request } from "./request";

export function getPayables(month?: string) {
  return request.get("/payables", month ? { params: { month } } : undefined);
}
