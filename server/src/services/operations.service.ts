import crypto from "node:crypto";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../prisma/client.js";
import { resolveMonth } from "../utils/month.js";

const roundMoney = (value: number) => Math.round(value * 100) / 100;

function positiveAmount(value: unknown, field = "amount") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError(400, "INVALID_AMOUNT", `${field} 必须是大于 0 的数字。`);
  }
  return roundMoney(parsed);
}

function nonNegativeInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function partnerCode(type: string, name: string) {
  const prefix = type === "customer" ? "CUS" : type === "supplier" ? "SUP" : "BIZ";
  return `${prefix}-${crypto.createHash("sha1").update(`${type}:${name}`).digest("hex").slice(0, 12).toUpperCase()}`;
}

function invoiceStatus(localAmount: number, allocatedAmount: number, dueAt: Date) {
  if (allocatedAmount >= localAmount - 0.005) return "settled";
  if (allocatedAmount > 0) return "partial";
  return dueAt.getTime() < Date.now() ? "overdue" : "open";
}

async function audit(input: { month?: string; entityType: string; entityId: string; action: string; operator: string; payload?: unknown }) {
  await prisma.actionLog.create({
    data: {
      month: input.month,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      operator: input.operator,
      payloadJson: input.payload === undefined ? undefined : JSON.stringify(input.payload)
    }
  });
}

async function ensurePartner(type: "customer" | "supplier", name: string, paymentTermDays = 30) {
  const normalized = name.trim() || "待确认";
  const code = partnerCode(type, normalized);
  return prisma.businessPartner.upsert({
    where: { partnerCode: code },
    create: { partnerCode: code, partnerType: type, name: normalized, paymentTermDays, source: "finance_order" },
    update: { name: normalized, isActive: true }
  });
}

async function refreshInvoice(invoiceId: number) {
  const invoice = await prisma.financeInvoice.findUnique({
    where: { id: invoiceId },
    include: { allocations: { where: { status: "active" } } }
  });
  if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "账单不存在。");
  const allocatedAmount = roundMoney(invoice.allocations.reduce((sum, row) => sum + row.amount, 0));
  return prisma.financeInvoice.update({
    where: { id: invoice.id },
    data: { allocatedAmount, status: invoiceStatus(invoice.localAmount, allocatedAmount, invoice.dueAt) }
  });
}

async function refreshBankTransaction(transactionId: number) {
  const transaction = await prisma.bankTransaction.findUnique({
    where: { id: transactionId },
    include: { allocations: { where: { status: "active" } } }
  });
  if (!transaction) throw new AppError(404, "BANK_TRANSACTION_NOT_FOUND", "银行流水不存在。");
  const matchedAmount = roundMoney(transaction.allocations.reduce((sum, row) => sum + row.amount, 0));
  return prisma.bankTransaction.update({
    where: { id: transaction.id },
    data: {
      matchedAmount,
      status: matchedAmount >= transaction.localAmount - 0.005 ? "matched" : matchedAmount > 0 ? "partial" : "unmatched"
    }
  });
}

async function syncManualLedgerTransactions(month: string) {
  const entries = await prisma.manualLedgerEntry.findMany({
    where: { month, status: "confirmed", direction: { in: ["receivable", "payable"] } }
  });
  for (const entry of entries) {
    await prisma.bankTransaction.upsert({
      where: { manualLedgerEntryId: entry.id },
      create: {
        transactionNo: `ML-${entry.entryNo}`,
        month,
        transactionDate: entry.transactionDate,
        direction: entry.direction,
        manualLedgerEntryId: entry.id,
        counterparty: entry.counterparty,
        currency: entry.currency,
        exchangeRate: entry.exchangeRate,
        originalAmount: Math.abs(entry.originalAmount),
        localAmount: Math.abs(entry.localAmount),
        source: entry.sourceType,
        note: entry.note,
        createdBy: entry.confirmedBy || entry.createdBy
      },
      update: {
        transactionDate: entry.transactionDate,
        direction: entry.direction,
        counterparty: entry.counterparty,
        currency: entry.currency,
        exchangeRate: entry.exchangeRate,
        originalAmount: Math.abs(entry.originalAmount),
        localAmount: Math.abs(entry.localAmount),
        source: entry.sourceType,
        note: entry.note
      }
    });
  }
  return entries.length;
}

const invoiceSyncLocks = new Map<string, Promise<{ month: string; orderCount: number; invoiceCount: number }>>();
const taskSyncLocks = new Map<string, Promise<{ month: string; pendingCount: number }>>();

async function performInvoiceSync(monthInput?: string) {
  const month = resolveMonth(monthInput);
  const orders = await prisma.financeOrder.findMany({
    where: { month, importBatch: { is: { status: "active" } } },
    include: { settlementRecords: { where: { status: "active" } } }
  });

  for (const order of orders) {
    const entries = [
      {
        invoiceType: "receivable" as const,
        amount: order.adjustedReceivable,
        name: order.customerName || order.customerOrderNo || "待确认客户",
        term: 30
      },
      {
        invoiceType: "payable" as const,
        amount: order.adjustedPayable,
        name: order.supplierName || "待确认供应商",
        term: 30
      }
    ];
    for (const entry of entries) {
      if (entry.amount <= 0) continue;
      const partner = await ensurePartner(entry.invoiceType === "receivable" ? "customer" : "supplier", entry.name, entry.term);
      const issuedAt = order.orderDate;
      const dueAt = new Date(issuedAt.getTime() + partner.paymentTermDays * 86400000);
      const invoiceNo = `${entry.invoiceType === "receivable" ? "AR" : "AP"}-${month.replace("-", "")}-${order.orderNo}`;
      const invoice = await prisma.financeInvoice.upsert({
        where: { invoiceNo },
        create: {
          invoiceNo,
          month,
          invoiceType: entry.invoiceType,
          partnerId: partner.id,
          financeOrderId: order.id,
          orderNo: order.orderNo,
          currency: "CNY",
          exchangeRate: 1,
          originalAmount: roundMoney(entry.amount),
          localAmount: roundMoney(entry.amount),
          issuedAt,
          dueAt,
          source: "finance_order"
        },
        update: {
          partnerId: partner.id,
          originalAmount: roundMoney(entry.amount),
          localAmount: roundMoney(entry.amount),
          issuedAt,
          dueAt
        }
      });

      const settlements = order.settlementRecords.filter((row) => row.direction === entry.invoiceType);
      for (const settlement of settlements) {
        await prisma.financeInvoiceAllocation.upsert({
          where: { invoiceId_settlementRecordId: { invoiceId: invoice.id, settlementRecordId: settlement.id } },
          create: {
            invoiceId: invoice.id,
            settlementRecordId: settlement.id,
            amount: roundMoney(settlement.amount),
            createdBy: settlement.operator
          },
          update: { amount: roundMoney(settlement.amount), status: "active" }
        });
      }
      await refreshInvoice(invoice.id);
    }
  }
  return { month, orderCount: orders.length, invoiceCount: await prisma.financeInvoice.count({ where: { month } }) };
}

function syncInvoices(monthInput?: string) {
  const month = resolveMonth(monthInput);
  const existing = invoiceSyncLocks.get(month);
  if (existing) return existing;
  const job = performInvoiceSync(month).finally(() => invoiceSyncLocks.delete(month));
  invoiceSyncLocks.set(month, job);
  return job;
}

async function performTaskSync(monthInput?: string) {
  const month = resolveMonth(monthInput);
  await Promise.all([syncInvoices(month), syncManualLedgerTransactions(month)]);
  const [risks, services, documents, invoices, bankTransactions] = await Promise.all([
    prisma.riskRecord.findMany({ where: { status: { not: "reviewed" }, financeOrder: { month } }, include: { financeOrder: true } }),
    prisma.serviceBusinessRecord.findMany({ where: { confirmStatus: { not: "confirmed" }, financeOrder: { month } }, include: { financeOrder: true } }),
    prisma.confirmationDocument.findMany({ where: { month, documentStatus: { not: "void" }, OR: [{ signatureStatus: { not: "signed" } }, { supervisorStatus: { not: "confirmed" } }] } }),
    prisma.financeInvoice.findMany({ where: { month, status: { in: ["open", "partial", "overdue"] } }, include: { partner: true } }),
    prisma.bankTransaction.findMany({ where: { month, status: { in: ["unmatched", "partial"] } } })
  ]);

  const candidates = [
    ...risks.map((row) => ({ sourceKey: `risk:${row.id}`, taskType: "risk_review", entityType: "risk", entityId: String(row.id), title: `复核风险订单 ${row.financeOrder.orderNo}`, description: row.riskReasons, ownerRole: "finance", priority: row.riskLevel === "high" ? "high" : "normal", route: "/risks", dueAt: null as Date | null })),
    ...services.map((row) => ({ sourceKey: `service:${row.id}`, taskType: "service_confirm", entityType: "service_business", entityId: String(row.id), title: `确认注册提成 ${row.financeOrder.orderNo}`, description: row.serviceType, ownerRole: "supervisor", priority: "normal", route: "/service-confirm", dueAt: null as Date | null })),
    ...documents.map((row) => ({ sourceKey: `document:${row.id}`, taskType: "signature", entityType: "confirmation_document", entityId: String(row.id), title: `完成确认单签名：${row.ownerName}`, description: row.documentType, ownerRole: row.signatureStatus !== "signed" ? "sales" : "supervisor", ownerName: row.signatureStatus !== "signed" ? row.ownerName : null, priority: "normal", route: "/signature-confirm", dueAt: null as Date | null })),
    ...invoices.map((row) => ({ sourceKey: `invoice:${row.id}`, taskType: "settlement", entityType: "finance_invoice", entityId: String(row.id), title: `${row.invoiceType === "receivable" ? "催收" : "付款"} ${row.invoiceNo}`, description: `${row.partner?.name || "待确认往来单位"}，未核销 ¥${roundMoney(row.localAmount - row.allocatedAmount).toFixed(2)}`, ownerRole: "finance", priority: row.status === "overdue" ? "high" : "normal", route: row.invoiceType === "receivable" ? "/receivables" : "/payables", dueAt: row.dueAt })),
    ...bankTransactions.map((row) => ({ sourceKey: `bank:${row.id}`, taskType: "reconciliation", entityType: "bank_transaction", entityId: String(row.id), title: `匹配银行流水 ${row.transactionNo}`, description: `${row.counterparty} ¥${row.localAmount.toFixed(2)}`, ownerRole: "finance", priority: "normal", route: "/finance-operations", dueAt: null as Date | null }))
  ];

  for (const row of candidates) {
    const ownerName = "ownerName" in row ? (row as { ownerName: string | null }).ownerName : null;
    await prisma.workflowTask.upsert({
      where: { sourceKey: row.sourceKey },
      create: { month, status: "pending", ...row },
      update: { title: row.title, description: row.description, ownerRole: row.ownerRole, ownerName, priority: row.priority, route: row.route, dueAt: row.dueAt, status: "pending", resolvedBy: null, resolvedAt: null }
    });
  }
  const activeKeys = candidates.map((row) => row.sourceKey);
  await prisma.workflowTask.updateMany({
    where: { month, status: "pending", sourceKey: { notIn: activeKeys.length ? activeKeys : ["__none__"] } },
    data: { status: "resolved", resolvedBy: "system", resolvedAt: new Date() }
  });
  return { month, pendingCount: candidates.length };
}

function syncTasks(monthInput?: string) {
  const month = resolveMonth(monthInput);
  const existing = taskSyncLocks.get(month);
  if (existing) return existing;
  const job = performTaskSync(month).finally(() => taskSyncLocks.delete(month));
  taskSyncLocks.set(month, job);
  return job;
}

export const operationsService = {
  async listPartners(input: { type?: string; keyword?: string; page?: unknown; pageSize?: unknown }) {
    const page = Math.max(1, nonNegativeInteger(input.page, 1));
    const pageSize = Math.min(100, Math.max(10, nonNegativeInteger(input.pageSize, 20)));
    const where = {
      ...(input.type ? { partnerType: input.type } : {}),
      ...(input.keyword ? { name: { contains: input.keyword, mode: "insensitive" as const } } : {})
    };
    const [rows, total] = await Promise.all([
      prisma.businessPartner.findMany({ where, orderBy: [{ isActive: "desc" }, { name: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.businessPartner.count({ where })
    ]);
    return { rows, total, page, pageSize };
  },

  async savePartner(input: Record<string, unknown>, operator: string, id?: number) {
    const name = String(input.name || "").trim();
    const type = String(input.partnerType || "").trim();
    if (!name || !["customer", "supplier", "both"].includes(type)) throw new AppError(400, "INVALID_PARTNER", "请填写往来单位名称并选择正确类型。");
    const data = {
      partnerCode: String(input.partnerCode || partnerCode(type, name)).trim(),
      partnerType: type,
      name,
      taxNumber: String(input.taxNumber || "").trim() || null,
      contactName: String(input.contactName || "").trim() || null,
      contactPhone: String(input.contactPhone || "").trim() || null,
      currency: String(input.currency || "CNY").trim(),
      creditLimit: Math.max(0, Number(input.creditLimit || 0)),
      paymentTermDays: Math.max(0, nonNegativeInteger(input.paymentTermDays, 30)),
      isActive: input.isActive !== false,
      source: "manual"
    };
    const partner = id
      ? await prisma.businessPartner.update({ where: { id }, data })
      : await prisma.businessPartner.create({ data });
    await audit({ entityType: "business_partner", entityId: String(partner.id), action: id ? "update_partner" : "create_partner", operator, payload: data });
    return partner;
  },

  async listInvoices(input: { month?: string; invoiceType?: string; status?: string; keyword?: string; page?: unknown; pageSize?: unknown }) {
    const month = resolveMonth(input.month);
    await syncInvoices(month);
    const page = Math.max(1, nonNegativeInteger(input.page, 1));
    const pageSize = Math.min(100, Math.max(10, nonNegativeInteger(input.pageSize, 20)));
    const where = {
      month,
      ...(input.invoiceType ? { invoiceType: input.invoiceType } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.keyword ? { OR: [{ invoiceNo: { contains: input.keyword, mode: "insensitive" as const } }, { orderNo: { contains: input.keyword, mode: "insensitive" as const } }, { partner: { is: { name: { contains: input.keyword, mode: "insensitive" as const } } } }] } : {})
    };
    const [rows, total, grouped] = await Promise.all([
      prisma.financeInvoice.findMany({ where, include: { partner: true, financeOrder: { select: { customerOrderNo: true, salespersonName: true, customerServiceName: true } } }, orderBy: [{ status: "asc" }, { dueAt: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.financeInvoice.count({ where }),
      prisma.financeInvoice.groupBy({ by: ["invoiceType"], where: { month }, _sum: { localAmount: true, allocatedAmount: true }, _count: true })
    ]);
    return { month, rows, total, page, pageSize, totals: grouped };
  },

  async syncInvoices(month: string | undefined, operator: string) {
    const result = await syncInvoices(month);
    await audit({ month: result.month, entityType: "finance_invoice", entityId: result.month, action: "sync_invoices", operator, payload: result });
    return result;
  },

  async listBankTransactions(input: { month?: string; status?: string; page?: unknown; pageSize?: unknown }) {
    const month = resolveMonth(input.month);
    const page = Math.max(1, nonNegativeInteger(input.page, 1));
    const pageSize = Math.min(100, Math.max(10, nonNegativeInteger(input.pageSize, 20)));
    const where = { month, ...(input.status ? { status: input.status } : {}) };
    const [rows, total] = await Promise.all([
      prisma.bankTransaction.findMany({ where, include: { partner: true, reconciliationMatches: { where: { status: "suggested" }, include: { invoice: { include: { partner: true } } }, orderBy: { score: "desc" }, take: 3 } }, orderBy: { transactionDate: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.bankTransaction.count({ where })
    ]);
    return { month, rows, total, page, pageSize };
  },

  async createBankTransaction(input: Record<string, unknown>, operator: string) {
    const month = resolveMonth(String(input.month || ""));
    const direction = String(input.direction || "");
    if (!direction || !["receivable", "payable"].includes(direction)) throw new AppError(400, "INVALID_DIRECTION", "流水方向必须是应收或应付。");
    const originalAmount = positiveAmount(input.originalAmount);
    const exchangeRate = positiveAmount(input.exchangeRate || 1, "exchangeRate");
    const counterparty = String(input.counterparty || "").trim();
    if (!counterparty) throw new AppError(400, "COUNTERPARTY_REQUIRED", "请填写交易对方。");
    const transactionNo = String(input.transactionNo || `BANK-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`).trim();
    const row = await prisma.bankTransaction.create({
      data: {
        transactionNo,
        month,
        transactionDate: new Date(String(input.transactionDate || new Date().toISOString())),
        direction,
        counterparty,
        bankReference: String(input.bankReference || "").trim() || null,
        currency: String(input.currency || "CNY"),
        exchangeRate,
        originalAmount,
        localAmount: roundMoney(originalAmount * exchangeRate),
        note: String(input.note || "").trim() || null,
        createdBy: operator
      }
    });
    await audit({ month, entityType: "bank_transaction", entityId: String(row.id), action: "create_bank_transaction", operator, payload: input });
    await this.suggestMatches(row.id, operator);
    return row;
  },

  async suggestMatches(transactionId: number, operator: string) {
    const transaction = await prisma.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!transaction) throw new AppError(404, "BANK_TRANSACTION_NOT_FOUND", "银行流水不存在。");
    const invoices = await prisma.financeInvoice.findMany({
      where: { month: transaction.month, invoiceType: transaction.direction, status: { in: ["open", "partial", "overdue"] } },
      include: { partner: true }
    });
    const remaining = transaction.localAmount - transaction.matchedAmount;
    const ranked = invoices.map((invoice) => {
      const outstanding = Math.max(0, invoice.localAmount - invoice.allocatedAmount);
      const amountGap = Math.abs(outstanding - remaining);
      const amountScore = remaining > 0 ? Math.max(0, 1 - amountGap / remaining) : 0;
      const partnerName = invoice.partner?.name || "";
      const nameScore = partnerName && (transaction.counterparty.includes(partnerName) || partnerName.includes(transaction.counterparty)) ? 1 : 0;
      const score = Math.round((amountScore * 0.75 + nameScore * 0.25) * 10000) / 10000;
      return { invoice, outstanding, score, reason: `金额匹配 ${(amountScore * 100).toFixed(0)}%，往来单位匹配 ${(nameScore * 100).toFixed(0)}%` };
    }).filter((row) => row.score >= 0.25).sort((a, b) => b.score - a.score).slice(0, 5);
    await prisma.reconciliationMatch.deleteMany({ where: { bankTransactionId: transaction.id, status: "suggested" } });
    for (const row of ranked) {
      await prisma.reconciliationMatch.create({ data: { bankTransactionId: transaction.id, invoiceId: row.invoice.id, suggestedAmount: roundMoney(Math.min(remaining, row.outstanding)), score: row.score, matchReason: row.reason } });
    }
    await audit({ month: transaction.month, entityType: "bank_transaction", entityId: String(transaction.id), action: "suggest_reconciliation", operator, payload: { suggestionCount: ranked.length } });
    return { transactionId, rows: ranked };
  },

  async confirmMatch(matchId: number, amountInput: unknown, operator: string) {
    const match = await prisma.reconciliationMatch.findUnique({ where: { id: matchId }, include: { bankTransaction: true, invoice: true } });
    if (!match || match.status !== "suggested") throw new AppError(404, "MATCH_NOT_FOUND", "待确认的匹配记录不存在。");
    if (!match.invoice.financeOrderId) throw new AppError(409, "INVOICE_ORDER_MISSING", "该账单未关联财务订单，暂不能自动核销。");
    const amount = positiveAmount(amountInput || match.suggestedAmount);
    const invoiceOutstanding = match.invoice.localAmount - match.invoice.allocatedAmount;
    const bankOutstanding = match.bankTransaction.localAmount - match.bankTransaction.matchedAmount;
    if (amount > invoiceOutstanding + 0.005 || amount > bankOutstanding + 0.005) throw new AppError(409, "ALLOCATION_EXCEEDS_BALANCE", "核销金额超过账单或流水的未匹配余额。");
    const settlement = await prisma.settlementRecord.create({
      data: {
        financeOrderId: match.invoice.financeOrderId,
        month: match.invoice.month,
        direction: match.invoice.invoiceType,
        amount,
        settledAt: match.bankTransaction.transactionDate,
        counterparty: match.bankTransaction.counterparty,
        operator,
        note: `银行流水自动核销：${match.bankTransaction.transactionNo}`
      }
    });
    await prisma.financeInvoiceAllocation.create({ data: { invoiceId: match.invoice.id, settlementRecordId: settlement.id, bankTransactionId: match.bankTransaction.id, amount, createdBy: operator } });
    await prisma.reconciliationMatch.update({ where: { id: match.id }, data: { status: "confirmed", confirmedBy: operator, confirmedAt: new Date() } });
    await Promise.all([refreshInvoice(match.invoice.id), refreshBankTransaction(match.bankTransaction.id)]);
    await audit({ month: match.invoice.month, entityType: "reconciliation_match", entityId: String(match.id), action: "confirm_reconciliation", operator, payload: { amount, settlementRecordId: settlement.id } });
    return { matchId: match.id, amount, settlementRecordId: settlement.id };
  },

  async listTasks(input: { month?: string; status?: string; ownerRole?: string; page?: unknown; pageSize?: unknown }) {
    const month = resolveMonth(input.month);
    await syncTasks(month);
    const page = Math.max(1, nonNegativeInteger(input.page, 1));
    const pageSize = Math.min(100, Math.max(10, nonNegativeInteger(input.pageSize, 20)));
    const where = { month, ...(input.status ? { status: input.status } : {}), ...(input.ownerRole ? { ownerRole: input.ownerRole } : {}) };
    const [rows, total, summary] = await Promise.all([
      prisma.workflowTask.findMany({ where, orderBy: [{ priority: "asc" }, { dueAt: "asc" }, { createdAt: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.workflowTask.count({ where }),
      prisma.workflowTask.groupBy({ by: ["status", "ownerRole"], where: { month }, _count: true })
    ]);
    return { month, rows, total, page, pageSize, summary };
  },

  async resolveTask(id: number, operator: string) {
    const task = await prisma.workflowTask.update({ where: { id }, data: { status: "resolved", resolvedBy: operator, resolvedAt: new Date() } });
    await audit({ month: task.month, entityType: "workflow_task", entityId: String(task.id), action: "resolve_task", operator });
    return task;
  },

  async overview(monthInput?: string) {
    const month = resolveMonth(monthInput);
    await syncTasks(month);
    const [partners, invoices, unmatchedBank, pendingTasks, overdueInvoices] = await Promise.all([
      prisma.businessPartner.count({ where: { isActive: true } }),
      prisma.financeInvoice.aggregate({ where: { month }, _count: true, _sum: { localAmount: true, allocatedAmount: true } }),
      prisma.bankTransaction.count({ where: { month, status: { in: ["unmatched", "partial"] } } }),
      prisma.workflowTask.count({ where: { month, status: "pending" } }),
      prisma.financeInvoice.count({ where: { month, status: "overdue" } })
    ]);
    return { month, partners, invoiceCount: invoices._count, invoiceAmount: invoices._sum.localAmount || 0, allocatedAmount: invoices._sum.allocatedAmount || 0, unmatchedBank, pendingTasks, overdueInvoices };
  }
};
