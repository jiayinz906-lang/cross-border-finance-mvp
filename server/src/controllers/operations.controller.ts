import type { Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { requiredCurrentUser } from "../middleware/rbac.middleware.js";
import { operationsService } from "../services/operations.service.js";

const actor = (req: Request) => {
  const user = requiredCurrentUser(req);
  return user.displayName || user.username;
};
const idParam = (value: string) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "INVALID_ID", "ID 无效。");
  return id;
};

export async function partnersController(req: Request, res: Response) {
  res.json(await operationsService.listPartners({ type: req.query.type as string, keyword: req.query.keyword as string, page: req.query.page, pageSize: req.query.pageSize }));
}

export async function createPartnerController(req: Request, res: Response) {
  res.status(201).json(await operationsService.savePartner(req.body ?? {}, actor(req)));
}

export async function updatePartnerController(req: Request, res: Response) {
  res.json(await operationsService.savePartner(req.body ?? {}, actor(req), idParam(req.params.id)));
}

export async function invoicesController(req: Request, res: Response) {
  res.json(await operationsService.listInvoices({ month: req.query.month as string, invoiceType: req.query.invoiceType as string, status: req.query.status as string, keyword: req.query.keyword as string, page: req.query.page, pageSize: req.query.pageSize }));
}

export async function syncInvoicesController(req: Request, res: Response) {
  res.json(await operationsService.syncInvoices(req.body?.month, actor(req)));
}

export async function bankTransactionsController(req: Request, res: Response) {
  res.json(await operationsService.listBankTransactions({ month: req.query.month as string, status: req.query.status as string, page: req.query.page, pageSize: req.query.pageSize }));
}

export async function createBankTransactionController(req: Request, res: Response) {
  res.status(201).json(await operationsService.createBankTransaction(req.body ?? {}, actor(req)));
}

export async function suggestReconciliationController(req: Request, res: Response) {
  res.json(await operationsService.suggestMatches(idParam(req.params.id), actor(req)));
}

export async function confirmReconciliationController(req: Request, res: Response) {
  res.json(await operationsService.confirmMatch(idParam(req.params.id), req.body?.amount, actor(req)));
}

export async function tasksController(req: Request, res: Response) {
  res.json(await operationsService.listTasks({ month: req.query.month as string, status: req.query.status as string, ownerRole: req.query.ownerRole as string, page: req.query.page, pageSize: req.query.pageSize }));
}

export async function resolveTaskController(req: Request, res: Response) {
  res.json(await operationsService.resolveTask(idParam(req.params.id), actor(req)));
}

export async function operationsOverviewController(req: Request, res: Response) {
  res.json(await operationsService.overview(req.query.month as string));
}
