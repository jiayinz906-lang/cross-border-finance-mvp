import type { Request, Response } from "express";
import { reportService } from "../services/report.service.js";
import { currentFinanceAccess } from "../middleware/rbac.middleware.js";

export async function serviceRecordsController(req: Request, res: Response) {
  res.json({
    rows: await reportService.listServiceRecords(
      req.query.month as string | undefined,
      currentFinanceAccess(req)
    )
  });
}

export async function monthlyReportController(req: Request, res: Response) {
  res.json(await reportService.getMonthlyReport(req.query.month as string | undefined));
}

export async function monthlyReportExportController(req: Request, res: Response) {
  const { buffer, fileName } = await reportService.exportMonthlyReport(req.query.month as string | undefined);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.send(buffer);
}
