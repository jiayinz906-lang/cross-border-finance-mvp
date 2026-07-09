import { request } from "./request";

export function getReadiness(month = "2026-06") {
  return request.get("/health/ready", { params: { month } });
}
