import { request } from "./request";

export function getMonthlyReport() {
  return request.get("/reports/monthly");
}
