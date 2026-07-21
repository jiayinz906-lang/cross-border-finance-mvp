import type { Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { requiredCurrentUser } from "../middleware/rbac.middleware.js";
import { manualLedgerService } from "../services/manual-ledger.service.js";

function operator(req: Request) {
  const user = requiredCurrentUser(req);
  return user.displayName || user.username;
}

function positiveId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "MANUAL_LEDGER_INVALID_ID", "流水 ID 无效。");
  return id;
}

export async function listManualLedgerController(req: Request, res: Response) {
  res.json(await manualLedgerService.list({
    month: req.query.month as string | undefined,
    keyword: req.query.keyword as string | undefined,
    direction: req.query.direction as string | undefined,
    status: req.query.status as string | undefined,
    sourceType: req.query.sourceType as string | undefined,
    page: Number(req.query.page),
    pageSize: Number(req.query.pageSize)
  }));
}

export async function manualLedgerSummaryController(req: Request, res: Response) {
  res.json(await manualLedgerService.summary(req.query.month as string | undefined));
}

export async function createManualLedgerController(req: Request, res: Response) {
  const files = Array.isArray(req.files) ? req.files : [];
  res.status(201).json(await manualLedgerService.create(req.body ?? {}, files, operator(req)));
}

export async function confirmManualLedgerController(req: Request, res: Response) {
  res.json(await manualLedgerService.confirm(positiveId(req.params.id), operator(req)));
}

export async function voidManualLedgerController(req: Request, res: Response) {
  res.json(await manualLedgerService.void(positiveId(req.params.id), String(req.body?.reason ?? ""), operator(req)));
}

export async function manualLedgerAttachmentController(req: Request, res: Response) {
  const attachment = await manualLedgerService.attachment(positiveId(req.params.id), positiveId(req.params.attachmentId));
  const encodedName = encodeURIComponent(attachment.fileName).replace(/'/g, "%27");
  res.setHeader("Content-Type", attachment.contentType);
  res.setHeader("Content-Length", String(attachment.fileSize));
  res.setHeader("Content-Disposition", `${req.query.download === "true" ? "attachment" : "inline"}; filename*=UTF-8''${encodedName}`);
  res.setHeader("X-File-Sha256", attachment.sha256);
  res.send(Buffer.from(attachment.fileData));
}
