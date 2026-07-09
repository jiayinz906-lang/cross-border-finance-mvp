import type { Request, Response } from "express";
import { excelService } from "../services/excel.service.js";
import { financeService } from "../services/finance.service.js";

export async function listLedgerController(req: Request, res: Response) {
  res.json(await financeService.listLedger(req.query.month as string | undefined));
}

export async function summaryController(req: Request, res: Response) {
  res.json(await financeService.getSummary(req.query.month as string | undefined));
}

export async function dashboardController(req: Request, res: Response) {
  res.json(await financeService.getDashboard(req.query.month as string | undefined));
}

export async function monthsController(_req: Request, res: Response) {
  res.json(await financeService.listMonths());
}

export async function importExcelController(req: Request, res: Response) {
  if (!req.file?.buffer) {
    res.status(400).json({ message: "请上传 Excel 文件" });
    return;
  }

  const result = await excelService.importWorkbook(req.file.buffer, req.file.originalname);
  res.json(result);
}

export function agentRulesController(_req: Request, res: Response) {
  res.json(financeService.getAgentRules());
}
