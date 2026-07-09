import type { Request, Response } from "express";
import { receivableService } from "../services/receivable.service.js";
import { settlementService } from "../services/settlement.service.js";

export async function receivablesController(req: Request, res: Response) {
  res.json(await receivableService.listReceivables(req.query.month as string | undefined));
}

export async function recordReceiptController(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: "订单 ID 无效" });
    return;
  }
  res.json(await settlementService.recordReceipt(id, req.body ?? {}));
}

export async function receiptRecordsController(req: Request, res: Response) {
  res.json({
    rows: await settlementService.listSettlements(req.query.month as string | undefined, "receivable")
  });
}

export async function voidReceiptController(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: "回款记录 ID 无效" });
    return;
  }
  res.json(await settlementService.voidReceipt(id, req.body ?? {}));
}
