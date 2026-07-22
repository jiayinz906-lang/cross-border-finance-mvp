import type { Request, Response } from "express";
import { commissionService } from "../services/commission.service.js";
import { currentFinanceAccess, requiredCurrentUser } from "../middleware/rbac.middleware.js";

export async function commissionsController(req: Request, res: Response) {
  res.json({
    todo: commissionService.todo,
    rows: await commissionService.listCommissions(req.query.month as string | undefined, currentFinanceAccess(req, "salesperson"))
  });
}

export async function updateCommissionRateController(req: Request, res: Response) {
  const id = Number(req.params.id);
  const commissionRate = Number(req.body.commissionRate);
  const actor = requiredCurrentUser(req);
  res.json(await commissionService.updateCommissionRate(
    id,
    commissionRate,
    req.body?.adjustReason,
    actor.displayName || actor.username
  ));
}
