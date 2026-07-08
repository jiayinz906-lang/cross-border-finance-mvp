import type { Request, Response } from "express";
import { reportService } from "../services/report.service.js";

export async function monthlyReportController(req: Request, res: Response) {
  res.json(await reportService.getMonthlyReport(req.query.month as string | undefined));
}

export async function monthlyReportExportController(req: Request, res: Response) {
  const { buffer, fileName } = await reportService.exportMonthlyReport(req.query.month as string | undefined);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.send(buffer);
}
