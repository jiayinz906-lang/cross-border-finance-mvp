import * as XLSX from "xlsx";
import crypto from "node:crypto";
import fs from "node:fs";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { prisma } from "../prisma/client.js";
import { analyticsService } from "./analytics.service.js";
import { env } from "../config/env.js";

type DocumentType = "logistics_commission" | "service_commission" | "operator_performance" | "sales_salary" | "customer_service_salary";

type SignatureEvidenceInput = {
  ip?: string;
  userAgent?: string;
  role?: string;
  action?: string;
  signedName?: string;
  acceptedStatement?: boolean;
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
  const prefix = documentType === "service_commission"
    ? "SC"
    : documentType === "operator_performance"
      ? "OP"
      : documentType === "sales_salary"
        ? "SS"
        : documentType === "customer_service_salary"
          ? "CS"
          : "LC";
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

function confirmationFontPath() {
  const configured = process.env.CONFIRMATION_FONT_PATH;
  if (configured && fs.existsSync(configured)) return configured;
  const localWindowsFont = "C:\\Windows\\Fonts\\simhei.ttf";
  if (fs.existsSync(localWindowsFont)) return localWindowsFont;
  const bundledFont = "/usr/share/fonts/truetype/xjd/SimHei.ttf";
  return fs.existsSync(bundledFont) ? bundledFont : null;
}

type NotificationChannel = "dingtalk_direct" | "dingtalk_webhook" | "wecom_webhook";
type SignatureNotificationDocument = { month: string; ownerName: string; commissionAmount: number; signatureUrl: string | null };

let dingtalkAccessTokenCache: { token: string; expiresAt: number } | null = null;

function notificationContent(document: SignatureNotificationDocument) {
  const externalUrl = `${env.publicAppUrl}#${document.signatureUrl}`;
  return {
    externalUrl,
    markdown: [
      "# XJD Finance 个人确认单",
      `> 月份：${document.month}`,
      `> 确认人：${document.ownerName}`,
      `> 确认金额：¥${money(document.commissionAmount).toFixed(2)}`,
      "",
      `[打开确认单并电子签名](${externalUrl})`
    ].join("\n")
  };
}

function dingtalkWebhookUrl() {
  if (!env.dingtalkWebhookUrl || !env.dingtalkWebhookSecret) return env.dingtalkWebhookUrl;
  const timestamp = Date.now().toString();
  const sign = crypto.createHmac("sha256", env.dingtalkWebhookSecret).update(`${timestamp}\n${env.dingtalkWebhookSecret}`).digest("base64");
  const url = new URL(env.dingtalkWebhookUrl);
  url.searchParams.set("timestamp", timestamp);
  url.searchParams.set("sign", sign);
  return url.toString();
}

async function sendDingtalkNotification(document: SignatureNotificationDocument) {
  const webhookUrl = dingtalkWebhookUrl();
  if (!webhookUrl || !document.signatureUrl) return null;
  const content = notificationContent(document);
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      msgtype: "link",
      link: { title: "XJD Finance 个人确认单", text: `${document.month} ${document.ownerName}，请打开确认单完成电子签名。`, messageUrl: content.externalUrl, picUrl: "" }
    })
  });
  const receipt = await response.json().catch(() => ({ httpStatus: response.status }));
  if (!response.ok || (typeof receipt?.errcode === "number" && receipt.errcode !== 0)) {
    throw new Error(receipt?.errmsg || `钉钉通知发送失败（HTTP ${response.status}）`);
  }
  return receipt;
}

async function sendWecomNotification(document: SignatureNotificationDocument) {
  if (!env.wecomWebhookUrl || !document.signatureUrl) return null;
  const content = notificationContent(document);
  const response = await fetch(env.wecomWebhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ msgtype: "markdown", markdown: { content: content.markdown } })
  });
  const receipt = await response.json().catch(() => ({ httpStatus: response.status }));
  if (!response.ok || (typeof receipt?.errcode === "number" && receipt.errcode !== 0)) {
    throw new Error(receipt?.errmsg || `企业微信通知发送失败（HTTP ${response.status}）`);
  }
  return receipt;
}

async function getDingtalkAccessToken() {
  if (!env.dingtalkAppKey || !env.dingtalkAppSecret) throw new Error("钉钉企业应用凭据未配置。");
  if (dingtalkAccessTokenCache && dingtalkAccessTokenCache.expiresAt > Date.now() + 60_000) return dingtalkAccessTokenCache.token;
  const response = await fetch("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appKey: env.dingtalkAppKey, appSecret: env.dingtalkAppSecret })
  });
  const payload = await response.json().catch(() => ({})) as { accessToken?: string; expireIn?: number; message?: string; code?: string };
  if (!response.ok || !payload.accessToken) throw new Error(payload.message || payload.code || `钉钉应用 Token 获取失败（HTTP ${response.status}）`);
  dingtalkAccessTokenCache = { token: payload.accessToken, expiresAt: Date.now() + Math.max((payload.expireIn ?? 7200) - 120, 60) * 1000 };
  return payload.accessToken;
}

async function sendDingtalkDirectNotification(document: SignatureNotificationDocument, dingtalkUserId: string) {
  if (!document.signatureUrl) return null;
  const accessToken = await getDingtalkAccessToken();
  const content = notificationContent(document);
  const response = await fetch("https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend", {
    method: "POST",
    headers: { "content-type": "application/json", "x-acs-dingtalk-access-token": accessToken },
    body: JSON.stringify({
      robotCode: env.dingtalkRobotCode || env.dingtalkAppKey,
      userIds: [dingtalkUserId],
      msgKey: "sampleLink",
      msgParam: JSON.stringify({ title: "XJD Finance 个人确认单", text: `${document.month} ${document.ownerName}，请打开确认单完成电子签名。`, messageUrl: content.externalUrl, picUrl: "" })
    })
  });
  const receipt = await response.json().catch(() => ({ httpStatus: response.status }));
  if (!response.ok || (typeof receipt?.code === "string" && receipt.code !== "0") || (typeof receipt?.errcode === "number" && receipt.errcode !== 0)) {
    throw new Error(receipt?.message || receipt?.errmsg || receipt?.code || `钉钉单聊发送失败（HTTP ${response.status}）`);
  }
  return receipt;
}

async function configuredNotificationChannel(document: SignatureNotificationDocument): Promise<{ channel: NotificationChannel; dingtalkUserId?: string } | null> {
  if (env.dingtalkAppKey && env.dingtalkAppSecret) {
    const user = await prisma.appUser.findFirst({
      where: { dingtalkUserId: { not: null }, OR: [{ displayName: document.ownerName }, { username: document.ownerName }] },
      select: { dingtalkUserId: true }
    });
    if (user?.dingtalkUserId) return { channel: "dingtalk_direct", dingtalkUserId: user.dingtalkUserId };
  }
  if (env.dingtalkWebhookUrl) return { channel: "dingtalk_webhook" };
  if (env.wecomWebhookUrl) return { channel: "wecom_webhook" };
  return null;
}

async function sendNotification(target: { channel: NotificationChannel; dingtalkUserId?: string }, document: SignatureNotificationDocument) {
  if (target.channel === "dingtalk_direct") return sendDingtalkDirectNotification(document, target.dingtalkUserId!);
  return target.channel === "dingtalk_webhook" ? sendDingtalkNotification(document) : sendWecomNotification(document);
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
    { item: "payoutNote", value: summary.payoutNote ?? "-" },
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
    salaryComponent: item.salaryComponent ?? "-",
    performanceCategory: item.performanceCategory ?? "-",
    rawOrderCount: item.rawOrderCount ?? "-",
    baseCount: item.baseCount ?? "-",
    commissionOrderCount: item.commissionOrderCount ?? "-",
    performanceRule: item.bracketLabel ?? (item.performanceRateUnit ? `${item.performanceRate ?? 0}${item.performanceRateUnit}` : "-"),
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
  const { payload, summaryRows, detailRows, evidenceRows, chargeLineRows } = confirmationRows(document);
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const fontPath = confirmationFontPath();
  if (fontPath) doc.font(fontPath);

  const writeLine = (value: string, fontSize = 9) => {
    const pageBottom = doc.page.height - doc.page.margins.bottom - 12;
    if (doc.y + fontSize * 2 > pageBottom) doc.addPage();
    doc.fontSize(fontSize).text(value, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
  };
  const writeSection = (title: string) => {
    const pageBottom = doc.page.height - doc.page.margins.bottom - 30;
    if (doc.y + 32 > pageBottom) doc.addPage();
    doc.moveDown(0.6);
    doc.fontSize(12).text(title, { underline: true });
  };

  doc.fontSize(16).text(textValue(payload.title ?? "Commission Confirmation"), { align: "center" });
  doc.moveDown(0.5);
  writeLine(`Owner: ${document.ownerName}    Month: ${document.month}    Version: ${document.version}`, 10);
  writeLine(`Type: ${document.documentType}    Snapshot: ${payload.snapshotCreatedAt ?? "-"}`, 10);
  writeSection("Summary");
  for (const row of summaryRows) writeLine(`${row.item}: ${textValue(row.value)}`);
  writeSection(`Order / performance details (${detailRows.length})`);
  for (const row of detailRows) {
    writeLine(`${row.performanceCategory ?? "-"} | Excel tickets ${row.rawOrderCount ?? "-"} | Base ${row.baseCount ?? "-"} | Payable tickets ${row.commissionOrderCount ?? "-"} | ${row.performanceRule ?? "-"} | ${row.systemOrderNo ?? "-"} | ${row.originalOrderNo ?? "-"} | ${row.customerName ?? "-"} | ${row.businessType ?? "-"} | Gross profit ${row.grossProfit} | Rate ${row.commissionRate} | Amount ${row.commissionAmount}`, 8);
  }
  writeSection(`Charge line traceability (${chargeLineRows.length})`);
  for (const row of chargeLineRows) {
    writeLine(`${row.excelRow ?? "-"} | ${row.systemOrderNo ?? "-"} | ${row.originalOrderNo ?? "-"} | ${row.direction ?? "-"} | ${row.feeType ?? "-"} | ${row.supplierName ?? "-"} | Original ${row.originalAmount} | Local ${row.localAmount} | Signed ${row.signedAmount}`, 8);
  }
  writeSection("Signature evidence");
  for (const row of evidenceRows) writeLine(`${row.item}: ${textValue(row.value)}`);
  doc.end();
  return done;
}

async function pngBuffer(document: { ownerName: string; month: string; version: number; documentType: string; payloadJson: string | null } & any) {
  const { payload, summaryRows, detailRows, evidenceRows, chargeLineRows } = confirmationRows(document);
  const width = 1400;
  const rowHeight = 34;
  const summaryStart = 184;
  const detailsHeadingY = summaryStart + summaryRows.length * 24 + 38;
  const detailsStart = detailsHeadingY + 52;
  const chargesHeadingY = detailsStart + detailRows.length * rowHeight + 34;
  const chargesStart = chargesHeadingY + 52;
  const evidenceHeadingY = chargesStart + chargeLineRows.length * rowHeight + 34;
  const evidenceStart = evidenceHeadingY + 32;
  const height = Math.max(760, evidenceStart + evidenceRows.length * 26 + 70);
  const isOperatorSalary = document.documentType === "customer_service_salary" || payload.summary?.businessType === "operator_salary";
  const detailSvg = detailRows.map((row, index) => {
    const y = detailsStart + index * rowHeight;
    if (isOperatorSalary) {
      return `<text x="72" y="${y}" class="small">${xmlEscape(row.performanceCategory)}</text>
<text x="330" y="${y}" class="small">${xmlEscape(row.rawOrderCount)}</text>
<text x="500" y="${y}" class="small">${xmlEscape(row.baseCount)}</text>
<text x="670" y="${y}" class="small">${xmlEscape(row.commissionOrderCount)}</text>
<text x="840" y="${y}" class="small">${xmlEscape(row.performanceRule)}</text>
<text x="1120" y="${y}" class="small">${xmlEscape(row.commissionAmount)}</text>
<line x1="60" y1="${y + 12}" x2="1340" y2="${y + 12}" stroke="#e6edf7"/>`;
    }
    return `<text x="72" y="${y}" class="small">${xmlEscape(row.systemOrderNo)}</text>
<text x="260" y="${y}" class="small">${xmlEscape(row.originalOrderNo)}</text>
<text x="430" y="${y}" class="small">${xmlEscape(row.businessType)}</text>
<text x="650" y="${y}" class="small">${xmlEscape(row.salaryComponent)}</text>
<text x="850" y="${y}" class="small">${xmlEscape(row.grossProfit)}</text>
<text x="1010" y="${y}" class="small">${xmlEscape(row.commissionRate)}</text>
<text x="1170" y="${y}" class="small">${xmlEscape(row.commissionAmount)}</text>
<line x1="60" y1="${y + 12}" x2="1340" y2="${y + 12}" stroke="#e6edf7"/>`;
  }).join("");
  const summarySvg = summaryRows.map((row, index) => {
    const y = summaryStart + index * 24;
    return `<text x="72" y="${y}" class="label">${xmlEscape(row.item)}</text><text x="300" y="${y}" class="text">${xmlEscape(row.value)}</text>`;
  }).join("");
  const chargeSvg = chargeLineRows.map((row, index) => {
    const y = chargesStart + index * rowHeight;
    return `<text x="72" y="${y}" class="small">${xmlEscape(row.excelRow)}</text>
<text x="150" y="${y}" class="small">${xmlEscape(row.systemOrderNo)}</text>
<text x="350" y="${y}" class="small">${xmlEscape(row.direction)}</text>
<text x="470" y="${y}" class="small">${xmlEscape(row.feeType)}</text>
<text x="650" y="${y}" class="small">${xmlEscape(row.supplierName)}</text>
<text x="900" y="${y}" class="small">${xmlEscape(row.originalAmount)}</text>
<text x="1080" y="${y}" class="small">${xmlEscape(row.localAmount)}</text>
<text x="1220" y="${y}" class="small">${xmlEscape(row.signedAmount)}</text>
<line x1="60" y1="${y + 12}" x2="1340" y2="${y + 12}" stroke="#e6edf7"/>`;
  }).join("");
  const evidenceSvg = evidenceRows.map((row, index) => {
    const y = evidenceStart + index * 24;
    return `<text x="72" y="${y}" class="label">${xmlEscape(row.item)}</text><text x="300" y="${y}" class="text">${xmlEscape(textValue(row.value))}</text>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<style>
.title{font:700 30px "SimHei",Arial,sans-serif;fill:#071737}
.sub{font:600 18px "SimHei",Arial,sans-serif;fill:#52627d}
.section{font:700 22px "SimHei",Arial,sans-serif;fill:#071737}
.label{font:700 15px "SimHei",Arial,sans-serif;fill:#71809c}
.text{font:700 15px "SimHei",Arial,sans-serif;fill:#071737}
.small{font:700 15px "SimHei",Arial,sans-serif;fill:#13213c}
</style>
<rect width="100%" height="100%" fill="#f4f7fb"/>
<rect x="40" y="40" width="1320" height="${height - 80}" rx="14" fill="#fff" stroke="#dbe5f2"/>
<text x="70" y="94" class="title">${xmlEscape(payload.title ?? "Commission Confirmation")}</text>
<text x="70" y="126" class="sub">Owner: ${xmlEscape(document.ownerName)}   Month: ${xmlEscape(document.month)}   Version: ${document.version}   Source: imported Excel ledger</text>
<text x="70" y="160" class="section">Summary</text>
${summarySvg}
<text x="70" y="${detailsHeadingY}" class="section">${isOperatorSalary ? "Performance Details" : "Commission Details"}</text>
${isOperatorSalary ? `<text x="72" y="${detailsHeadingY + 28}" class="label">Performance category</text><text x="330" y="${detailsHeadingY + 28}" class="label">Excel tickets</text><text x="500" y="${detailsHeadingY + 28}" class="label">Base</text><text x="670" y="${detailsHeadingY + 28}" class="label">Payable tickets</text><text x="840" y="${detailsHeadingY + 28}" class="label">Rule</text><text x="1120" y="${detailsHeadingY + 28}" class="label">Amount</text>` : `<text x="72" y="${detailsHeadingY + 28}" class="label">System No</text><text x="260" y="${detailsHeadingY + 28}" class="label">Original No</text><text x="430" y="${detailsHeadingY + 28}" class="label">Business type</text><text x="650" y="${detailsHeadingY + 28}" class="label">Component</text><text x="850" y="${detailsHeadingY + 28}" class="label">Gross profit</text><text x="1010" y="${detailsHeadingY + 28}" class="label">Rate</text><text x="1170" y="${detailsHeadingY + 28}" class="label">Commission</text>`}
${detailSvg}
<text x="70" y="${chargesHeadingY}" class="section">Charge Line Traceability</text>
<text x="72" y="${chargesHeadingY + 28}" class="label">Excel row</text><text x="150" y="${chargesHeadingY + 28}" class="label">System No</text><text x="350" y="${chargesHeadingY + 28}" class="label">Direction</text><text x="470" y="${chargesHeadingY + 28}" class="label">Fee type</text><text x="650" y="${chargesHeadingY + 28}" class="label">Supplier</text><text x="900" y="${chargesHeadingY + 28}" class="label">Original</text><text x="1080" y="${chargesHeadingY + 28}" class="label">Local</text><text x="1220" y="${chargesHeadingY + 28}" class="label">Signed</text>
${chargeSvg}
<text x="70" y="${evidenceHeadingY}" class="section">Signature Evidence</text>
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
  // A generated confirmation is an auditable snapshot. Re-generating must not
  // erase a link, signature, or evidence. Create a new version only after void.
  if (latest && latest.documentStatus !== "voided") {
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

  return latest;
}

export const workflowService = {
  async listDocuments(month?: string, documentType?: DocumentType, includeHistory = false) {
    const documents = await prisma.confirmationDocument.findMany({
      where: {
        month: monthOrDefault(month),
        ...(documentType ? { documentType } : {}),
        ...(includeHistory ? {} : { documentStatus: { not: "voided" } })
      },
      orderBy: [{ documentType: "asc" }, { ownerName: "asc" }, { version: "desc" }, { id: "desc" }]
    });
    if (includeHistory) return documents;

    const current = new Map<string, typeof documents[number]>();
    for (const document of documents) {
      const key = `${document.documentType}:${document.ownerName}`;
      if (!current.has(key)) current.set(key, document);
    }
    return Array.from(current.values()).sort((left, right) => {
      const byType = left.documentType.localeCompare(right.documentType);
      return byType || left.ownerName.localeCompare(right.ownerName, "zh-Hans-CN");
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
    const performance = await analyticsService.operatorPerformanceWithSettings(selectedMonth);
    const groups = performance.rows;
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
          supervisorAdjustmentAmount: 0,
          finalCommission: roundMoney(group.payablePerformance),
          abnormalNote: "operator performance amount equals the full category performance total; no payout discount is applied",
          payoutNote: performance.payoutNote,
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
          commissionRate: row.rateUnit === "%" ? row.rate / 100 : null,
          commissionAmount: roundMoney(row.commissionAmount),
          source: `${row.note}；绩效规则值：${row.rate}${row.rateUnit}`
        })),
        statement: `The operator confirms the performance categories, Excel-derived order count, rule-derived base count, payable count, rate and final performance amount. Payout note: ${performance.payoutNote}`,
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

  async generateSalaryDocuments(month?: string) {
    const selectedMonth = monthOrDefault(month);
    const [commissions, confirmedServiceRecords, performance, activeBatch] = await Promise.all([
      prisma.commissionRecord.findMany({
        where: { financeOrder: { month: selectedMonth } },
        include: { financeOrder: true }
      }),
      prisma.serviceBusinessRecord.findMany({
        where: { confirmStatus: "confirmed", financeOrder: { month: selectedMonth } },
        include: { financeOrder: true }
      }),
      analyticsService.operatorPerformanceWithSettings(selectedMonth),
      latestActiveImportBatch(selectedMonth)
    ]);
    const documents = [];
    const salesItems = [
      ...commissions.map((item) => ({
        sourceType: "logistics" as const,
        ownerName: item.salespersonName,
        financeOrder: item.financeOrder,
        businessType: item.businessType,
        grossProfit: item.grossProfit,
        commissionRate: item.commissionRate,
        commissionAmount: item.manualCommissionAmount ?? item.commissionAmount,
        source: "Imported Excel logistics commission"
      })),
      ...confirmedServiceRecords.map((item) => ({
        sourceType: "service" as const,
        ownerName: item.financeOrder.salespersonName || "Pending supervisor confirmation",
        financeOrder: item.financeOrder,
        businessType: item.serviceType,
        grossProfit: item.grossProfit ?? 0,
        commissionRate: item.grossProfit ? (item.supervisorFinalCommission ?? item.suggestedCommissionMin ?? 0) / item.grossProfit : null,
        commissionAmount: item.supervisorFinalCommission ?? item.suggestedCommissionMin ?? 0,
        source: "Supervisor-confirmed registration/service commission"
      }))
    ];
    const salesGroups = new Map<string, typeof salesItems>();
    for (const item of salesItems) {
      salesGroups.set(item.ownerName, [...(salesGroups.get(item.ownerName) ?? []), item]);
    }

    for (const [index, [ownerName, items]] of Array.from(salesGroups.entries()).sort(([left], [right]) => left.localeCompare(right, "zh-Hans-CN")).entries()) {
      const finalAmount = roundMoney(items.reduce((sum, item) => sum + item.commissionAmount, 0));
      const grossProfit = roundMoney(items.reduce((sum, item) => sum + item.grossProfit, 0));
      const receivable = roundMoney(items.reduce((sum, item) => sum + item.financeOrder.adjustedReceivable, 0));
      const payable = roundMoney(items.reduce((sum, item) => sum + item.financeOrder.adjustedPayable, 0));
      const logisticsCommission = roundMoney(items.filter((item) => item.sourceType === "logistics").reduce((sum, item) => sum + item.commissionAmount, 0));
      const serviceCommission = roundMoney(items.filter((item) => item.sourceType === "service").reduce((sum, item) => sum + item.commissionAmount, 0));
      const payload = {
        title: "销售代表提成薪资确认单",
        fileType: "sales_salary_confirmation",
        documentCode: documentCode(selectedMonth, index, "sales_salary"),
        sourceFileName: activeBatch?.fileName ?? "-",
        importBatchNo: activeBatch?.batchNo ?? "-",
        snapshotCreatedAt: new Date().toISOString(),
        monthLabel: formatMonthLabel(selectedMonth),
        generatedAt: new Date().toISOString(),
        summary: {
          ownerName,
          businessType: "sales_salary",
          orderCount: items.length,
          receivable,
          payable,
          grossProfit,
          commissionRate: grossProfit > 0 ? finalAmount / grossProfit : null,
          accruedCommission: finalAmount,
          supervisorAdjustmentAmount: 0,
          finalCommission: finalAmount,
          logisticsCommission,
          serviceCommission,
          abnormalNote: "本确认单汇总导入 Excel 产生的物流提成及已主管确认的注册/服务提成，不包含固定底薪、社保和个税。",
          payoutNote: `随 ${selectedMonth} 薪资一起发放`,
          status: "pending employee signature"
        },
        details: items.map((item) => ({
          orderNo: item.financeOrder.orderNo,
          originalOrderNo: item.financeOrder.customerOrderNo,
          customerName: item.financeOrder.customerName,
          businessType: item.businessType,
          receivable: roundMoney(item.financeOrder.adjustedReceivable),
          payable: roundMoney(item.financeOrder.adjustedPayable),
          grossProfit: roundMoney(item.grossProfit),
          grossProfitRate: item.financeOrder.adjustedGrossProfitRate,
          commissionRate: item.commissionRate,
          commissionAmount: roundMoney(item.commissionAmount),
          source: item.source,
          salaryComponent: item.sourceType === "service" ? "注册/服务提成" : "物流提成"
        })),
        statement: "本人确认本月销售提成薪资确认单中的订单、毛利、提成比例和最终提成金额。该确认单不包含固定底薪、社保和个税。",
        signatureTrace: {
          employeeSignature: "pending employee signature",
          signedAt: null,
          confirmIp: "system captured",
          deviceInfo: "system captured",
          supervisorConfirm: "pending supervisor confirmation"
        }
      };
      documents.push(await writeConfirmationDocument({
        month: selectedMonth,
        documentType: "sales_salary",
        ownerName,
        businessType: "sales_salary",
        orderCount: items.length,
        grossProfit,
        commissionAmount: finalAmount,
        payloadJson: JSON.stringify(payload)
      }));
    }

    for (const [index, group] of performance.rows.entries()) {
      const finalAmount = roundMoney(group.payablePerformance);
      const payload = {
        title: "操作员薪资确认单",
        fileType: "customer_service_salary_confirmation",
        documentCode: documentCode(selectedMonth, index, "customer_service_salary"),
        sourceFileName: activeBatch?.fileName ?? "-",
        importBatchNo: activeBatch?.batchNo ?? "-",
        snapshotCreatedAt: new Date().toISOString(),
        monthLabel: formatMonthLabel(selectedMonth),
        generatedAt: new Date().toISOString(),
        summary: {
          ownerName: group.operatorName,
          businessType: "operator_salary",
          orderCount: group.rows.reduce((sum, row) => sum + row.rawOrderCount, 0),
          receivable: 0,
          payable: 0,
          grossProfit: roundMoney(group.totalCommission),
          commissionRate: null,
          accruedCommission: finalAmount,
          supervisorAdjustmentAmount: 0,
          finalCommission: finalAmount,
          abnormalNote: "本确认单按操作员的各绩效板块汇总导入 Excel 统计、规则基础票数、计发票数和绩效金额，不包含固定底薪、社保和个税。",
          payoutNote: performance.payoutNote,
          status: "pending employee signature"
        },
        details: group.rows.map((row) => ({
          orderNo: row.orderType,
          originalOrderNo: "-",
          customerName: group.operatorName,
          businessType: "operator_performance",
          receivable: row.rawOrderCount,
          payable: row.baseCount,
          grossProfit: roundMoney(row.commissionAmount),
          grossProfitRate: null,
          commissionRate: row.rateUnit === "%" ? row.rate / 100 : null,
          commissionAmount: roundMoney(row.commissionAmount),
          source: `${row.note}；规则值：${row.rate}${row.rateUnit}`,
          performanceCategory: row.orderType,
          rawOrderCount: row.rawOrderCount,
          baseCount: row.baseCount,
          commissionOrderCount: row.commissionOrderCount,
          performanceRate: row.rate,
          performanceRateUnit: row.rateUnit,
          bracketLabel: row.bracketLabel
        })),
        statement: `本人确认本月操作员薪资确认单中的各绩效板块、Excel 统计、规则基础票数、计发票数、绩效规则和最终绩效金额。${performance.payoutNote}`,
        signatureTrace: {
          employeeSignature: "pending employee signature",
          signedAt: null,
          confirmIp: "system captured",
          deviceInfo: "system captured",
          supervisorConfirm: "pending supervisor confirmation"
        }
      };
      documents.push(await writeConfirmationDocument({
        month: selectedMonth,
        documentType: "customer_service_salary",
        ownerName: group.operatorName,
        businessType: "customer_service_salary",
        orderCount: payload.summary.orderCount,
        grossProfit: roundMoney(group.totalCommission),
        commissionAmount: finalAmount,
        payloadJson: JSON.stringify(payload)
      }));
    }

    await logAction({
      month: selectedMonth,
      entityType: "confirmation_document",
      entityId: "salary_confirmation",
      action: "batch_generate_salary_documents",
      payload: { salesCount: salesGroups.size, customerServiceCount: performance.rows.length }
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
    if (current.signatureStatus === "signed") {
      throw new Error("This document has already been signed and is waiting for supervisor confirmation.");
    }

    const signatureToken = token(String(id), "signature");
    const signatureUrl = `/signature/${signatureToken}`;
    const expiresAt = tokenExpiresAt();
    const document = await prisma.confirmationDocument.update({
      where: { id },
      data: {
        sendStatus: "link_generated",
        notificationChannel: null,
        notifiedAt: null,
        notificationReceiptJson: null,
        notificationError: null,
        signatureToken,
        signatureUrl,
        signatureTokenExpiresAt: expiresAt,
        payloadJson: updatePayloadJson(current.payloadJson, (payload) => ({
          ...payload,
          signatureTrace: {
            ...(payload.signatureTrace ?? {}),
            employeeSignature: "signature link generated, awaiting notification",
            tokenExpiresAt: expiresAt.toISOString()
          }
        }))
      }
    });
    await logAction({ month: document.month, entityType: "confirmation_document", entityId: id, action: "generate_signature_link", payload: { signatureUrl, expiresAt } });
    const notificationTarget = await configuredNotificationChannel(document);
    if (!notificationTarget) return document;

    try {
      const receipt = await sendNotification(notificationTarget, document);
      const notifiedAt = new Date();
      const notified = await prisma.confirmationDocument.update({
        where: { id },
        data: {
          sendStatus: "notified",
          notificationChannel: notificationTarget.channel,
          notifiedAt,
          notificationReceiptJson: JSON.stringify(receipt ?? {}),
          notificationError: null,
          payloadJson: updatePayloadJson(document.payloadJson, (payload) => ({
            ...payload,
            signatureTrace: { ...(payload.signatureTrace ?? {}), notificationStatus: "notified", notificationChannel: notificationTarget.channel, notifiedAt: notifiedAt.toISOString() }
          }))
        }
      });
      await logAction({ month: notified.month, entityType: "confirmation_document", entityId: id, action: "send_signature_notification", payload: { notificationChannel: notificationTarget.channel, notifiedAt } });
      return notified;
    } catch (error: any) {
      const notificationError = String(error?.message ?? "通知发送失败").slice(0, 500);
      const failed = await prisma.confirmationDocument.update({
        where: { id },
        data: {
          sendStatus: "delivery_failed",
          notificationChannel: notificationTarget.channel,
          notificationError,
          payloadJson: updatePayloadJson(document.payloadJson, (payload) => ({
            ...payload,
            signatureTrace: { ...(payload.signatureTrace ?? {}), notificationStatus: "delivery_failed", notificationChannel: notificationTarget.channel, notificationError }
          }))
        }
      });
      await logAction({ month: failed.month, entityType: "confirmation_document", entityId: id, action: "signature_notification_failed", payload: { notificationChannel: notificationTarget.channel, notificationError } });
      return failed;
    }
  },

  async markSignatureLinkNotified(id: number, channel: string) {
    const current = await prisma.confirmationDocument.findUniqueOrThrow({ where: { id } });
    if (current.documentStatus === "voided") throw new Error("Voided documents cannot be notified.");
    if (!current.signatureUrl || !current.signatureToken) {
      throw new Error("Generate a valid signature link before recording notification.");
    }

    const notificationChannel = channel.trim().slice(0, 60) || "manual_copy";
    const notifiedAt = new Date();
    const document = await prisma.confirmationDocument.update({
      where: { id },
      data: {
        sendStatus: "notified",
        notificationChannel,
        notifiedAt,
        notificationReceiptJson: null,
        notificationError: null,
        payloadJson: updatePayloadJson(current.payloadJson, (payload) => ({
          ...payload,
          signatureTrace: {
            ...(payload.signatureTrace ?? {}),
            notificationStatus: "notified",
            notificationChannel,
            notifiedAt: notifiedAt.toISOString()
          }
        }))
      }
    });
    await logAction({ month: document.month, entityType: "confirmation_document", entityId: id, action: "record_signature_notification", payload: { notificationChannel, notifiedAt } });
    return document;
  },

  async publicSignatureDocument(signatureToken: string) {
    const current = await prisma.confirmationDocument.findUnique({ where: { signatureToken } });
    if (!current || current.documentStatus === "voided") {
      throw new Error("Signature link is invalid. Ask the supervisor to resend it.");
    }
    if (!current.signatureTokenExpiresAt || current.signatureTokenExpiresAt < new Date()) {
      throw new Error("Signature link has expired. Ask the supervisor to resend it.");
    }

    const payload = safeJson<Record<string, any>>(current.payloadJson, {});
    return {
      document: {
        id: current.id,
        month: current.month,
        ownerName: current.ownerName,
        version: current.version,
        documentType: current.documentType,
        orderCount: current.orderCount,
        grossProfit: current.grossProfit,
        commissionAmount: current.commissionAmount,
        expiresAt: current.signatureTokenExpiresAt.toISOString()
      },
      payload: {
        title: payload.title ?? "个人确认单",
        documentCode: payload.documentCode ?? `DOC-${current.id}`,
        monthLabel: payload.monthLabel ?? current.month,
        generatedAt: payload.generatedAt ?? current.createdAt.toISOString(),
        summary: payload.summary ?? {},
        details: Array.isArray(payload.details) ? payload.details : [],
        statement: payload.statement ?? "本人已核对确认单内容。"
      }
    };
  },

  async signByToken(signatureToken: string, evidence: SignatureEvidenceInput = {}) {
    const current = await prisma.confirmationDocument.findUniqueOrThrow({ where: { signatureToken } });
    if (current.documentStatus === "voided") {
      throw new Error("Document is voided. Ask supervisor to resend a new version.");
    }
    if (!current.signatureTokenExpiresAt || current.signatureTokenExpiresAt < new Date()) {
      throw new Error("Signature link has expired. Ask supervisor to resend it.");
    }
    if (!evidence.acceptedStatement) {
      throw new Error("You must confirm the statement before signing.");
    }
    if (!evidence.signedName || evidence.signedName !== current.ownerName) {
      throw new Error("The signature name must match the confirmation document owner.");
    }

    const signedAt = new Date();
    const proof = signatureEvidence({ ...evidence, action: "employee_sign" });
    const document = await prisma.confirmationDocument.update({
      where: { id: current.id },
      data: {
        signatureStatus: "signed",
        sendStatus: current.sendStatus,
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
    if (current.signatureStatus !== "signed") {
      throw new Error("The employee must sign this document before supervisor confirmation.");
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
        sendStatus: current.sendStatus,
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
