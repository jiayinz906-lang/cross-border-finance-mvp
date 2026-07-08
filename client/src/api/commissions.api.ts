import { request } from "./request";

export function getCommissions() {
  return request.get("/commissions");
}
