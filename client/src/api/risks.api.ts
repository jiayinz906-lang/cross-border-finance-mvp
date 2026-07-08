import { request } from "./request";

export function getRisks() {
  return request.get("/risks");
}
