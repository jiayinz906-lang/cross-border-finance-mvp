import type { Request, Response } from "express";
import { profitService } from "../services/profit.service.js";

export async function profitAnalysisController(req: Request, res: Response) {
  res.json(await profitService.getAnalysis(req.query.month as string | undefined));
}
