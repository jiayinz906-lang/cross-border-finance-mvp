import type { Request, Response } from "express";
import { payableService } from "../services/payable.service.js";

export async function payablesController(req: Request, res: Response) {
  res.json(await payableService.listPayables(req.query.month as string | undefined));
}
