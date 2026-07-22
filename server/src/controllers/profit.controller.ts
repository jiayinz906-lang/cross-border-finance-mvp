import type { Request, Response } from "express";
import { profitService } from "../services/profit.service.js";
import { currentFinanceAccess } from "../middleware/rbac.middleware.js";

export async function profitAnalysisController(req: Request, res: Response) {
  res.json(await profitService.getAnalysis(req.query.month as string | undefined, currentFinanceAccess(req, "salesperson")));
}
