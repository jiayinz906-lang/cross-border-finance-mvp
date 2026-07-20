import type { Request, Response } from "express";
import {
  getErpnextInvoices,
  getErpnextOverview,
  getErpnextParties,
  getErpnextPayments,
  getErpnextStatus,
  testErpnextConnection
} from "../services/erpnext.service.js";

function numericQuery(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

function stringQuery(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function erpnextStatusController(_req: Request, res: Response) {
  res.json(getErpnextStatus());
}

export async function testErpnextController(_req: Request, res: Response) {
  res.json(await testErpnextConnection());
}

export async function erpnextOverviewController(req: Request, res: Response) {
  res.json(await getErpnextOverview({
    fromDate: stringQuery(req.query.fromDate),
    toDate: stringQuery(req.query.toDate)
  }));
}

export async function erpnextInvoicesController(req: Request, res: Response) {
  res.json(await getErpnextInvoices({
    kind: stringQuery(req.query.kind) as "sales" | "purchase" | undefined,
    status: stringQuery(req.query.status) as "all" | "outstanding" | "paid" | "overdue" | "return" | undefined,
    keyword: stringQuery(req.query.keyword),
    fromDate: stringQuery(req.query.fromDate),
    toDate: stringQuery(req.query.toDate),
    page: numericQuery(req.query.page),
    pageSize: numericQuery(req.query.pageSize)
  }));
}

export async function erpnextPaymentsController(req: Request, res: Response) {
  res.json(await getErpnextPayments({
    paymentType: stringQuery(req.query.paymentType) as "all" | "receive" | "pay" | "transfer" | undefined,
    keyword: stringQuery(req.query.keyword),
    fromDate: stringQuery(req.query.fromDate),
    toDate: stringQuery(req.query.toDate),
    page: numericQuery(req.query.page),
    pageSize: numericQuery(req.query.pageSize)
  }));
}

export async function erpnextPartiesController(req: Request, res: Response) {
  res.json(await getErpnextParties({
    kind: stringQuery(req.query.kind) as "customer" | "supplier" | undefined,
    keyword: stringQuery(req.query.keyword),
    page: numericQuery(req.query.page),
    pageSize: numericQuery(req.query.pageSize)
  }));
}
