import type { Request, Response } from "express";
import { payableService } from "../services/payable.service.js";
import { settlementService } from "../services/settlement.service.js";
import { currentFinanceAccess, requiredCurrentUser } from "../middleware/rbac.middleware.js";

function settlementInput(req: Request) {
  const actor = requiredCurrentUser(req);
  return { ...(req.body ?? {}), operator: actor.displayName || actor.username };
}

export async function payablesController(req: Request, res: Response) {
  res.json(await payableService.listPayables(req.query.month as string | undefined, currentFinanceAccess(req)));
}

export async function exportPayablesController(req: Request, res: Response) {
  const file = await payableService.exportPayables(req.query.month as string | undefined, currentFinanceAccess(req));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.send(file.buffer);
}

export async function recordPaymentController(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: "订单 ID 无效" });
    return;
  }
  res.json(await settlementService.recordPayment(id, settlementInput(req)));
}

export async function paymentRecordsController(req: Request, res: Response) {
  res.json({
    rows: await settlementService.listSettlements(req.query.month as string | undefined, "payable", currentFinanceAccess(req))
  });
}

export async function voidPaymentController(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: "付款记录 ID 无效" });
    return;
  }
  res.json(await settlementService.voidPayment(id, settlementInput(req)));
}
