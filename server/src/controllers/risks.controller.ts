import type { Request, Response } from "express";
import { riskService } from "../services/risk.service.js";

export async function risksController(req: Request, res: Response) {
  res.json(await riskService.listRisks(req.query.month as string | undefined));
}
