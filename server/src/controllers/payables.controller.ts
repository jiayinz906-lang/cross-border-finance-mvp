import type { Request, Response } from "express";
import { payableService } from "../services/payable.service.js";
import { settlementService } from "../services/settlement.service.js";

export async function payablesController(req: Request, res: Response) {
  res.json(await payableService.listPayables(req.query.month as string | undefined));
}

export async function recordPaymentController(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: "订单 ID 无效" });
    return;
  }
  res.json(await settlementService.recordPayment(id, req.body ?? {}));
}

export async function paymentRecordsController(req: Request, res: Response) {
  res.json({
    rows: await settlementService.listSettlements(req.query.month as string | undefined, "payable")
  });
}

export async function voidPaymentController(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: "付款记录 ID 无效" });
    return;
  }
  res.json(await settlementService.voidPayment(id, req.body ?? {}));
}
