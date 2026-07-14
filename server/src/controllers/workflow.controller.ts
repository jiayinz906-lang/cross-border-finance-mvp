import type { Request, Response } from "express";
import { currentRole } from "../middleware/rbac.middleware.js";
import { workflowService } from "../services/workflow.service.js";

function month(req: Request) {
  return (req.query.month as string | undefined) ?? (req.body?.month as string | undefined);
}

export async function listDocumentsController(req: Request, res: Response) {
  res.json({
    rows: await workflowService.listDocuments(
      month(req),
      req.query.documentType as "logistics_commission" | "service_commission" | "operator_performance" | "sales_salary" | "customer_service_salary" | undefined,
      req.query.history === "true"
    )
  });
}

export async function generateLogisticsDocumentsController(req: Request, res: Response) {
  res.json({ rows: await workflowService.generateLogisticsDocuments(month(req)) });
}

export async function generateServiceDocumentsController(req: Request, res: Response) {
  res.json({ rows: await workflowService.generateServiceDocuments(month(req)) });
}

export async function generateOperatorDocumentsController(req: Request, res: Response) {
  res.json({ rows: await workflowService.generateOperatorDocuments(month(req)) });
}

export async function generateSalaryDocumentsController(req: Request, res: Response) {
  res.json({ rows: await workflowService.generateSalaryDocuments(month(req)) });
}

export async function sendSignatureLinkController(req: Request, res: Response) {
  res.json(await workflowService.sendSignatureLink(Number(req.params.id)));
}

export async function markSignatureLinkNotifiedController(req: Request, res: Response) {
  res.json(await workflowService.markSignatureLinkNotified(
    Number(req.params.id),
    typeof req.body?.channel === "string" ? req.body.channel : "manual_copy"
  ));
}

export async function publicSignatureDocumentController(req: Request, res: Response) {
  res.json(await workflowService.publicSignatureDocument(req.params.token));
}

function evidence(req: Request, action: string) {
  return {
    action,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.header("user-agent"),
    role: currentRole(req),
    signedName: typeof req.body?.signedName === "string" ? req.body.signedName.trim() : undefined,
    acceptedStatement: req.body?.acceptedStatement === true
  };
}

export async function signByTokenController(req: Request, res: Response) {
  res.json(await workflowService.signByToken(req.params.token, evidence(req, "employee_sign")));
}

export async function supervisorConfirmController(req: Request, res: Response) {
  res.json(await workflowService.supervisorConfirm(
    Number(req.params.id),
    evidence(req, "supervisor_confirm"),
    req.body?.adjustReason
  ));
}

export async function voidDocumentController(req: Request, res: Response) {
  res.json(await workflowService.voidDocument(Number(req.params.id), req.body?.voidReason));
}

export async function createExportJobController(req: Request, res: Response) {
  res.json(await workflowService.createExportJob({
    month: month(req),
    exportType: req.body?.exportType ?? "monthly_report",
    fileFormat: req.body?.fileFormat,
    payload: req.body?.payload
  }));
}

export async function downloadExportJobController(req: Request, res: Response) {
  const file = await workflowService.downloadExportJob(Number(req.params.id));
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.fileName)}"`);
  res.send(file.buffer);
}

export async function downloadConfirmationDocumentController(req: Request, res: Response) {
  const format = req.query.format === "png" ? "png" : "pdf";
  const file = await workflowService.downloadConfirmationDocument(Number(req.params.id), format);
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.fileName)}"`);
  res.send(file.buffer);
}

export async function exportSystemBackupController(req: Request, res: Response) {
  const file = await workflowService.exportSystemBackup(req.query.month as string | undefined);
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.fileName)}"`);
  res.send(file.buffer);
}

export async function markRiskReviewedController(req: Request, res: Response) {
  res.json(await workflowService.markRiskReviewed(Number(req.params.id)));
}

export async function confirmServiceRecordController(req: Request, res: Response) {
  res.json(await workflowService.confirmServiceRecord(Number(req.params.id), req.body?.finalCommission));
}

export async function confirmSalespersonCommissionController(req: Request, res: Response) {
  res.json(await workflowService.confirmSalespersonCommission(
    month(req),
    req.params.salespersonName,
    req.body?.manualRate,
    req.body?.adjustReason
  ));
}

export async function actionLogsController(req: Request, res: Response) {
  res.json({
    rows: await workflowService.actionLogs({
      month: req.query.month as string | undefined,
      entityType: req.query.entityType as string | undefined,
      entityId: req.query.entityId as string | undefined,
      action: req.query.action as string | undefined,
      operator: req.query.operator as string | undefined
    })
  });
}

export async function monthCloseStatusController(req: Request, res: Response) {
  res.json(await workflowService.monthCloseStatus(month(req)));
}

export async function monthStatusController(req: Request, res: Response) {
  res.json(await workflowService.monthStatus(month(req)));
}

export async function lockMonthController(req: Request, res: Response) {
  res.json(await workflowService.lockMonth(month(req), {
    operator: req.body?.operator ?? currentRole(req),
    note: req.body?.note
  }));
}

export async function unlockMonthController(req: Request, res: Response) {
  res.json(await workflowService.unlockMonth(month(req), {
    operator: req.body?.operator ?? currentRole(req),
    note: req.body?.note
  }));
}
