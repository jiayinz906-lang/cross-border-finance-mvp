import { request } from "./request";

export function getReadiness(month?: string) {
  return request.get("/health/ready", { params: { month } });
}

export function getOperationsStatus() {
  return request.get("/health/status");
}
