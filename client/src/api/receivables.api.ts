import { request } from "./request";

export function getReceivables() {
  return request.get("/receivables");
}
