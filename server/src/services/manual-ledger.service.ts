import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../prisma/client.js";
import { rebuildFinanceFromManualEntries } from "./excel.service.js";

const allowedDirections = new Set(["receivable", "payable", "other"]);
const allowedSourceTypes = new Set(["manual", "image_statement", "manual_erp"]);
const allowedStatuses = new Set(["draft", "confirmed", "voided"]);

type UploadedImage = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type ManualLedgerInput = {
  month?: unknown;
  transactionDate?: unknown;
  sourceType?: unknown;
  direction?: unknown;
  counterparty?: unknown;
  originalAmount?: unknown;
  currency?: unknown;
  exchangeRate?: unknown;
  localAmount?: unknown;
  convertedAmount?: unknown;
  unitPrice?: unknown;
  businessType?: unknown;
  feeType?: unknown;
  orderNo?: unknown;
  customerOrderNo?: unknown;
  customerName?: unknown;
  salespersonName?: unknown;
  customerServiceName?: unknown;
  supplierName?: unknown;
  supplierService?: unknown;
  chargeWeight?: unknown;
  supplierChargeWeight?: unknown;
  actualWeight?: unknown;
  pieces?: unknown;
  mainProductName?: unknown;
  internalRemark?: unknown;
  note?: unknown;
};

export type ManualDocumentInput = ManualLedgerInput & {
  lines?: ManualLedgerInput[];
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const result = text(value);
  return result || undefined;
}

function optionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new AppError(400, "MANUAL_LEDGER_INVALID_NUMBER", `${field}必须是有效数字。`);
  return parsed;
}

function numberValue(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new AppError(400, "MANUAL_LEDGER_INVALID_NUMBER", `${field}必须是有效数字。`);
  return parsed;
}

function parseMonth(value: unknown) {
  const month = text(value);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new AppError(400, "MANUAL_LEDGER_INVALID_MONTH", "账期必须使用 YYYY-MM 格式。", { month: "请输入有效账期" });
  }
  return month;
}

function parseDate(value: unknown) {
  const dateText = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    throw new AppError(400, "MANUAL_LEDGER_INVALID_DATE", "业务日期必须使用 YYYY-MM-DD 格式。", { transactionDate: "请输入有效日期" });
  }
  const result = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime())) throw new AppError(400, "MANUAL_LEDGER_INVALID_DATE", "业务日期无效。");
  return result;
}

function parseInput(input: ManualLedgerInput) {
  const month = parseMonth(input.month);
  const transactionDate = parseDate(input.transactionDate);
  const sourceType = text(input.sourceType) || "manual";
  if (!allowedSourceTypes.has(sourceType)) throw new AppError(400, "MANUAL_LEDGER_INVALID_SOURCE", "原始数据来源类型无效。");
  const direction = text(input.direction);
  if (!allowedDirections.has(direction)) throw new AppError(400, "MANUAL_LEDGER_INVALID_DIRECTION", "请选择应收、应付或其他类型。");
  const counterparty = text(input.counterparty);
  if (!counterparty) throw new AppError(400, "MANUAL_LEDGER_COUNTERPARTY_REQUIRED", "请输入交易对方。", { counterparty: "交易对方不能为空" });
  const originalAmount = numberValue(input.originalAmount, "原币金额");
  if (originalAmount === 0) throw new AppError(400, "MANUAL_LEDGER_ZERO_AMOUNT", "原币金额不能为 0。", { originalAmount: "金额不能为 0" });
  const exchangeRate = numberValue(input.exchangeRate ?? 1, "汇率");
  if (exchangeRate <= 0) throw new AppError(400, "MANUAL_LEDGER_INVALID_RATE", "汇率必须大于 0。", { exchangeRate: "汇率必须大于 0" });
  const explicitLocalAmount = optionalNumber(input.localAmount, "本币费用");

  return {
    month,
    transactionDate,
    sourceType,
    direction,
    counterparty,
    originalAmount,
    currency: (text(input.currency) || "CNY").toUpperCase(),
    exchangeRate,
    localAmount: Number((explicitLocalAmount ?? originalAmount * exchangeRate).toFixed(2)),
    convertedAmount: optionalNumber(input.convertedAmount, "折合人民币"),
    unitPrice: optionalNumber(input.unitPrice, "单价"),
    businessType: optionalText(input.businessType),
    feeType: optionalText(input.feeType),
    orderNo: optionalText(input.orderNo),
    customerOrderNo: optionalText(input.customerOrderNo),
    customerName: optionalText(input.customerName),
    salespersonName: optionalText(input.salespersonName),
    customerServiceName: optionalText(input.customerServiceName),
    supplierName: optionalText(input.supplierName),
    supplierService: optionalText(input.supplierService),
    chargeWeight: optionalNumber(input.chargeWeight, "收费重"),
    supplierChargeWeight: optionalNumber(input.supplierChargeWeight, "供应商收费重"),
    actualWeight: optionalNumber(input.actualWeight, "实重"),
    pieces: optionalNumber(input.pieces, "件数") === undefined ? undefined : Math.trunc(optionalNumber(input.pieces, "件数")!),
    mainProductName: optionalText(input.mainProductName),
    internalRemark: optionalText(input.internalRemark),
    note: optionalText(input.note)
  };
}

function imageType(buffer: Buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "";
}

function normalizeImages(files: UploadedImage[]) {
  return files.map((file) => {
    const detectedType = imageType(file.buffer);
    if (!detectedType) throw new AppError(400, "MANUAL_LEDGER_INVALID_IMAGE", `${file.originalname} 不是有效的 JPG、PNG 或 WebP 图片。`);
    return {
      fileName: file.originalname.slice(0, 240),
      contentType: detectedType,
      fileSize: file.size,
      sha256: createHash("sha256").update(file.buffer).digest("hex"),
      fileData: file.buffer
    };
  });
}

async function ensureMonthOpen(month: string) {
  const close = await prisma.monthClose.findUnique({ where: { month } });
  if (close?.status === "locked") throw new AppError(409, "MONTH_LOCKED", `${month} 已锁账，不能新增或修改业务单据。请先由主管解锁并记录原因。`);
}

const attachmentSummary = {
  select: { id: true, entryId: true, fileName: true, contentType: true, fileSize: true, sha256: true, createdAt: true },
  orderBy: { id: "asc" as const }
};

function documentKey(row: { documentNo: string | null; entryNo: string }) {
  return row.documentNo || row.entryNo;
}

function toDocument(rows: Array<Record<string, any>>) {
  const first = rows[0];
  const attachments = rows.flatMap((row) => row.attachments ?? []);
  return {
    documentNo: documentKey(first as { documentNo: string | null; entryNo: string }),
    month: first.month,
    transactionDate: first.transactionDate,
    sourceType: first.sourceType,
    orderNo: first.orderNo,
    customerOrderNo: first.customerOrderNo,
    customerName: first.customerName || first.counterparty,
    businessType: first.businessType,
    chargeWeight: first.chargeWeight,
    supplierChargeWeight: first.supplierChargeWeight,
    salespersonName: first.salespersonName,
    customerServiceName: first.customerServiceName,
    actualWeight: first.actualWeight,
    pieces: first.pieces,
    mainProductName: first.mainProductName,
    internalRemark: first.internalRemark,
    note: first.note,
    status: first.status,
    createdBy: first.createdBy,
    confirmedBy: first.confirmedBy,
    confirmedAt: first.confirmedAt,
    voidedBy: first.voidedBy,
    voidedAt: first.voidedAt,
    voidReason: first.voidReason,
    createdAt: first.createdAt,
    updatedAt: first.updatedAt,
    receivable: rows.filter((row) => row.direction === "receivable").reduce((sum, row) => sum + row.localAmount, 0),
    payable: rows.filter((row) => row.direction === "payable").reduce((sum, row) => sum + row.localAmount, 0),
    lines: rows.sort((left, right) => left.lineNo - right.lineNo),
    attachments
  };
}

export const manualLedgerService = {
  async list(input: { month?: string; keyword?: string; direction?: string; status?: string; sourceType?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(input.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(input.pageSize) || 20));
    const where: Prisma.ManualLedgerEntryWhereInput = {};
    if (input.month) where.month = input.month;
    if (input.direction && allowedDirections.has(input.direction)) where.direction = input.direction;
    if (input.status && allowedStatuses.has(input.status)) where.status = input.status;
    if (input.sourceType && allowedSourceTypes.has(input.sourceType)) where.sourceType = input.sourceType;
    const keyword = input.keyword?.trim();
    if (keyword) {
      where.OR = ["entryNo", "documentNo", "counterparty", "customerName", "orderNo", "customerOrderNo", "businessType", "feeType", "salespersonName", "customerServiceName", "supplierName"].map((field) => ({
        [field]: { contains: keyword, mode: "insensitive" }
      })) as Prisma.ManualLedgerEntryWhereInput[];
    }
    const [rows, total] = await Promise.all([
      prisma.manualLedgerEntry.findMany({ where, include: { attachments: attachmentSummary }, orderBy: [{ transactionDate: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.manualLedgerEntry.count({ where })
    ]);
    return { rows, total, page, pageSize };
  },

  async listDocuments(input: { month?: string; keyword?: string; status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(input.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(input.pageSize) || 20));
    const where: Prisma.ManualLedgerEntryWhereInput = { sourceType: "manual_erp" };
    if (input.month) where.month = input.month;
    if (input.status && allowedStatuses.has(input.status)) where.status = input.status;
    const keyword = input.keyword?.trim();
    if (keyword) where.OR = ["documentNo", "orderNo", "customerOrderNo", "customerName", "businessType", "salespersonName", "customerServiceName", "supplierName"].map((field) => ({ [field]: { contains: keyword, mode: "insensitive" } })) as Prisma.ManualLedgerEntryWhereInput[];
    const rows = await prisma.manualLedgerEntry.findMany({ where, include: { attachments: attachmentSummary }, orderBy: [{ transactionDate: "desc" }, { id: "desc" }] });
    const grouped = new Map<string, Array<Record<string, any>>>();
    for (const row of rows) grouped.set(documentKey(row), [...(grouped.get(documentKey(row)) ?? []), row]);
    const documents = Array.from(grouped.values()).map(toDocument).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { rows: documents.slice((page - 1) * pageSize, page * pageSize), total: documents.length, page, pageSize };
  },

  async summary(month?: string) {
    const rows = await prisma.manualLedgerEntry.findMany({
      where: { ...(month ? { month } : {}), sourceType: "manual_erp", status: { not: "voided" } },
      include: { attachments: { select: { id: true } } }
    });
    const docs = new Set(rows.map(documentKey));
    return rows.reduce((result, row) => {
      result.totalRecords = docs.size;
      result.totalLines += 1;
      result.localAmount += row.localAmount;
      if (row.direction === "receivable") result.receivable += row.localAmount;
      if (row.direction === "payable") result.payable += row.localAmount;
      result.attachmentCount += row.attachments.length;
      if (row.status === "draft") result.draftLines += 1;
      return result;
    }, { totalRecords: 0, totalLines: 0, receivable: 0, payable: 0, localAmount: 0, imageRecords: 0, attachmentCount: 0, draftLines: 0, draftRecords: new Set(rows.filter((row) => row.status === "draft").map(documentKey)).size });
  },

  async createDocument(input: ManualDocumentInput, files: UploadedImage[], operator: string) {
    const month = parseMonth(input.month);
    const transactionDate = parseDate(input.transactionDate);
    await ensureMonthOpen(month);
    const orderNo = text(input.orderNo);
    const customerName = text(input.customerName);
    const businessType = text(input.businessType);
    const salespersonName = text(input.salespersonName);
    const customerServiceName = text(input.customerServiceName);
    if (!orderNo || !customerName || !businessType || !salespersonName || !customerServiceName) {
      throw new AppError(400, "MANUAL_DOCUMENT_HEADER_REQUIRED", "系统单号、用户、业务类型、销售代表和客服代表为必填项。");
    }
    const lines = Array.isArray(input.lines) ? input.lines : [];
    if (!lines.length) throw new AppError(400, "MANUAL_DOCUMENT_LINES_REQUIRED", "请至少录入一条应收或应付费用明细。");
    if (lines.length > 100) throw new AppError(400, "MANUAL_DOCUMENT_TOO_MANY_LINES", "单张业务单最多录入 100 条费用明细。");
    if (files.length > 12) throw new AppError(400, "MANUAL_LEDGER_TOO_MANY_IMAGES", "每张业务单最多上传 12 张凭证图片。");
    const images = normalizeImages(files);
    const duplicate = await prisma.manualLedgerEntry.findFirst({ where: { month, orderNo, sourceType: "manual_erp", status: { not: "voided" } } });
    if (duplicate) throw new AppError(409, "MANUAL_DOCUMENT_ORDER_DUPLICATE", `${month} 的系统单号 ${orderNo} 已存在，请打开原单处理，避免重复入账。`);
    const documentNo = `ERP-${month.replace("-", "")}-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const common: ManualLedgerInput = {
      month,
      transactionDate: text(input.transactionDate),
      sourceType: "manual_erp",
      orderNo,
      customerOrderNo: input.customerOrderNo,
      customerName,
      businessType,
      salespersonName,
      customerServiceName,
      chargeWeight: input.chargeWeight,
      supplierChargeWeight: input.supplierChargeWeight,
      actualWeight: input.actualWeight,
      pieces: input.pieces,
      mainProductName: input.mainProductName,
      internalRemark: input.internalRemark,
      note: input.note
    };
    const parsedLines = lines.map((line, index) => {
      const direction = text(line.direction);
      const supplierName = optionalText(line.supplierName);
      const counterparty = optionalText(line.counterparty) || (direction === "payable" ? supplierName : customerName);
      const parsed = parseInput({ ...common, ...line, month, transactionDate: text(input.transactionDate), sourceType: "manual_erp", counterparty });
      if (!parsed.feeType) throw new AppError(400, "MANUAL_DOCUMENT_FEE_TYPE_REQUIRED", `第 ${index + 1} 行费用类型不能为空。`);
      return parsed;
    });

    const created = await prisma.$transaction(async (tx) => {
      const result = [];
      for (const [index, data] of parsedLines.entries()) {
        result.push(await tx.manualLedgerEntry.create({
          data: {
            ...data,
            documentNo,
            lineNo: index + 1,
            entryNo: `${documentNo}-${String(index + 1).padStart(3, "0")}`,
            createdBy: operator,
            attachments: index === 0 && images.length ? { create: images } : undefined
          },
          include: { attachments: attachmentSummary }
        }));
      }
      await tx.actionLog.create({ data: { month, entityType: "manual_erp_document", entityId: documentNo, action: "create_manual_erp_document", operator, payloadJson: JSON.stringify({ documentNo, orderNo, lineCount: parsedLines.length, attachmentCount: images.length }) } });
      return result;
    });
    return toDocument(created);
  },

  async confirmDocument(documentNo: string, operator: string) {
    const rows = await prisma.manualLedgerEntry.findMany({ where: { documentNo, sourceType: "manual_erp" } });
    if (!rows.length) throw new AppError(404, "MANUAL_DOCUMENT_NOT_FOUND", "业务单据不存在。");
    await ensureMonthOpen(rows[0].month);
    if (rows.some((row) => row.status !== "draft")) throw new AppError(409, "MANUAL_DOCUMENT_NOT_DRAFT", "只有草稿单据可以确认入账。");
    await prisma.$transaction(async (tx) => {
      await tx.manualLedgerEntry.updateMany({ where: { documentNo }, data: { status: "confirmed", confirmedBy: operator, confirmedAt: new Date() } });
      await tx.actionLog.create({ data: { month: rows[0].month, entityType: "manual_erp_document", entityId: documentNo, action: "post_manual_erp_document", operator, payloadJson: JSON.stringify({ orderNo: rows[0].orderNo, lineCount: rows.length }) } });
    });
    try {
      await rebuildFinanceFromManualEntries(rows[0].month, operator);
    } catch (error) {
      await prisma.manualLedgerEntry.updateMany({ where: { documentNo }, data: { status: "draft", confirmedBy: null, confirmedAt: null } });
      throw error;
    }
    const updated = await prisma.manualLedgerEntry.findMany({ where: { documentNo }, include: { attachments: attachmentSummary } });
    return toDocument(updated);
  },

  async voidDocument(documentNo: string, reason: string, operator: string) {
    const rows = await prisma.manualLedgerEntry.findMany({ where: { documentNo, sourceType: "manual_erp" } });
    if (!rows.length) throw new AppError(404, "MANUAL_DOCUMENT_NOT_FOUND", "业务单据不存在。");
    await ensureMonthOpen(rows[0].month);
    if (rows.every((row) => row.status === "voided")) throw new AppError(409, "MANUAL_DOCUMENT_ALREADY_VOIDED", "该业务单据已经作废。");
    const voidReason = reason.trim();
    if (!voidReason) throw new AppError(400, "MANUAL_DOCUMENT_VOID_REASON_REQUIRED", "请填写作废原因。");
    const wasConfirmed = rows.some((row) => row.status === "confirmed");
    await prisma.$transaction(async (tx) => {
      await tx.manualLedgerEntry.updateMany({ where: { documentNo }, data: { status: "voided", voidedBy: operator, voidedAt: new Date(), voidReason } });
      await tx.actionLog.create({ data: { month: rows[0].month, entityType: "manual_erp_document", entityId: documentNo, action: "void_manual_erp_document", operator, payloadJson: JSON.stringify({ orderNo: rows[0].orderNo, voidReason }) } });
    });
    if (wasConfirmed) await rebuildFinanceFromManualEntries(rows[0].month, operator);
    const updated = await prisma.manualLedgerEntry.findMany({ where: { documentNo }, include: { attachments: attachmentSummary } });
    return toDocument(updated);
  },

  // 兼容历史单行流水接口；新业务数据使用 createDocument/confirmDocument。
  async create(input: ManualLedgerInput, files: UploadedImage[], operator: string) {
    const data = parseInput(input);
    await ensureMonthOpen(data.month);
    const images = normalizeImages(files);
    if (data.sourceType === "image_statement" && images.length === 0) throw new AppError(400, "MANUAL_LEDGER_IMAGE_REQUIRED", "图片流水至少需要上传 1 张凭证图片。");
    const entryNo = `ML${data.month.replace("-", "")}-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    return prisma.$transaction(async (tx) => {
      const entry = await tx.manualLedgerEntry.create({ data: { ...data, entryNo, createdBy: operator, attachments: images.length ? { create: images } : undefined }, include: { attachments: attachmentSummary } });
      await tx.actionLog.create({ data: { month: data.month, entityType: "manual_ledger_entry", entityId: String(entry.id), action: "create_manual_ledger_entry", operator, payloadJson: JSON.stringify({ entryNo, sourceType: data.sourceType, localAmount: data.localAmount }) } });
      return entry;
    });
  },

  async confirm(id: number, operator: string) {
    const current = await prisma.manualLedgerEntry.findUnique({ where: { id } });
    if (!current) throw new AppError(404, "MANUAL_LEDGER_NOT_FOUND", "原始流水不存在。");
    await ensureMonthOpen(current.month);
    if (current.status !== "draft") throw new AppError(409, "MANUAL_LEDGER_NOT_DRAFT", "只有草稿流水可以确认。");
    return prisma.$transaction(async (tx) => {
      const entry = await tx.manualLedgerEntry.update({ where: { id }, data: { status: "confirmed", confirmedBy: operator, confirmedAt: new Date() }, include: { attachments: attachmentSummary } });
      await tx.actionLog.create({ data: { month: current.month, entityType: "manual_ledger_entry", entityId: String(id), action: "confirm_manual_ledger_entry", operator, payloadJson: JSON.stringify({ entryNo: current.entryNo }) } });
      return entry;
    });
  },

  async void(id: number, reason: string, operator: string) {
    const current = await prisma.manualLedgerEntry.findUnique({ where: { id } });
    if (!current) throw new AppError(404, "MANUAL_LEDGER_NOT_FOUND", "原始流水不存在。");
    await ensureMonthOpen(current.month);
    const voidReason = reason.trim();
    if (!voidReason) throw new AppError(400, "MANUAL_LEDGER_VOID_REASON_REQUIRED", "请填写作废原因。");
    return prisma.$transaction(async (tx) => {
      const entry = await tx.manualLedgerEntry.update({ where: { id }, data: { status: "voided", voidedBy: operator, voidedAt: new Date(), voidReason }, include: { attachments: attachmentSummary } });
      await tx.actionLog.create({ data: { month: current.month, entityType: "manual_ledger_entry", entityId: String(id), action: "void_manual_ledger_entry", operator, payloadJson: JSON.stringify({ entryNo: current.entryNo, voidReason }) } });
      return entry;
    });
  },

  async attachment(entryId: number, attachmentId: number) {
    const attachment = await prisma.ledgerAttachment.findFirst({ where: { id: attachmentId, entryId } });
    if (!attachment) throw new AppError(404, "LEDGER_ATTACHMENT_NOT_FOUND", "凭证图片不存在。");
    return attachment;
  }
};
