import { request } from "./request";

export function getPayables() {
  return request.get("/payables");
}
