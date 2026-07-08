import type { Request, Response } from "express";
import { reportService } from "../services/report.service.js";

export async function monthlyReportController(req: Request, res: Response) {
  res.json(await reportService.getMonthlyReport(req.query.month as string | undefined));
}
