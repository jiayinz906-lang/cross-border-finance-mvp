import type { Request, Response } from "express";
import { commissionService } from "../services/commission.service.js";

export async function commissionsController(req: Request, res: Response) {
  res.json({
    todo: commissionService.todo,
    rows: await commissionService.listCommissions(req.query.month as string | undefined)
  });
}

export async function updateCommissionRateController(req: Request, res: Response) {
  const id = Number(req.params.id);
  const commissionRate = Number(req.body.commissionRate);
  res.json(await commissionService.updateCommissionRate(id, commissionRate));
}
