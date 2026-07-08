import type { Request, Response } from "express";
import { commissionService } from "../services/commission.service.js";

export async function commissionsController(req: Request, res: Response) {
  res.json({
    todo: commissionService.todo,
    rows: await commissionService.listCommissions(req.query.month as string | undefined)
  });
}
