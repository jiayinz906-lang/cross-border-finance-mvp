import type { Request, Response } from "express";
import { receivableService } from "../services/receivable.service.js";

export async function receivablesController(req: Request, res: Response) {
  res.json(await receivableService.listReceivables(req.query.month as string | undefined));
}
