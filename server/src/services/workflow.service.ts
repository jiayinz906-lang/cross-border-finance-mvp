import * as XLSX from "xlsx";
import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { prisma } from "../prisma/client.js";
import { analyticsService } from "./analytics.service.js";

type DocumentType = "logistics_commission" | "service_commission" | "operator_performance";

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
  return `${year}-${monthNo}`;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function documentCode(month: string, index: number, documentType: DocumentType) {
  const prefix = documentType === "service_commission" ? "SC" : documentType === "operator_performance" ? "OP" : "LC";
  return `SIG-${month.replace("-", "")}-${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function updatePayloadJson(
  payloadJson: string | null | undefined,
  updater: (payload: Record<string, any>) => Record<string, any>
) {
  const payload = safeJson<Record<string, any>>(payloadJson, {});
  return JSON.stringify(updater(payload));
}

function token(ownerName: string, documentType: string) {
  return crypto
    .createHmac("sha256", process.env.AUTH_TOKEN_SECRET || "xjd-finance-local-dev-secret")
    .update(`${documentType}:${ownerName}:${Date.now()}:${crypto.randomUUID()}`)
    .digest("base64url");
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
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: "no data" }]),
    sheetName.slice(0, 31)
  );
}

function textValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "-";
  return String(value);
}

function percentText(value: unknown) {
  return typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "-";
}

function xmlEscape(value: unknown) {
  return textValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function confirmationRows(document: {
  id: number;
  month: string;
  ownerName: string;
  version: number;
  businessType: string | null;
  orderCount: number;
  grossProfit: number;
  commissionAmount: number;
  documentStatus: string;
  sendStatus: string;
  signatureStatus: string;
  supervisorStatus: string;
  signedAt: Date | null;
  confirmedAt: Date | null;
  adjustReason: string | null;
  voidReason: string | null;
  signerIp: string | null;
  signerUserAgent: string | null;
  signerRole: string | null;
  signatureEvidenceJson: string | null;
  payloadJson: string | null;
}) {
  const payload = safeJson<Record<string, any>>(document.payloadJson, {});
  const summary = payload.summary ?? {};
  const details = Array.isArray(payload.details) ? payload.details : [];
  const chargeLines = Array.isArray(payload.chargeLines) ? payload.chargeLines : [];
  const trace = payload.signatureTrace ?? {};
  const summaryRows = [
    { item: "title", value: payload.title ?? "Employee Commission Signature Confirmation" },
    { item: "documentCode", value: payload.documentCode ?? `DOC-${document.id}` },
    { item: "version", value: document.version },
    { item: "sourceFileName", value: payload.sourceFileName ?? "-" },
    { item: "importBatchNo", value: payload.importBatchNo ?? "-" },
    { item: "snapshotCreatedAt", value: payload.snapshotCreatedAt ?? "-" },
    { item: "month", value: payload.monthLabel ?? document.month },
    { item: "employeeOrOwner", value: document.ownerName },
    { item: "businessType", value: summary.businessType ?? document.businessType ?? "-" },
    { item: "orderCount", value: document.orderCount },
    { item: "receivable", value: money(summary.receivable) },
    { item: "payable", value: money(summary.payable) },
    { item: "grossProfit", value: money(document.grossProfit) },
    { item: "commissionRate", value: percentText(summary.commissionRate) },
    { item: "finalCommission", value: money(document.commissionAmount) },
    { item: "adjustReason", value: document.adjustReason ?? "-" },
    { item: "voidReason", value: document.voidReason ?? "-" },
    { item: "documentStatus", value: document.documentStatus },
    { item: "sendStatus", value: document.sendStatus },
    { item: "signatureStatus", value: document.signatureStatus },
    { item: "supervisorStatus", value: document.supervisorStatus },
    { item: "signedAt", value: document.signedAt?.toISOString() ?? "-" },
    { item: "confirmedAt", value: document.confirmedAt?.toISOString() ?? "-" }
  ];
  const detailRows = details.map((item: any) => ({
    systemOrderNo: item.orderNo,
    originalOrderNo: item.originalOrderNo,
    customerName: item.customerName,
    businessType: item.businessType,
    receivable: money(item.receivable),
    payable: money(item.payable),
    grossProfit: money(item.grossProfit),
    grossProfitRate: percentText(item.grossProfitRate),
    commissionRate: percentText(item.commissionRate),
    commissionAmount: money(item.commissionAmount),
    source: item.source ?? "raw ledger"
  }));
  const evidenceRows = [
    { item: "statement", value: payload.statement ?? "Employee confirms the commission details." },
    { item: "employeeSignature", value: document.signatureStatus === "signed" ? "signed" : trace.employeeSignature ?? "pending" },
    { item: "signatureIp", value: document.signerIp ?? trace.confirmIp ?? "-" },
    { item: "signatureUserAgent", value: document.signerUserAgent ?? trace.deviceInfo ?? "-" },
    { item: "signatureRole", value: document.signerRole ?? "-" },
    { item: "signatureEvidence", value: document.signatureEvidenceJson ?? "-" },
    { item: "supervisorConfirmation", value: document.supervisorStatus === "confirmed" ? "confirmed" : trace.supervisorConfirm ?? "pending" },
    { item: "adjustReason", value: document.adjustReason ?? "-" },
    { item: "voidReason", value: document.voidReason ?? "-" }
  ];
  const chargeLineRows = chargeLines.map((item: any) => ({
    sourceFileName: item.sourceFileName,
    importBatchNo: item.importBatchNo,
    excelRow: item.excelRow,
    systemOrderNo: item.systemOrderNo,
    originalOrderNo: item.originalOrderNo,
    customerName: item.customerName,
    salespersonName: item.salespersonName,
    customerServiceName: item.customerServiceName,
    direction: item.direction,
    feeType: item.feeType,
    service: item.service,
    supplierName: item.supplierName,
    exchangeRate: item.exchangeRate,
    originalAmount: money(item.originalAmount),
    localAmount: money(item.localAmount),
    signedAmount: money(item.signedAmount),
    isCompensation: Boolean(item.isCompensation)
  }));
  return { payload, summaryRows, detailRows, evidenceRows, chargeLineRows };
}

function pdfBuffer(document: { ownerName: string; month: string; version: number; documentType: string; payloadJson: string | null } & any) {
  const { payload, summaryRows, detailRows, evidenceRows } = confirmationRows(document);
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  doc.fontSize(16).text(textValue(payload.title ?? "Commission Confirmation"), { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Owner: ${document.ownerName}    Month: ${document.month}    Version: ${document.version}`);
  doc.text(`Type: ${document.documentType}    Generated from imported Excel ledger data`);
  doc.moveDown();
  doc.fontSize(12).text("Summary", { underline: true });
  doc.fontSize(9);
  for (const row of summaryRows) doc.text(`${row.item}: ${textValue(row.value)}`);
  doc.moveDown();
  doc.fontSize(12).text("Order Details", { underline: true });
  doc.fontSize(8);
  for (const row of detailRows.slice(0, 35)) {
    doc.text(`${row.systemOrderNo} | ${row.originalOrderNo ?? "-"} | ${row.customerName ?? "-"} | GP ${row.grossProfit} | Rate ${row.commissionRate} | Commission ${row.commissionAmount}`);
  }
  if (detailRows.length > 35) doc.text(`... ${detailRows.length - 35} more rows included in XLSX confirmation file`);
  doc.moveDown();
  doc.fontSize(12).text("Signature Evidence", { underline: true });
  doc.fontSize(9);
  for (const row of evidenceRows) doc.text(`${row.item}: ${textValue(row.value).slice(0, 180)}`);
  doc.end();
  return done;
}

async function pngBuffer(document: { ownerName: string; month: string; version: number; documentType: string; payloadJson: string | null } & any) {
  const { payload, summaryRows, detailRows, evidenceRows } = confirmationRows(document);
  const width = 1400;
  const rowHeight = 34;
  const height = Math.min(2200, 260 + summaryRows.length * 24 + Math.min(detailRows.length, 18) * rowHeight + evidenceRows.length * 24);
  const detailSvg = detailRows.slice(0, 18).map((row, index) => {
    const y = 520 + index * rowHeight;
    return `<text x="72" y="${y}" class="small">${xmlEscape(row.systemOrderNo)}</text>
<text x="260" y="${y}" class="small">${xmlEscape(row.originalOrderNo)}</text>
<text x="430" y="${y}" class="small">${xmlEscape(row.customerName)}</text>
<text x="690" y="${y}" class="small">${xmlEscape(row.grossProfit)}</text>
<text x="860" y="${y}" class="small">${xmlEscape(row.commissionRate)}</text>
<text x="1040" y="${y}" class="small">${xmlEscape(row.commissionAmount)}</text>
<line x1="60" y1="${y + 12}" x2="1340" y2="${y + 12}" stroke="#e6edf7"/>`;
  }).join("");
  const summarySvg = summaryRows.slice(0, 14).map((row, index) => {
    const y = 154 + index * 24;
    return `<text x="72" y="${y}" class="label">${xmlEscape(row.item)}</text><text x="300" y="${y}" class="text">${xmlEscape(row.value)}</text>`;
  }).join("");
  const evidenceStart = 550 + Math.min(detailRows.length, 18) * rowHeight;
  const evidenceSvg = evidenceRows.slice(0, 8).map((row, index) => {
    const y = evidenceStart + index * 24;
    return `<text x="72" y="${y}" class="label">${xmlEscape(row.item)}</text><text x="300" y="${y}" class="text">${xmlEscape(textValue(row.value).slice(0, 105))}</text>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<style>
.title{font:700 30px Arial,"Microsoft YaHei",sans-serif;fill:#071737}
.sub{font:600 18px Arial,"Microsoft YaHei",sans-serif;fill:#52627d}
.section{font:700 22px Arial,"Microsoft YaHei",sans-serif;fill:#071737}
.label{font:700 15px Arial,"Microsoft YaHei",sans-serif;fill:#71809c}
.text{font:700 15px Arial,"Microsoft YaHei",sans-serif;fill:#071737}
.small{font:700 15px Arial,"Microsoft YaHei",sans-serif;fill:#13213c}
</style>
<rect width="100%" height="100%" fill="#f4f7fb"/>
<rect x="40" y="40" width="1320" height="${height - 80}" rx="14" fill="#fff" stroke="#dbe5f2"/>
<text x="70" y="94" class="title">${xmlEscape(payload.title ?? "Commission Confirmation")}</text>
<text x="70" y="126" class="sub">Owner: ${xmlEscape(document.ownerName)}   Month: ${xmlEscape(document.month)}   Version: ${document.version}   Source: imported Excel ledger</text>
<text x="70" y="154" class="section">Summary</text>
${summarySvg}
<text x="70" y="470" class="section">Order Details</text>
<text x="72" y="500" class="label">System No</text><text x="260" y="500" class="label">Original No</text><text x="430" y="500" class="label">Customer</text><text x="690" y="500" class="label">Gross Profit</text><text x="860" y="500" class="label">Rate</text><text x="1040" y="500" class="label">Commission</text>
${detailSvg}
<text x="70" y="${evidenceStart - 16}" class="section">Signature Evidence</text>
${evidenceSvg}
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function requireReason(reason: string | undefined, message: string) {
  const trimmed = reason?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function workflowStep(key: string, count: number, ownerRole: string, nextAction: string) {
  return {
    key,
    status: count > 0 ? "active" : "done",
    count,
    ownerRole,
    nextAction
  };
}

function blockingIssueCountFromBatch(batch: { previewJson: string | null } | null) {
  const preview = safeJson<Record<string, any>>(batch?.previewJson, {});
  if (Array.isArray(preview.blockingIssues)) return preview.blockingIssues.length;
  return Number(preview.qualityReport?.blockingCount ?? 0);
}

async function latestActiveImportBatch(month: string) {
  return prisma.importBatch.findFirst({
    where: { month, status: "active" },
    orderBy: { id: "desc" }
  });
}

async function chargeLineSnapshot(month: string, orderNos: string[]) {
  if (!orderNos.length) return [];
  const activeBatch = await latestActiveImportBatch(month);
  if (!activeBatch) return [];
  const rows = await prisma.financeChargeLine.findMany({
    where: {
      month,
      importBatchId: activeBatch.id,
      orderNo: { in: Array.from(new Set(orderNos)) }
    },
    orderBy: [{ orderNo: "asc" }, { rowIndex: "asc" }, { id: "asc" }]
  });
  return rows.map((row) => ({
    sourceFileName: row.sourceFileName,
    importBatchNo: activeBatch.batchNo,
    excelRow: row.rowIndex,
    systemOrderNo: row.orderNo,
    originalOrderNo: row.customerOrderNo,
    customerName: row.customerName,
    salespersonName: row.salespersonName,
    customerServiceName: row.customerServiceName,
    direction: row.direction,
    feeType: row.feeType,
    service: row.service,
    supplierName: row.supplierName,
    currency: row.currency,
    exchangeRate: row.exchangeRate,
    originalAmount: row.originalAmount,
    localAmount: row.localAmount,
    signedAmount: row.signedAmount,
    isCompensation: row.isCompensation
  }));
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

async function latestDocument(month: string, documentType: DocumentType, ownerName: string) {
  return prisma.confirmationDocument.findFirst({
    where: { month, documentType, ownerName },
    orderBy: [{ version: "desc" }, { id: "desc" }]
  });
}

async function writeConfirmationDocument(input: {
  month: string;
  documentType: DocumentType;
  ownerName: string;
  businessType: string;
  orderCount: number;
  grossProfit: number;
  commissionAmount: number;
  payloadJson: string;
}) {
  const latest = await latestDocument(input.month, input.documentType, input.ownerName);
  if (latest?.supervisorStatus === "confirmed" && latest.documentStatus !== "voided") {
    return latest;
  }

  if (!latest || latest.documentStatus === "voided") {
    return prisma.confirmationDocument.create({
      data: {
        ...input,
        version: (latest?.version ?? 0) + 1
      }
    });
  }

  return prisma.confirmationDocument.update({
    where: { id: latest.id },
    data: {
      businessType: input.businessType,
      orderCount: input.orderCount,
      grossProfit: input.grossProfit,
      commissionAmount: input.commissionAmount,
      payloadJson: input.payloadJson,
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
      adjustReason: null,
      voidReason: null,
      signedAt: null,
      confirmedAt: null,
      voidedAt: null
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

  async monthStatus(month?: string) {
    const selectedMonth = monthOrDefault(month);
    const [
      activeBatch,
      openRisks,
      pendingServices,
      pendingLogisticsDocs,
      pendingServiceDocs,
      pendingOperatorDocs,
      pendingReceivableOrders,
      pendingPayableOrders,
      close
    ] = await Promise.all([
      latestActiveImportBatch(selectedMonth),
      prisma.riskRecord.count({
        where: { status: { not: "reviewed" }, financeOrder: { month: selectedMonth } }
      }),
      prisma.serviceBusinessRecord.count({
        where: { confirmStatus: { not: "confirmed" }, financeOrder: { month: selectedMonth } }
      }),
      prisma.confirmationDocument.count({
        where: {
          month: selectedMonth,
          documentType: "logistics_commission",
          documentStatus: { not: "voided" },
          OR: [{ signatureStatus: { not: "signed" } }, { supervisorStatus: { not: "confirmed" } }]
        }
      }),
      prisma.confirmationDocument.count({
        where: {
          month: selectedMonth,
          documentType: "service_commission",
          documentStatus: { not: "voided" },
          OR: [{ signatureStatus: { not: "signed" } }, { supervisorStatus: { not: "confirmed" } }]
        }
      }),
      prisma.confirmationDocument.count({
        where: {
          month: selectedMonth,
          documentType: "operator_performance",
          documentStatus: { not: "voided" },
          OR: [{ signatureStatus: { not: "signed" } }, { supervisorStatus: { not: "confirmed" } }]
        }
      }),
      prisma.financeOrder.count({
        where: { month: selectedMonth, isServiceBusiness: false, receivableStatus: { not: "settled" } }
      }),
      prisma.financeOrder.count({
        where: { month: selectedMonth, isServiceBusiness: false, payableStatus: { not: "settled" } }
      }),
      prisma.monthClose.findUnique({ where: { month: selectedMonth } })
    ]);

    const hasImport = Boolean(activeBatch);
    const importAuditBlockingCount = blockingIssueCountFromBatch(activeBatch);
    const receivablePayablePending = pendingReceivableOrders + pendingPayableOrders;
    const blockers = [
      !hasImport ? "Excel import not completed" : null,
      importAuditBlockingCount > 0 ? `import audit blocked: ${importAuditBlockingCount}` : null,
      openRisks > 0 ? `risk review pending: ${openRisks}` : null,
      pendingServices > 0 ? `service confirmation pending: ${pendingServices}` : null,
      pendingLogisticsDocs > 0 ? `logistics commission signature/supervisor confirmation pending: ${pendingLogisticsDocs}` : null,
      pendingServiceDocs > 0 ? `service signature/supervisor confirmation pending: ${pendingServiceDocs}` : null,
      pendingOperatorDocs > 0 ? `operator performance signature/supervisor confirmation pending: ${pendingOperatorDocs}` : null,
      receivablePayablePending > 0 ? `receivable/payable pending: ${receivablePayablePending}` : null
    ].filter(Boolean) as string[];
    const locked = close?.status === "locked";
    const ready = hasImport && blockers.length === 0;

    return {
      month: selectedMonth,
      locked,
      readyToClose: ready,
      blockers,
      steps: [
        {
          key: "excel_imported",
          status: hasImport ? "done" : "active",
          count: hasImport ? 1 : 0,
          ownerRole: "finance",
          nextAction: hasImport ? "Excel imported" : "Upload and confirm Excel import"
        },
        {
          key: "import_audit_passed",
          status: !hasImport ? "blocked" : importAuditBlockingCount > 0 ? "active" : "done",
          count: importAuditBlockingCount,
          ownerRole: "finance",
          nextAction: importAuditBlockingCount > 0 ? "Fix blocking import audit issues and re-import" : "Import audit passed"
        },
        workflowStep("risk_review_pending", openRisks, "supervisor", "Review low-margin and abnormal-profit orders"),
        workflowStep("service_confirm_pending", pendingServices, "supervisor", "Confirm service commission"),
        workflowStep("commission_signature_pending", pendingLogisticsDocs + pendingServiceDocs, "sales", "Send and complete commission signature forms"),
        workflowStep("operator_signature_pending", pendingOperatorDocs, "finance", "Send and complete operator performance signature forms"),
        workflowStep("receivable_payable_pending", receivablePayablePending, "finance", "Reconcile receivables and payables"),
        {
          key: "cfo_ready",
          status: ready ? "done" : "blocked",
          count: blockers.length,
          ownerRole: "executive",
          nextAction: ready ? "Ready for CFO close review" : blockers.join("; ")
        },
        {
          key: "locked",
          status: locked ? "done" : ready ? "active" : "blocked",
          count: locked ? 0 : 1,
          ownerRole: "finance",
          nextAction: locked ? "Month is locked" : ready ? "Supervisor can lock month" : "Resolve blockers before lock"
        }
      ]
    };
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
    for (const [index, [ownerName, items]] of sortedGroups.entries()) {
      const activeBatch = await latestActiveImportBatch(selectedMonth);
      const grossProfit = items.reduce((sum, item) => sum + item.grossProfit, 0);
      const commissionAmount = items.reduce((sum, item) => sum + (item.manualCommissionAmount ?? item.commissionAmount), 0);
      const totalReceivable = items.reduce((sum, item) => sum + item.financeOrder.adjustedReceivable, 0);
      const totalPayable = items.reduce((sum, item) => sum + item.financeOrder.adjustedPayable, 0);
      const highRiskCount = items.filter((item) => item.needSupervisorConfirm || (item.financeOrder.adjustedGrossProfitRate ?? 1) < 0.1).length;
      const orderNos = items.map((item) => item.financeOrder.orderNo);
      const chargeLines = await chargeLineSnapshot(selectedMonth, orderNos);
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
          source: "raw ledger"
        }));

      const payload = {
        title: "Employee Commission Signature Confirmation",
        fileType: "electronic_signature_confirmation",
        documentCode: documentCode(selectedMonth, index, "logistics_commission"),
        sourceFileName: activeBatch?.fileName ?? "-",
        importBatchNo: activeBatch?.batchNo ?? "-",
        snapshotCreatedAt: new Date().toISOString(),
        monthLabel: formatMonthLabel(selectedMonth),
        generatedAt: new Date().toISOString(),
        summary: {
          ownerName,
          businessType: "logistics",
          orderCount: items.length,
          receivable: roundMoney(totalReceivable),
          payable: roundMoney(totalPayable),
          grossProfit: roundMoney(grossProfit),
          commissionRate: grossProfit > 0 ? commissionAmount / grossProfit : 0,
          accruedCommission: roundMoney(commissionAmount),
          supervisorAdjustmentAmount: 0,
          finalCommission: roundMoney(commissionAmount),
          abnormalNote: `high risk tickets pending review: ${highRiskCount}`,
          status: "pending employee signature"
        },
        details: detailRows,
        chargeLines,
        statement: "The employee confirms the order count, gross profit, commission rate, adjustment and final commission.",
        signatureTrace: {
          employeeSignature: "pending employee signature",
          signedAt: null,
          confirmIp: "system captured",
          deviceInfo: "system captured",
          supervisorConfirm: "pending supervisor confirmation"
        }
      };

      const document = await writeConfirmationDocument({
        month: selectedMonth,
        documentType: "logistics_commission",
        ownerName,
        businessType: "logistics",
        orderCount: items.length,
        grossProfit,
        commissionAmount,
        payloadJson: JSON.stringify(payload)
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
    for (const [index, item] of records.entries()) {
      const activeBatch = await latestActiveImportBatch(selectedMonth);
      const ownerName = item.financeOrder.orderNo;
      const commissionAmount = item.supervisorFinalCommission ?? item.suggestedCommissionMin ?? 0;
      const chargeLines = await chargeLineSnapshot(selectedMonth, [item.financeOrder.orderNo]);
      const payload = {
        title: "Service Commission Confirmation",
        fileType: "service_commission_confirmation",
        documentCode: documentCode(selectedMonth, index, "service_commission"),
        sourceFileName: activeBatch?.fileName ?? "-",
        importBatchNo: activeBatch?.batchNo ?? "-",
        snapshotCreatedAt: new Date().toISOString(),
        monthLabel: formatMonthLabel(selectedMonth),
        generatedAt: new Date().toISOString(),
        summary: {
          ownerName,
          businessType: item.serviceType,
          orderCount: 1,
          receivable: roundMoney(item.financeOrder.adjustedReceivable),
          payable: roundMoney(item.financeOrder.adjustedPayable),
          grossProfit: roundMoney(item.grossProfit ?? 0),
          commissionRate: item.grossProfit ? commissionAmount / item.grossProfit : null,
          finalCommission: roundMoney(commissionAmount),
          status: "pending supervisor confirmation"
        },
        details: [{
          orderNo: item.financeOrder.orderNo,
          originalOrderNo: item.financeOrder.customerOrderNo,
          customerName: item.financeOrder.customerName,
          businessType: item.serviceType,
          receivable: roundMoney(item.financeOrder.adjustedReceivable),
          payable: roundMoney(item.financeOrder.adjustedPayable),
          grossProfit: roundMoney(item.grossProfit ?? 0),
          commissionRate: item.grossProfit ? commissionAmount / item.grossProfit : null,
          commissionAmount: roundMoney(commissionAmount),
          source: "raw ledger"
        }],
        chargeLines
      };

      const document = await writeConfirmationDocument({
        month: selectedMonth,
        documentType: "service_commission",
        ownerName,
        businessType: item.serviceType,
        orderCount: 1,
        grossProfit: item.grossProfit ?? 0,
        commissionAmount,
        payloadJson: JSON.stringify(payload)
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

  async generateOperatorDocuments(month?: string) {
    const selectedMonth = monthOrDefault(month);
    const groups = await analyticsService.operatorPerformance(selectedMonth);
    const documents = [];

    for (const [index, group] of groups.entries()) {
      const activeBatch = await latestActiveImportBatch(selectedMonth);
      const payload = {
        title: "Operator Performance Signature Confirmation",
        fileType: "operator_performance_confirmation",
        documentCode: documentCode(selectedMonth, index, "operator_performance"),
        sourceFileName: activeBatch?.fileName ?? "-",
        importBatchNo: activeBatch?.batchNo ?? "-",
        snapshotCreatedAt: new Date().toISOString(),
        monthLabel: formatMonthLabel(selectedMonth),
        generatedAt: new Date().toISOString(),
        summary: {
          ownerName: group.operatorName,
          businessType: "operator_performance",
          orderCount: group.rows.reduce((sum, row) => sum + row.orderCount, 0),
          receivable: 0,
          payable: 0,
          grossProfit: group.totalCommission,
          commissionRate: null,
          accruedCommission: roundMoney(group.totalCommission),
          supervisorAdjustmentAmount: roundMoney(group.totalCommission - group.payablePerformance),
          finalCommission: roundMoney(group.payablePerformance),
          abnormalNote: "operator performance amount equals category commission total after 80% salary payout rule",
          status: "pending operator signature"
        },
        details: group.rows.map((row) => ({
          orderNo: row.orderType,
          originalOrderNo: "-",
          customerName: group.operatorName,
          businessType: "operator_performance",
          receivable: row.orderCount,
          payable: row.baseCount,
          grossProfit: row.commissionAmount,
          grossProfitRate: null,
          commissionRate: row.rate,
          commissionAmount: roundMoney(row.commissionAmount),
          source: row.note
        })),
        statement: "The operator confirms the performance categories, order count, base count, payable count, rate and final payable performance amount.",
        signatureTrace: {
          employeeSignature: "pending operator signature",
          signedAt: null,
          confirmIp: "system captured",
          deviceInfo: "system captured",
          supervisorConfirm: "pending supervisor confirmation"
        }
      };

      const document = await writeConfirmationDocument({
        month: selectedMonth,
        documentType: "operator_performance",
        ownerName: group.operatorName,
        businessType: "operator_performance",
        orderCount: payload.summary.orderCount,
        grossProfit: group.totalCommission,
        commissionAmount: group.payablePerformance,
        payloadJson: JSON.stringify(payload)
      });
      documents.push(document);
    }

    await logAction({
      month: selectedMonth,
      entityType: "confirmation_document",
      entityId: "operator_performance",
      action: "batch_generate",
      payload: { count: documents.length }
    });
    return documents;
  },

  async sendSignatureLink(id: number) {
    const current = await prisma.confirmationDocument.findUniqueOrThrow({ where: { id } });
    if (current.documentStatus === "voided") {
      throw new Error("Voided documents cannot be sent. Generate a new version first.");
    }
    if (current.supervisorStatus === "confirmed") {
      throw new Error("Confirmed documents cannot be overwritten. Void and regenerate a new version first.");
    }

    const signatureToken = token(String(id), "signature");
    const signatureUrl = `/signature/${signatureToken}`;
    const expiresAt = tokenExpiresAt();
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
            employeeSignature: "signature link sent",
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
    if (current.documentStatus === "voided") {
      throw new Error("Document is voided. Ask supervisor to resend a new version.");
    }
    if (!current.signatureTokenExpiresAt || current.signatureTokenExpiresAt < new Date()) {
      throw new Error("Signature link has expired. Ask supervisor to resend it.");
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
        signatureToken: null,
        signatureUrl: null,
        signatureTokenExpiresAt: null,
        payloadJson: updatePayloadJson(current.payloadJson, (payload) => ({
          ...payload,
          summary: { ...(payload.summary ?? {}), status: "signed by employee, pending supervisor confirmation" },
          signatureTrace: {
            ...(payload.signatureTrace ?? {}),
            employeeSignature: "signed",
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

  async supervisorConfirm(id: number, evidence: SignatureEvidenceInput = {}, adjustReason?: string) {
    const current = await prisma.confirmationDocument.findUniqueOrThrow({ where: { id } });
    if (current.documentStatus === "voided") {
      throw new Error("Voided documents cannot be confirmed.");
    }
    const confirmedAt = new Date();
    const proof = signatureEvidence({ ...evidence, action: "supervisor_confirm" });
    const evidenceJson = {
      employee: safeJson<Record<string, unknown> | null>(current.signatureEvidenceJson, null),
      supervisor: proof
    };
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
        signatureEvidenceJson: JSON.stringify(evidenceJson),
        adjustReason: adjustReason?.trim() || current.adjustReason,
        payloadJson: updatePayloadJson(current.payloadJson, (payload) => ({
          ...payload,
          summary: { ...(payload.summary ?? {}), status: "employee signed and supervisor confirmed" },
          signatureTrace: {
            ...(payload.signatureTrace ?? {}),
            employeeSignature: "signed",
            signedAt: (current.signedAt ?? confirmedAt).toISOString(),
            supervisorConfirm: "confirmed",
            supervisorIp: proof.ip,
            supervisorDeviceInfo: proof.userAgent,
            supervisorRole: proof.role
          }
        }))
      }
    });
    await logAction({ month: document.month, entityType: "confirmation_document", entityId: id, action: "supervisor_confirm", payload: { proof, adjustReason } });
    return document;
  },

  async voidDocument(id: number, voidReason?: string) {
    const reason = requireReason(voidReason, "Void reason is required.");
    const current = await prisma.confirmationDocument.findUniqueOrThrow({ where: { id } });
    const document = await prisma.confirmationDocument.update({
      where: { id },
      data: {
        documentStatus: "voided",
        signatureStatus: "pending",
        supervisorStatus: "pending",
        signatureToken: null,
        signatureUrl: null,
        signatureTokenExpiresAt: null,
        voidReason: reason,
        voidedAt: new Date(),
        payloadJson: updatePayloadJson(current.payloadJson, (payload) => ({
          ...payload,
          summary: { ...(payload.summary ?? {}), status: "voided, regenerate required" },
          signatureTrace: {
            ...(payload.signatureTrace ?? {}),
            employeeSignature: "voided",
            signedAt: null,
            supervisorConfirm: "pending new version",
            voidReason: reason
          }
        }))
      }
    });
    await logAction({ month: document.month, entityType: "confirmation_document", entityId: id, action: "void_for_resign", payload: { voidReason: reason } });
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
    const payload = safeJson<Record<string, unknown>>(job.payloadJson, {});
    const title = `${job.month} ${job.exportType}`;

    if (job.fileFormat === "png") {
      return {
        fileName: job.fileName,
        contentType: "image/png",
        buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lF7G0wAAAABJRU5ErkJggg==", "base64")
      };
    }

    if (job.fileFormat === "pdf") {
      const text = `${title}\n${JSON.stringify(payload, null, 2)}`.replace(/[^\x20-\x7E\n]/g, "");
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
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "export");
    return {
      fileName: job.fileName,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
    };
  },

  async downloadConfirmationDocument(id: number, format: "xlsx" | "pdf" | "png" = "xlsx") {
    const document = await prisma.confirmationDocument.findUniqueOrThrow({ where: { id } });
    const { summaryRows, detailRows, evidenceRows, chargeLineRows } = confirmationRows(document);

    if (format === "pdf") {
      const buffer = await pdfBuffer(document);
      await logAction({
        month: document.month,
        entityType: "confirmation_document",
        entityId: document.id,
        action: "download_confirmation_pdf",
        payload: { ownerName: document.ownerName, documentType: document.documentType, version: document.version }
      });
      return {
        fileName: `${document.month}-${document.ownerName}-v${document.version}-confirmation.pdf`,
        contentType: "application/pdf",
        buffer
      };
    }

    if (format === "png") {
      const buffer = await pngBuffer(document);
      await logAction({
        month: document.month,
        entityType: "confirmation_document",
        entityId: document.id,
        action: "download_confirmation_png",
        payload: { ownerName: document.ownerName, documentType: document.documentType, version: document.version }
      });
      return {
        fileName: `${document.month}-${document.ownerName}-v${document.version}-confirmation.png`,
        contentType: "image/png",
        buffer
      };
    }

    const workbook = XLSX.utils.book_new();

    appendSheet(workbook, summaryRows, "summary");
    appendSheet(workbook, detailRows, "details");
    appendSheet(workbook, chargeLineRows, "charge_lines");
    appendSheet(workbook, evidenceRows, "signature_evidence");

    await logAction({
      month: document.month,
      entityType: "confirmation_document",
      entityId: document.id,
      action: "download_confirmation_xlsx",
      payload: { ownerName: document.ownerName, documentType: document.documentType, version: document.version }
    });

    return {
      fileName: `${document.month}-${document.ownerName}-v${document.version}-confirmation.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
    };
  },

  async exportSystemBackup(month?: string) {
    const selectedMonth = month || undefined;
    const workbook = XLSX.utils.book_new();
    const [summaries, monthCloses, importBatches, templates, rules, documents, actionLogs, exportJobs] = await Promise.all([
      prisma.financeSummary.findMany({
        where: selectedMonth ? { month: selectedMonth } : undefined,
        orderBy: { month: "desc" }
      }),
      prisma.monthClose.findMany({
        where: selectedMonth ? { month: selectedMonth } : undefined,
        orderBy: { month: "desc" }
      }),
      prisma.importBatch.findMany({
        where: selectedMonth ? { month: selectedMonth } : undefined,
        orderBy: { id: "desc" }
      }),
      prisma.excelImportTemplate.findMany({ orderBy: { id: "asc" } }),
      prisma.parameterRule.findMany({ orderBy: [{ ruleGroup: "asc" }, { id: "asc" }] }),
      prisma.confirmationDocument.findMany({
        where: selectedMonth ? { month: selectedMonth } : undefined,
        orderBy: [{ month: "desc" }, { id: "asc" }]
      }),
      prisma.actionLog.findMany({
        where: selectedMonth ? { month: selectedMonth } : undefined,
        orderBy: { id: "desc" },
        take: 1000
      }),
      prisma.exportJob.findMany({
        where: selectedMonth ? { month: selectedMonth } : undefined,
        orderBy: { id: "desc" },
        take: 500
      })
    ]);

    appendSheet(workbook, [
      { item: "scope", value: selectedMonth ?? "all months" },
      { item: "generatedAt", value: new Date().toISOString() },
      { item: "summaryCount", value: summaries.length },
      { item: "importBatchCount", value: importBatches.length },
      { item: "templateCount", value: templates.length },
      { item: "ruleCount", value: rules.length },
      { item: "confirmationDocumentCount", value: documents.length },
      { item: "actionLogCount", value: actionLogs.length }
    ], "backup_readme");

    appendSheet(workbook, summaries.map((item) => ({
      month: item.month,
      totalReceivable: money(item.totalReceivable),
      totalPayable: money(item.totalPayable),
      totalReceived: money(item.totalReceived),
      totalPaid: money(item.totalPaid),
      totalGrossProfit: money(item.totalGrossProfit),
      grossProfitRate: typeof item.grossProfitRate === "number" ? `${(item.grossProfitRate * 100).toFixed(2)}%` : "-",
      totalCommission: money(item.totalCommission),
      riskOrderCount: item.riskOrderCount,
      abnormalHighProfitOrderCount: item.abnormalHighProfitOrderCount,
      pendingSupervisorConfirmCount: item.pendingSupervisorConfirmCount,
      updatedAt: item.updatedAt.toISOString()
    })), "finance_summaries");

    appendSheet(workbook, importBatches.map((item) => ({
      batchNo: item.batchNo,
      month: item.month,
      fileName: item.fileName,
      sheetName: item.sheetName,
      importMode: item.importMode,
      status: item.status,
      importedRows: item.importedRows,
      importedOrders: item.importedOrders,
      logisticsOrders: item.logisticsOrders,
      serviceOrders: item.serviceOrders,
      totalReceivable: money(item.totalReceivable),
      totalPayable: money(item.totalPayable),
      totalGrossProfit: money(item.totalGrossProfit),
      riskOrderCount: item.riskOrderCount,
      abnormalHighProfitCount: item.abnormalHighProfitCount,
      createdAt: item.createdAt.toISOString(),
      revertedAt: item.revertedAt?.toISOString() ?? "-"
    })), "import_batches");

    appendSheet(workbook, templates.map((item) => ({
      templateKey: item.templateKey,
      fileName: item.fileName,
      sheetName: item.sheetName,
      headerRowIndex: item.headerRowIndex,
      headersJson: item.headersJson,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    })), "excel_templates");

    appendSheet(workbook, rules.map((item) => ({
      ruleKey: item.ruleKey,
      ruleGroup: item.ruleGroup,
      label: item.label,
      valueJson: item.valueJson,
      description: item.description,
      isActive: item.isActive,
      updatedBy: item.updatedBy,
      updatedAt: item.updatedAt.toISOString()
    })), "parameter_rules");

    appendSheet(workbook, monthCloses.map((item) => ({
      month: item.month,
      status: item.status,
      lockedBy: item.lockedBy,
      lockedAt: item.lockedAt?.toISOString() ?? "-",
      unlockedBy: item.unlockedBy,
      unlockedAt: item.unlockedAt?.toISOString() ?? "-",
      closeNote: item.closeNote,
      updatedAt: item.updatedAt.toISOString()
    })), "month_closes");

    appendSheet(workbook, documents.map((item) => ({
      month: item.month,
      documentType: item.documentType,
      ownerName: item.ownerName,
      version: item.version,
      businessType: item.businessType,
      orderCount: item.orderCount,
      grossProfit: money(item.grossProfit),
      commissionAmount: money(item.commissionAmount),
      adjustReason: item.adjustReason ?? "-",
      voidReason: item.voidReason ?? "-",
      documentStatus: item.documentStatus,
      sendStatus: item.sendStatus,
      signatureStatus: item.signatureStatus,
      supervisorStatus: item.supervisorStatus,
      signedAt: item.signedAt?.toISOString() ?? "-",
      confirmedAt: item.confirmedAt?.toISOString() ?? "-",
      signatureEvidenceJson: item.signatureEvidenceJson ?? "-"
    })), "confirmation_docs");

    appendSheet(workbook, actionLogs.map((item) => ({
      id: item.id,
      month: item.month,
      entityType: item.entityType,
      entityId: item.entityId,
      action: item.action,
      operator: item.operator,
      payloadJson: item.payloadJson,
      createdAt: item.createdAt.toISOString()
    })), "action_logs");

    appendSheet(workbook, exportJobs.map((item) => ({
      month: item.month,
      exportType: item.exportType,
      fileFormat: item.fileFormat,
      status: item.status,
      fileName: item.fileName,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    })), "export_jobs");

    return {
      fileName: `${selectedMonth ?? "all"}-system-backup.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
    };
  },

  async markRiskReviewed(id: number) {
    const risk = await prisma.riskRecord.update({
      where: { id },
      data: { status: "reviewed", reviewedAt: new Date(), reviewConclusion: "reviewed" },
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

  async confirmSalespersonCommission(month = "2026-06", salespersonName: string, manualRate?: number, adjustReason?: string) {
    const reason = manualRate !== undefined
      ? requireReason(adjustReason, "Adjust reason is required when changing commission rate.")
      : undefined;
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
            manualCommissionAmount: roundMoney(record.grossProfit * manualRate),
            adjustReason: reason
          } : {})
        }
      }));
    }
    await logAction({
      month,
      entityType: "commission_record",
      entityId: salespersonName,
      action: manualRate !== undefined ? "adjust_and_confirm_commission" : "confirm_commission",
      payload: { count: updates.length, manualRate, adjustReason: reason }
    });
    return { salespersonName, rows: updates };
  },

  async actionLogs(input: { month?: string; entityType?: string; entityId?: string; action?: string; operator?: string } = {}) {
    return prisma.actionLog.findMany({
      where: {
        ...(input.month ? { month: input.month } : {}),
        ...(input.entityType ? { entityType: input.entityType } : {}),
        ...(input.entityId ? { entityId: input.entityId } : {}),
        ...(input.action ? { action: { contains: input.action } } : {}),
        ...(input.operator ? { operator: { contains: input.operator } } : {})
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
    const status = await this.monthStatus(selectedMonth);
    if (!status.readyToClose) {
      throw new Error(`Month close blocked: ${status.blockers.join("; ") || "Excel import not completed"}`);
    }
    const operator = input.operator || "supervisor";
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
    const operator = input.operator || "supervisor";
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
