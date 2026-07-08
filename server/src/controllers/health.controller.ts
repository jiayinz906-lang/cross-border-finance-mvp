import type { Request, Response } from "express";
import { currentIsoTimestamp } from "../utils/date.js";

export function healthController(_req: Request, res: Response) {
  res.json({
    status: "ok",
    service: "cross-border-finance-server",
    timestamp: currentIsoTimestamp()
  });
}
