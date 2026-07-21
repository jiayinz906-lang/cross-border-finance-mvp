import type { Request, Response } from "express";
import { receivableService } from "../services/receivable.service.js";
import { settlementService } from "../services/settlement.service.js";
import { currentFinanceAccess, requiredCurrentUser } from "../middleware/rbac.middleware.js";

function settlementInput(req: Request) {
  const actor = requiredCurrentUser(req);
  return { ...(req.body ?? {}), operator: actor.displayName || actor.username };
}

export async function receivablesController(req: Request, res: Response) {
  res.json(await receivableService.listReceivables(req.query.month as string | undefined, currentFinanceAccess(req)));
}

export async function exportReceivablesController(req: Request, res: Response) {
  const file = await receivableService.exportReceivables(req.query.month as string | undefined, currentFinanceAccess(req));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.send(file.buffer);
}

export async function recordReceiptController(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: "订单 ID 无效" });
    return;
  }
  res.json(await settlementService.recordReceipt(id, settlementInput(req)));
}

export async function receiptRecordsController(req: Request, res: Response) {
  res.json({
    rows: await settlementService.listSettlements(req.query.month as string | undefined, "receivable", currentFinanceAccess(req))
  });
}

export async function voidReceiptController(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: "回款记录 ID 无效" });
    return;
  }
  res.json(await settlementService.voidReceipt(id, settlementInput(req)));
}
