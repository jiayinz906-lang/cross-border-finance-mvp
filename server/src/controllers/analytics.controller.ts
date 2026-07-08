import type { Request, Response } from "express";
import { analyticsService } from "../services/analytics.service.js";

export async function customerProfitController(req: Request, res: Response) {
  res.json(await analyticsService.customerProfit(req.query.month as string | undefined));
}

export async function operatorPerformanceController(req: Request, res: Response) {
  res.json({ rows: await analyticsService.operatorPerformance(req.query.month as string | undefined) });
}
