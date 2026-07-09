import type { Request, Response } from "express";
import { authContext } from "../config/rbac.js";
import { currentRole } from "../middleware/rbac.middleware.js";
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

export function authContextController(req: Request, res: Response) {
  res.json(authContext(currentRole(req)));
}

export async function parameterRulesController(_req: Request, res: Response) {
  res.json(await financeService.listParameterRules());
}

export async function updateParameterRuleController(req: Request, res: Response) {
  res.json(await financeService.updateParameterRule(req.params.ruleKey, req.body ?? {}));
}

export async function importPreviewController(req: Request, res: Response) {
  if (!req.file?.buffer) {
    res.status(400).json({ message: "请上传 Excel 文件" });
    return;
  }

  res.json(await excelService.previewWorkbook(req.file.buffer, req.file.originalname));
}

export async function importExcelController(req: Request, res: Response) {
  if (!req.file?.buffer) {
    res.status(400).json({ message: "请上传 Excel 文件" });
    return;
  }

  res.json(await excelService.importWorkbook(req.file.buffer, req.file.originalname));
}

export async function importTemplateController(req: Request, res: Response) {
  if (!req.file?.buffer) {
    res.status(400).json({ message: "请上传 Excel 模板文件" });
    return;
  }

  res.json(await excelService.saveImportTemplate(req.file.buffer, req.file.originalname));
}

export async function importBatchesController(req: Request, res: Response) {
  res.json({ rows: await excelService.listImportBatches(req.query.month as string | undefined) });
}

export async function rawLedgerLinesController(req: Request, res: Response) {
  const batchId = req.query.batchId ? Number(req.query.batchId) : undefined;
  if (batchId !== undefined && !Number.isInteger(batchId)) {
    res.status(400).json({ message: "导入批次 ID 无效" });
    return;
  }

  res.json(await excelService.listRawLedgerLines({
    month: req.query.month as string | undefined,
    orderNo: req.query.orderNo as string | undefined,
    batchId
  }));
}

export async function rollbackImportBatchController(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: "导入批次 ID 无效" });
    return;
  }

  res.json(await excelService.rollbackImportBatch(id));
}

export function agentRulesController(_req: Request, res: Response) {
  res.json(financeService.getAgentRules());
}
