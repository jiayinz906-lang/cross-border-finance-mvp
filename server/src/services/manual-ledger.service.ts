import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../prisma/client.js";

const allowedDirections = new Set(["receivable", "payable", "other"]);
const allowedSourceTypes = new Set(["manual", "image_statement"]);
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
  businessType?: unknown;
  orderNo?: unknown;
  customerOrderNo?: unknown;
  salespersonName?: unknown;
  customerServiceName?: unknown;
  supplierName?: unknown;
  note?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const result = text(value);
  return result || undefined;
}

function numberValue(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new AppError(400, "MANUAL_LEDGER_INVALID_NUMBER", `${field}必须是有效数字。`);
  return parsed;
}

function parseInput(input: ManualLedgerInput) {
  const month = text(input.month);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new AppError(400, "MANUAL_LEDGER_INVALID_MONTH", "账期必须使用 YYYY-MM 格式。", { month: "请输入有效账期" });
  }

  const transactionDateText = text(input.transactionDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDateText)) {
    throw new AppError(400, "MANUAL_LEDGER_INVALID_DATE", "流水日期必须使用 YYYY-MM-DD 格式。", { transactionDate: "请输入有效日期" });
  }
  const transactionDate = new Date(`${transactionDateText}T00:00:00.000Z`);
  if (Number.isNaN(transactionDate.getTime())) {
    throw new AppError(400, "MANUAL_LEDGER_INVALID_DATE", "流水日期无效。", { transactionDate: "请输入有效日期" });
  }

  const sourceType = text(input.sourceType) || "manual";
  if (!allowedSourceTypes.has(sourceType)) throw new AppError(400, "MANUAL_LEDGER_INVALID_SOURCE", "原始数据来源类型无效。");
  const direction = text(input.direction);
  if (!allowedDirections.has(direction)) throw new AppError(400, "MANUAL_LEDGER_INVALID_DIRECTION", "请选择应收、应付或其他流水类型。");
  const counterparty = text(input.counterparty);
  if (!counterparty) throw new AppError(400, "MANUAL_LEDGER_COUNTERPARTY_REQUIRED", "请输入交易对方。", { counterparty: "交易对方不能为空" });

  const originalAmount = numberValue(input.originalAmount, "原币金额");
  if (originalAmount === 0) throw new AppError(400, "MANUAL_LEDGER_ZERO_AMOUNT", "原币金额不能为 0。", { originalAmount: "金额不能为 0" });
  const exchangeRate = numberValue(input.exchangeRate ?? 1, "汇率");
  if (exchangeRate <= 0) throw new AppError(400, "MANUAL_LEDGER_INVALID_RATE", "汇率必须大于 0。", { exchangeRate: "汇率必须大于 0" });

  return {
    month,
    transactionDate,
    sourceType,
    direction,
    counterparty,
    originalAmount,
    currency: (text(input.currency) || "CNY").toUpperCase(),
    exchangeRate,
    localAmount: Number((originalAmount * exchangeRate).toFixed(2)),
    businessType: optionalText(input.businessType),
    orderNo: optionalText(input.orderNo),
    customerOrderNo: optionalText(input.customerOrderNo),
    salespersonName: optionalText(input.salespersonName),
    customerServiceName: optionalText(input.customerServiceName),
    supplierName: optionalText(input.supplierName),
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
  if (close?.status === "locked") throw new AppError(409, "MONTH_LOCKED", `${month} 已锁账，不能新增或修改原始流水。请先由主管解锁并记录原因。`);
}

const attachmentSummary = {
  select: {
    id: true,
    fileName: true,
    contentType: true,
    fileSize: true,
    sha256: true,
    createdAt: true
  },
  orderBy: { id: "asc" as const }
};

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
      where.OR = ["entryNo", "counterparty", "orderNo", "customerOrderNo", "businessType", "salespersonName", "customerServiceName", "supplierName"].map((field) => ({
        [field]: { contains: keyword, mode: "insensitive" }
      })) as Prisma.ManualLedgerEntryWhereInput[];
    }

    const [rows, total] = await Promise.all([
      prisma.manualLedgerEntry.findMany({
        where,
        include: { attachments: attachmentSummary },
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.manualLedgerEntry.count({ where })
    ]);
    return { rows, total, page, pageSize };
  },

  async summary(month?: string) {
    const rows = await prisma.manualLedgerEntry.findMany({
      where: { ...(month ? { month } : {}), status: { not: "voided" } },
      select: { direction: true, localAmount: true, sourceType: true, status: true, attachments: { select: { id: true } } }
    });
    return rows.reduce((result, row) => {
      result.totalRecords += 1;
      result.localAmount += row.localAmount;
      if (row.direction === "receivable") result.receivable += row.localAmount;
      if (row.direction === "payable") result.payable += row.localAmount;
      if (row.sourceType === "image_statement") result.imageRecords += 1;
      result.attachmentCount += row.attachments.length;
      if (row.status === "draft") result.draftRecords += 1;
      return result;
    }, { totalRecords: 0, receivable: 0, payable: 0, localAmount: 0, imageRecords: 0, attachmentCount: 0, draftRecords: 0 });
  },

  async create(input: ManualLedgerInput, files: UploadedImage[], operator: string) {
    const data = parseInput(input);
    await ensureMonthOpen(data.month);
    if (files.length > 6) {
      throw new AppError(400, "MANUAL_LEDGER_TOO_MANY_IMAGES", "每条原始流水最多上传 6 张图片。", { files: "请删除多余图片后重试" });
    }
    const images = normalizeImages(files);
    if (data.sourceType === "image_statement" && images.length === 0) {
      throw new AppError(400, "MANUAL_LEDGER_IMAGE_REQUIRED", "图片流水至少需要上传 1 张凭证图片。", { files: "请上传流水图片" });
    }
    const entryNo = `ML${data.month.replace("-", "")}-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;

    return prisma.$transaction(async (tx) => {
      const entry = await tx.manualLedgerEntry.create({
        data: {
          ...data,
          entryNo,
          createdBy: operator,
          attachments: images.length ? { create: images } : undefined
        },
        include: { attachments: attachmentSummary }
      });
      await tx.actionLog.create({
        data: {
          month: data.month,
          entityType: "manual_ledger_entry",
          entityId: String(entry.id),
          action: "create_manual_ledger_entry",
          operator,
          payloadJson: JSON.stringify({ entryNo, sourceType: data.sourceType, direction: data.direction, originalAmount: data.originalAmount, exchangeRate: data.exchangeRate, localAmount: data.localAmount, attachmentCount: images.length })
        }
      });
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
    if (current.status === "voided") throw new AppError(409, "MANUAL_LEDGER_ALREADY_VOIDED", "该流水已经作废。");
    const voidReason = reason.trim();
    if (!voidReason) throw new AppError(400, "MANUAL_LEDGER_VOID_REASON_REQUIRED", "请填写作废原因。", { reason: "作废原因不能为空" });
    return prisma.$transaction(async (tx) => {
      const entry = await tx.manualLedgerEntry.update({ where: { id }, data: { status: "voided", voidedBy: operator, voidedAt: new Date(), voidReason }, include: { attachments: attachmentSummary } });
      await tx.actionLog.create({ data: { month: current.month, entityType: "manual_ledger_entry", entityId: String(id), action: "void_manual_ledger_entry", operator, payloadJson: JSON.stringify({ entryNo: current.entryNo, voidReason }) } });
      return entry;
    });
  },

  async attachment(entryId: number, attachmentId: number) {
    const attachment = await prisma.ledgerAttachment.findFirst({ where: { id: attachmentId, entryId } });
    if (!attachment) throw new AppError(404, "LEDGER_ATTACHMENT_NOT_FOUND", "流水图片不存在。");
    return attachment;
  }
};
