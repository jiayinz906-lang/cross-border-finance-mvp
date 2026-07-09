import * as XLSX from "xlsx";
import { prisma } from "../prisma/client.js";

type DocumentType = "logistics_commission" | "service_commission";
type SignatureEvidenceInput = {
  ip?: string;
  userAgent?: string;
  role?: string;
  action?: string;
};

function monthOrDefault(month?: string) {
  return month ?? "2026-06";
}

function formatMonthLabel(month: string) {
  const [year, monthNo] = month.split("-");
  return `${year}年${Number(monthNo)}月`;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function documentCode(month: string, index: number) {
  return `SIG-${month.replace("-", "")}-LC-${String(index + 1).padStart(3, "0")}`;
}

function updatePayloadJson(
  payloadJson: string | null | undefined,
  updater: (payload: Record<string, any>) => Record<string, any>
) {
  if (!payloadJson) return payloadJson;
  try {
    return JSON.stringify(updater(JSON.parse(payloadJson)));
  } catch {
    return payloadJson;
  }
}

function token(ownerName: string, documentType: string) {
  return Buffer.from(`${documentType}:${ownerName}:${Date.now()}`).toString("base64url");
}

function tokenExpiresAt() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
}

function signatureEvidence(input: SignatureEvidenceInput) {
  return {
    action: input.action ?? "signature",
    ip: input.ip ?? "unknown",
    userAgent: input.userAgent ?? "unknown",
    role: input.role ?? "unknown",
    recordedAt: new Date().toISOString()
  };
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function money(value: unknown) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function appendSheet(workbook: XLSX.WorkBook, rows: Record<string, unknown>[], sheetName: string) {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 说明: "无数据" }]), sheetName.slice(0, 31));
}

async function logAction(input: {
  month?: string;
  entityType: string;
  entityId: string | number;
  action: string;
  payload?: unknown;
}) {
  return prisma.actionLog.create({
    data: {
      month: input.month,
      entityType: input.entityType,
      entityId: String(input.entityId),
      action: input.action,
      payloadJson: input.payload ? JSON.stringify(input.payload) : undefined
    }
  });
}

export const workflowService = {
  async listDocuments(month?: string, documentType?: DocumentType) {
    return prisma.confirmationDocument.findMany({
      where: {
        month: monthOrDefault(month),
        ...(documentType ? { documentType } : {})
      },
      orderBy: [{ documentType: "asc" }, { commissionAmount: "desc" }]
    });
  },

  async generateLogisticsDocuments(month?: string) {
    const selectedMonth = monthOrDefault(month);
    const commissions = await prisma.commissionRecord.findMany({
      where: { financeOrder: { month: selectedMonth } },
      include: { financeOrder: true }
    });

    const groups = new Map<string, typeof commissions>();
    for (const item of commissions) {
      groups.set(item.salespersonName, [...(groups.get(item.salespersonName) ?? []), item]);
    }

    const documents = [];
    const sortedGroups = Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right, "zh-Hans-CN"));
    await prisma.confirmationDocument.deleteMany({
      where: {
        month: selectedMonth,
        documentType: "logistics_commission",
        ownerName: { notIn: sortedGroups.map(([ownerName]) => ownerName) }
      }
    });

    for (const [index, [ownerName, items]] of sortedGroups.entries()) {
      const grossProfit = items.reduce((sum, item) => sum + item.grossProfit, 0);
      const commissionAmount = items.reduce((sum, item) => sum + (item.manualCommissionAmount ?? item.commissionAmount), 0);
      const totalReceivable = items.reduce((sum, item) => sum + item.financeOrder.adjustedReceivable, 0);
      const totalPayable = items.reduce((sum, item) => sum + item.financeOrder.adjustedPayable, 0);
      const highRiskCount = items.filter((item) => item.needSupervisorConfirm || (item.financeOrder.adjustedGrossProfitRate ?? 1) < 0.1).length;
      const detailRows = items
        .slice()
        .sort((left, right) => left.financeOrder.orderNo.localeCompare(right.financeOrder.orderNo))
        .map((item) => ({
          orderNo: item.financeOrder.orderNo,
          originalOrderNo: item.financeOrder.customerOrderNo,
          customerName: item.financeOrder.customerName,
          businessType: item.businessType,
          receivable: roundMoney(item.financeOrder.adjustedReceivable),
          payable: roundMoney(item.financeOrder.adjustedPayable),
          grossProfit: roundMoney(item.grossProfit),
          grossProfitRate: item.financeOrder.adjustedGrossProfitRate,
          commissionRate: item.commissionRate,
          commissionAmount: roundMoney(item.manualCommissionAmount ?? item.commissionAmount),
          source: "原始台账导入记录"
        }));
      const payload = {
        title: "XJD Finance UI 员工个人提成签名确认单",
        fileType: "员工电子签名确认流程",
        documentCode: documentCode(selectedMonth, index),
        monthLabel: formatMonthLabel(selectedMonth),
        generatedAt: new Date().toISOString(),
        summary: {
          ownerName,
          businessType: "物流业务",
          orderCount: items.length,
          receivable: roundMoney(totalReceivable),
          payable: roundMoney(totalPayable),
          grossProfit: roundMoney(grossProfit),
          commissionRate: grossProfit > 0 ? commissionAmount / grossProfit : 0,
          accruedCommission: roundMoney(commissionAmount),
          supervisorAdjustmentAmount: 0,
          finalCommission: roundMoney(commissionAmount),
          abnormalNote: `高风险/待复核票据 ${highRiskCount} 票`,
          status: "待员工签名"
        },
        details: detailRows,
        statement: "本人已核对以上业务提成明细，确认订单数量、毛利金额、提成比例、调整金额及最终提成金额真实无误。",
        signatureTrace: {
          employeeSignature: "待员工电子签名",
          signedAt: null,
          confirmIp: "系统自动记录",
          deviceInfo: "系统自动记录",
          supervisorConfirm: "待主管最终确认"
        }
      };
      const document = await prisma.confirmationDocument.upsert({
        where: { month_documentType_ownerName: { month: selectedMonth, documentType: "logistics_commission", ownerName } },
        update: {
          orderCount: items.length,
          businessType: "logistics",
          grossProfit,
          commissionAmount,
          payloadJson: JSON.stringify(payload),
          documentStatus: "generated",
          sendStatus: "unsent",
          signatureStatus: "pending",
          supervisorStatus: "pending",
          signatureToken: null,
          signatureUrl: null,
          signatureTokenExpiresAt: null,
          signerIp: null,
          signerUserAgent: null,
          signerRole: null,
          signatureEvidenceJson: null,
          signedAt: null,
          confirmedAt: null,
          voidedAt: null
        },
        create: {
          month: selectedMonth,
          documentType: "logistics_commission",
          ownerName,
          businessType: "logistics",
          orderCount: items.length,
          grossProfit,
          commissionAmount,
          payloadJson: JSON.stringify(payload)
        }
      });
      documents.push(document);
    }

    await logAction({
      month: selectedMonth,
      entityType: "confirmation_document",
      entityId: "logistics_commission",
      action: "batch_generate",
      payload: { count: documents.length }
    });
    return documents;
  },

  async generateServiceDocuments(month?: string) {
    const selectedMonth = monthOrDefault(month);
    const records = await prisma.serviceBusinessRecord.findMany({
      where: { financeOrder: { month: selectedMonth } },
      include: { financeOrder: true }
    });

    const documents = [];
    for (const item of records) {
      const ownerName = item.financeOrder.orderNo;
      const commissionAmount = item.supervisorFinalCommission ?? item.suggestedCommissionMin ?? 0;
      const document = await prisma.confirmationDocument.upsert({
        where: { month_documentType_ownerName: { month: selectedMonth, documentType: "service_commission", ownerName } },
        update: {
          businessType: item.serviceType,
          orderCount: 1,
          grossProfit: item.grossProfit ?? 0,
          commissionAmount,
          payloadJson: JSON.stringify({ serviceRecordId: item.id, orderNo: item.financeOrder.orderNo }),
          documentStatus: "generated"
        },
        create: {
          month: selectedMonth,
          documentType: "service_commission",
          ownerName,
          businessType: item.serviceType,
          orderCount: 1,
          grossProfit: item.grossProfit ?? 0,
          commissionAmount,
          payloadJson: JSON.stringify({ serviceRecordId: item.id, orderNo: item.financeOrder.orderNo })
        }
      });
      documents.push(document);
    }

    await logAction({
      month: selectedMonth,
      entityType: "confirmation_document",
      entityId: "service_commission",
      action: "batch_generate",
      payload: { count: documents.length }
    });
    return documents;
  },

  async sendSignatureLink(id: number) {
    const signatureToken = token(String(id), "signature");
    const signatureUrl = `/signature/${signatureToken}`;
    const expiresAt = tokenExpiresAt();
    const current = await prisma.confirmationDocument.findUniqueOrThrow({ where: { id } });
    const document = await prisma.confirmationDocument.update({
      where: { id },
      data: {
        sendStatus: "sent",
        signatureToken,
        signatureUrl,
        signatureTokenExpiresAt: expiresAt,
        payloadJson: updatePayloadJson(current.payloadJson, (payload) => ({
          ...payload,
          signatureTrace: {
            ...(payload.signatureTrace ?? {}),
            employeeSignature: "签名链接已发送，待员工电子签名",
            tokenExpiresAt: expiresAt.toISOString()
          }
        }))
      }
    });
    await logAction({ month: document.month, entityType: "confirmation_document", entityId: id, action: "send_signature_link", payload: { signatureUrl, expiresAt } });
    return document;
  },

  async signByToken(signatureToken: string, evidence: SignatureEvidenceInput = {}) {
    const current = await prisma.confirmationDocument.findUniqueOrThrow({ where: { signatureToken } });
    if (!current.signatureTokenExpiresAt || current.signatureTokenExpiresAt < new Date()) {
      throw new Error("签名链接已过期，请重新发送确认单。");
    }
    const signedAt = new Date();
    const proof = signatureEvidence({ ...evidence, action: "employee_sign" });
    const document = await prisma.confirmationDocument.update({
      where: { id: current.id },
      data: {
        signatureStatus: "signed",
        sendStatus: "sent",
        signedAt,
        signerIp: proof.ip,
        signerUserAgent: proof.userAgent,
        signerRole: proof.role,
        signatureEvidenceJson: JSON.stringify(proof),
        payloadJson: updatePayloadJson(current.payloadJson, (payload) => ({
          ...payload,
          summary: { ...(payload.summary ?? {}), status: "已员工签名，待主管确认" },
          signatureTrace: {
            ...(payload.signatureTrace ?? {}),
            employeeSignature: "已电子签名",
            signedAt: signedAt.toISOString(),
            confirmIp: proof.ip,
            deviceInfo: proof.userAgent,
            signerRole: proof.role
          }
        }))
      }
    });
    await logAction({ month: document.month, entityType: "confirmation_document", entityId: document.id, action: "employee_sign", payload: proof });
    return document;
  },

  async supervisorConfirm(id: number, evidence: SignatureEvidenceInput = {}) {
    const current = await prisma.confirmationDocument.findUniqueOrThrow({ where: { id } });
    const confirmedAt = new Date();
    const proof = signatureEvidence({ ...evidence, action: "supervisor_confirm" });
    const document = await prisma.confirmationDocument.update({
      where: { id },
      data: {
        supervisorStatus: "confirmed",
        signatureStatus: "signed",
        sendStatus: "sent",
        signedAt: current.signedAt ?? confirmedAt,
        confirmedAt,
        signerIp: current.signerIp ?? proof.ip,
        signerUserAgent: current.signerUserAgent ?? proof.userAgent,
        signerRole: current.signerRole ?? proof.role,
        signatureEvidenceJson: JSON.stringify({
          employee: current.signatureEvidenceJson ? JSON.parse(current.signatureEvidenceJson) : null,
          supervisor: proof
        }),
        payloadJson: updatePayloadJson(current.payloadJson, (payload) => ({
          ...payload,
          summary: { ...(payload.summary ?? {}), status: "已员工签名/主管确认" },
          signatureTrace: {
            ...(payload.signatureTrace ?? {}),
            employeeSignature: "已电子签名",
            signedAt: (current.signedAt ?? confirmedAt).toISOString(),
            supervisorConfirm: "主管已确认",
            supervisorIp: proof.ip,
            supervisorDeviceInfo: proof.userAgent,
            supervisorRole: proof.role
          }
        }))
      }
    });
    await logAction({ month: document.month, entityType: "confirmation_document", entityId: id, action: "supervisor_confirm", payload: proof });
    return document;
  },

  async voidDocument(id: number) {
    const current = await prisma.confirmationDocument.findUniqueOrThrow({ where: { id } });
    const document = await prisma.confirmationDocument.update({
      where: { id },
      data: {
        documentStatus: "voided",
        signatureStatus: "pending",
        supervisorStatus: "pending",
        voidedAt: new Date(),
        payloadJson: updatePayloadJson(current.payloadJson, (payload) => ({
          ...payload,
          summary: { ...(payload.summary ?? {}), status: "已作废，待重新生成/重签" },
          signatureTrace: {
            ...(payload.signatureTrace ?? {}),
            employeeSignature: "已作废，待重新签名",
            signedAt: null,
            supervisorConfirm: "待主管最终确认"
          }
        }))
      }
    });
    await logAction({ month: document.month, entityType: "confirmation_document", entityId: id, action: "void_for_resign" });
    return document;
  },

  async createExportJob(input: { month?: string; exportType: string; fileFormat?: string; payload?: unknown }) {
    const selectedMonth = monthOrDefault(input.month);
    const fileFormat = input.fileFormat ?? "xlsx";
    const job = await prisma.exportJob.create({
      data: {
        month: selectedMonth,
        exportType: input.exportType,
        fileFormat,
        fileName: `${selectedMonth}-${input.exportType}.${fileFormat}`,
        payloadJson: input.payload ? JSON.stringify(input.payload) : undefined
      }
    });
    await logAction({ month: selectedMonth, entityType: "export_job", entityId: job.id, action: "create_export_job" });
    return job;
  },

  async downloadExportJob(id: number) {
    const job = await prisma.exportJob.findUniqueOrThrow({ where: { id } });
    const payload = job.payloadJson ? JSON.parse(job.payloadJson) : {};
    const title = `${job.month} ${job.exportType}`;

    if (job.fileFormat === "png") {
      return {
        fileName: job.fileName,
        contentType: "image/png",
        buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lF7G0wAAAABJRU5ErkJggg==", "base64")
      };
    }

    if (job.fileFormat === "pdf") {
      const text = `${title}\\n${JSON.stringify(payload, null, 2)}`.replace(/[^\x20-\x7E\n]/g, "");
      const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${text.length + 64} >> stream
BT /F1 12 Tf 48 740 Td (${text.slice(0, 800).replace(/[()]/g, "")}) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000059 00000 n 
0000000116 00000 n 
0000000260 00000 n 
0000000400 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
470
%%EOF`;
      return { fileName: job.fileName, contentType: "application/pdf", buffer: Buffer.from(pdf) };
    }

    const workbook = XLSX.utils.book_new();
    const rows = Array.isArray(payload) ? payload : [payload];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "导出数据");
    return {
      fileName: job.fileName,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
    };
  },

  async downloadConfirmationDocument(id: number) {
    const document = await prisma.confirmationDocument.findUniqueOrThrow({ where: { id } });
    const payload = safeJson<Record<string, any>>(document.payloadJson, {});
    const summary = payload.summary ?? {};
    const details = Array.isArray(payload.details) ? payload.details : [];
    const trace = payload.signatureTrace ?? {};
    const workbook = XLSX.utils.book_new();

    appendSheet(workbook, [
      { 项目: "确认单标题", 内容: payload.title ?? "员工个人提成签名确认单" },
      { 项目: "确认单编号", 内容: payload.documentCode ?? `DOC-${document.id}` },
      { 项目: "月份", 内容: payload.monthLabel ?? document.month },
      { 项目: "员工/销售代表", 内容: document.ownerName },
      { 项目: "业务类型", 内容: summary.businessType ?? document.businessType ?? "-" },
      { 项目: "订单数量", 内容: document.orderCount },
      { 项目: "应收金额", 内容: money(summary.receivable) },
      { 项目: "应付金额", 内容: money(summary.payable) },
      { 项目: "确认毛利", 内容: money(document.grossProfit) },
      { 项目: "提成比例", 内容: typeof summary.commissionRate === "number" ? `${(summary.commissionRate * 100).toFixed(2)}%` : "-" },
      { 项目: "最终确认提成", 内容: money(document.commissionAmount) },
      { 项目: "单据状态", 内容: document.documentStatus },
      { 项目: "发送状态", 内容: document.sendStatus },
      { 项目: "员工签名状态", 内容: document.signatureStatus },
      { 项目: "主管确认状态", 内容: document.supervisorStatus },
      { 项目: "员工签名时间", 内容: document.signedAt?.toISOString() ?? "-" },
      { 项目: "主管确认时间", 内容: document.confirmedAt?.toISOString() ?? "-" }
    ], "确认单摘要");

    appendSheet(workbook, details.map((item: any) => ({
      运单号: item.orderNo,
      原始订单号: item.originalOrderNo,
      客户: item.customerName,
      业务类型: item.businessType,
      应收: money(item.receivable),
      应付: money(item.payable),
      毛利: money(item.grossProfit),
      毛利率: typeof item.grossProfitRate === "number" ? `${(item.grossProfitRate * 100).toFixed(2)}%` : "-",
      提成比例: typeof item.commissionRate === "number" ? `${(item.commissionRate * 100).toFixed(2)}%` : "-",
      提成金额: money(item.commissionAmount),
      来源: item.source ?? "原始台账导入记录"
    })), "订单明细");

    appendSheet(workbook, [
      { 项目: "确认声明", 内容: payload.statement ?? "本人已核对以上业务提成明细，确认真实无误。" },
      { 项目: "员工签名", 内容: document.signatureStatus === "signed" ? "已电子签名" : trace.employeeSignature ?? "待员工签名" },
      { 项目: "签名 IP", 内容: document.signerIp ?? trace.confirmIp ?? "-" },
      { 项目: "签名设备", 内容: document.signerUserAgent ?? trace.deviceInfo ?? "-" },
      { 项目: "签名角色", 内容: document.signerRole ?? "-" },
      { 项目: "签名证据", 内容: document.signatureEvidenceJson ?? "-" },
      { 项目: "主管确认", 内容: document.supervisorStatus === "confirmed" ? "主管已确认" : trace.supervisorConfirm ?? "待主管确认" }
    ], "签名与证据");

    await logAction({
      month: document.month,
      entityType: "confirmation_document",
      entityId: document.id,
      action: "download_confirmation_xlsx",
      payload: { ownerName: document.ownerName, documentType: document.documentType }
    });

    return {
      fileName: `${document.month}-${document.ownerName}-confirmation.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
    };
  },

  async markRiskReviewed(id: number) {
    const risk = await prisma.riskRecord.update({
      where: { id },
      data: { status: "reviewed" },
      include: { financeOrder: true }
    });
    await logAction({ month: risk.financeOrder.month, entityType: "risk_record", entityId: id, action: "mark_reviewed" });
    return risk;
  },

  async confirmServiceRecord(id: number, finalCommission?: number) {
    const record = await prisma.serviceBusinessRecord.update({
      where: { id },
      data: {
        supervisorFinalCommission: finalCommission,
        confirmStatus: "confirmed"
      },
      include: { financeOrder: true }
    });
    await logAction({
      month: record.financeOrder.month,
      entityType: "service_business_record",
      entityId: id,
      action: "confirm_service_commission",
      payload: { finalCommission }
    });
    return record;
  },

  async confirmSalespersonCommission(month = "2026-06", salespersonName: string, manualRate?: number) {
    const records = await prisma.commissionRecord.findMany({
      where: { salespersonName, financeOrder: { month } },
      include: { financeOrder: true }
    });
    const updates = [];
    for (const record of records) {
      updates.push(await prisma.commissionRecord.update({
        where: { id: record.id },
        data: {
          confirmStatus: "confirmed",
          ...(manualRate !== undefined ? {
            commissionRate: manualRate,
            manualCommissionAmount: record.grossProfit * manualRate
          } : {})
        }
      }));
    }
    await logAction({
      month,
      entityType: "commission_record",
      entityId: salespersonName,
      action: manualRate !== undefined ? "adjust_and_confirm_commission" : "confirm_commission",
      payload: { count: updates.length, manualRate }
    });
    return { salespersonName, rows: updates };
  },

  async actionLogs(input: { month?: string; entityType?: string; entityId?: string } = {}) {
    return prisma.actionLog.findMany({
      where: {
        ...(input.month ? { month: input.month } : {}),
        ...(input.entityType ? { entityType: input.entityType } : {}),
        ...(input.entityId ? { entityId: input.entityId } : {})
      },
      orderBy: { id: "desc" },
      take: 100
    });
  },

  async monthCloseStatus(month?: string) {
    const selectedMonth = monthOrDefault(month);
    const close = await prisma.monthClose.findUnique({ where: { month: selectedMonth } });
    return close ?? {
      id: null,
      month: selectedMonth,
      status: "open",
      lockedBy: null,
      lockedAt: null,
      unlockedBy: null,
      unlockedAt: null,
      closeNote: null
    };
  },

  async lockMonth(month?: string, input: { operator?: string; note?: string } = {}) {
    const selectedMonth = monthOrDefault(month);
    const operator = input.operator || "主管";
    const close = await prisma.monthClose.upsert({
      where: { month: selectedMonth },
      update: {
        status: "locked",
        lockedBy: operator,
        lockedAt: new Date(),
        closeNote: input.note,
        unlockedBy: null,
        unlockedAt: null
      },
      create: {
        month: selectedMonth,
        status: "locked",
        lockedBy: operator,
        lockedAt: new Date(),
        closeNote: input.note
      }
    });
    await logAction({
      month: selectedMonth,
      entityType: "month_close",
      entityId: selectedMonth,
      action: "lock_month",
      payload: { operator, note: input.note }
    });
    return close;
  },

  async unlockMonth(month?: string, input: { operator?: string; note?: string } = {}) {
    const selectedMonth = monthOrDefault(month);
    const operator = input.operator || "主管";
    const close = await prisma.monthClose.upsert({
      where: { month: selectedMonth },
      update: {
        status: "open",
        unlockedBy: operator,
        unlockedAt: new Date(),
        closeNote: input.note
      },
      create: {
        month: selectedMonth,
        status: "open",
        unlockedBy: operator,
        unlockedAt: new Date(),
        closeNote: input.note
      }
    });
    await logAction({
      month: selectedMonth,
      entityType: "month_close",
      entityId: selectedMonth,
      action: "unlock_month",
      payload: { operator, note: input.note }
    });
    return close;
  }
};
