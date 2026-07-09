import { prisma } from "../prisma/client.js";
import * as XLSX from "xlsx";

type DocumentType = "logistics_commission" | "service_commission";

function monthOrDefault(month?: string) {
  return month ?? "2026-06";
}

function token(ownerName: string, documentType: string) {
  return Buffer.from(`${documentType}:${ownerName}:${Date.now()}`).toString("base64url");
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
    for (const [ownerName, items] of groups.entries()) {
      const grossProfit = items.reduce((sum, item) => sum + item.grossProfit, 0);
      const commissionAmount = items.reduce((sum, item) => sum + (item.manualCommissionAmount ?? item.commissionAmount), 0);
      const document = await prisma.confirmationDocument.upsert({
        where: { month_documentType_ownerName: { month: selectedMonth, documentType: "logistics_commission", ownerName } },
        update: {
          orderCount: items.length,
          businessType: "logistics",
          grossProfit,
          commissionAmount,
          payloadJson: JSON.stringify(items.map((item) => ({
            orderNo: item.financeOrder.orderNo,
            customerOrderNo: item.financeOrder.customerOrderNo,
            businessType: item.businessType,
            grossProfit: item.grossProfit,
            commissionRate: item.commissionRate,
            commissionAmount: item.manualCommissionAmount ?? item.commissionAmount
          }))),
          documentStatus: "generated"
        },
        create: {
          month: selectedMonth,
          documentType: "logistics_commission",
          ownerName,
          businessType: "logistics",
          orderCount: items.length,
          grossProfit,
          commissionAmount,
          payloadJson: JSON.stringify(items.map((item) => ({
            orderNo: item.financeOrder.orderNo,
            customerOrderNo: item.financeOrder.customerOrderNo,
            businessType: item.businessType,
            grossProfit: item.grossProfit,
            commissionRate: item.commissionRate,
            commissionAmount: item.manualCommissionAmount ?? item.commissionAmount
          })))
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
    const document = await prisma.confirmationDocument.update({
      where: { id },
      data: { sendStatus: "sent", signatureToken, signatureUrl }
    });
    await logAction({ month: document.month, entityType: "confirmation_document", entityId: id, action: "send_signature_link" });
    return document;
  },

  async supervisorConfirm(id: number) {
    const document = await prisma.confirmationDocument.update({
      where: { id },
      data: {
        supervisorStatus: "confirmed",
        signatureStatus: "signed",
        sendStatus: "sent",
        signedAt: new Date(),
        confirmedAt: new Date()
      }
    });
    await logAction({ month: document.month, entityType: "confirmation_document", entityId: id, action: "supervisor_confirm" });
    return document;
  },

  async voidDocument(id: number) {
    const document = await prisma.confirmationDocument.update({
      where: { id },
      data: {
        documentStatus: "voided",
        signatureStatus: "pending",
        supervisorStatus: "pending",
        voidedAt: new Date()
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

  async actionLogs(entityType?: string, entityId?: string) {
    return prisma.actionLog.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {})
      },
      orderBy: { id: "desc" },
      take: 100
    });
  }
};
