import type { Request, Response } from "express";
import { riskService } from "../services/risk.service.js";
import { currentFinanceAccess, requiredCurrentUser } from "../middleware/rbac.middleware.js";

export async function risksController(req: Request, res: Response) {
  res.json(await riskService.listRisks(req.query.month as string | undefined, currentFinanceAccess(req)));
}

export async function reviewRiskController(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: "风险记录 ID 无效" });
    return;
  }

  const actor = requiredCurrentUser(req);
  res.json(await riskService.reviewRisk(id, {
    ...(req.body ?? {}),
    reviewedBy: actor.displayName || actor.username
  }));
}
