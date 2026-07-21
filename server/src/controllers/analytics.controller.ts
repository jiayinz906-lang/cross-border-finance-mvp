import type { Request, Response } from "express";
import { analyticsService } from "../services/analytics.service.js";
import { currentFinanceAccess, currentUser } from "../middleware/rbac.middleware.js";

export async function customerProfitController(req: Request, res: Response) {
  res.json(await analyticsService.customerProfit(req.query.month as string | undefined, currentFinanceAccess(req)));
}

export async function operatorPerformanceController(req: Request, res: Response) {
  res.json(await analyticsService.operatorPerformanceWithSettings(req.query.month as string | undefined, currentFinanceAccess(req)));
}

export async function updateOperatorPerformanceOverrideController(req: Request, res: Response) {
  const user = currentUser(req);
  res.json(await analyticsService.updateOperatorPerformanceOverride({
    ...(req.body ?? {}),
    updatedBy: user?.displayName ?? user?.username ?? "主管"
  }));
}

export async function updateOperatorPerformancePayoutNoteController(req: Request, res: Response) {
  const user = currentUser(req);
  res.json(await analyticsService.updateOperatorPerformancePayoutNote(
    String(req.body?.month ?? ""),
    String(req.body?.payoutNote ?? ""),
    user?.displayName ?? user?.username ?? "主管"
  ));
}
