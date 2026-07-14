import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PDFDocument from "pdfkit";
import sharp from "sharp";

export type ConfirmationRenderDocument = {
  id: number;
  month: string;
  ownerName: string;
  version: number;
  documentType: string;
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
  payloadJson: string | null;
};

type PdfColumn = {
  key: string;
  title: string;
  width: number;
  align?: "left" | "center" | "right";
  value: (row: Record<string, any>) => string;
};

const palette = {
  ink: "#10213f",
  secondary: "#73819a",
  line: "#dce5f0",
  header: "#f3f6fb",
  meta: "#f7faff",
  blue: "#3478f6",
  blueSoft: "#eaf2ff",
  white: "#ffffff"
};

function safeJson(value: string | null | undefined) {
  if (!value) return {} as Record<string, any>;
  try {
    return JSON.parse(value) as Record<string, any>;
  } catch {
    return {} as Record<string, any>;
  }
}

function fontPath() {
  const candidates = [
    process.env.CONFIRMATION_FONT_PATH,
    path.resolve(process.cwd(), "assets", "SimHei.ttf"),
    path.resolve(process.cwd(), "server", "assets", "SimHei.ttf"),
    "C:\\Windows\\Fonts\\simhei.ttf",
    "/usr/share/fonts/truetype/xjd/SimHei.ttf"
  ];
  return candidates.find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate))) ?? null;
}

function pdftoppmPath() {
  const executableName = process.platform === "win32" ? "pdftoppm.exe" : "pdftoppm";
  const candidates = [
    process.env.PDFTOPPM_PATH,
    path.resolve(path.dirname(process.execPath), "..", "..", "native", "poppler", "Library", "bin", executableName),
    process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "native", "poppler", "Library", "bin", executableName)
      : undefined,
    "/usr/bin/pdftoppm",
    "/usr/local/bin/pdftoppm"
  ];
  return candidates.find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate))) ?? "pdftoppm";
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyText(value: unknown) {
  return `￥${numberValue(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percentText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(2)}%` : "-";
}

function plainText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function dateTimeText(value: unknown) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return plainText(value).replace("T", " ").slice(0, 19);
  return date.toLocaleString("zh-CN", { hour12: false }).replaceAll("/", "-");
}

function statusText(status: unknown) {
  const labels: Record<string, string> = {
    generated: "已生成",
    voided: "已作废",
    pending: "待签名",
    pending_signature: "待签名",
    "pending employee signature": "待员工签名",
    "pending operator signature": "待操作员签名",
    signed: "已电子签名",
    sent: "已发送",
    notified: "已通知",
    link_generated: "链接已生成",
    delivery_failed: "发送失败",
    confirmed: "主管已确认",
    "supervisor confirmed": "主管已确认",
    "pending supervisor confirmation": "待主管确认"
  };
  return labels[String(status ?? "")] ?? plainText(status);
}

function confirmationScope(document: ConfirmationRenderDocument, payload: Record<string, any>) {
  const original = plainText(payload.summary?.abnormalNote);
  const highRiskMatch = original.match(/high risk tickets pending review:\s*(\d+)/i);
  if (highRiskMatch) return `本确认单按导入 Excel 的物流订单、毛利和提成规则汇总；其中高风险票待复核 ${highRiskMatch[1]} 票。`;
  if (original !== "-") return original;
  if (document.documentType === "service_commission") return "本确认单依据注册/证书/店铺服务的主管确认结果生成，金额以当前确认单快照为准。";
  if (document.documentType === "operator_performance" || document.documentType === "customer_service_salary") return "本确认单按操作员的各绩效板块汇总导入 Excel 统计、规则基础票数、计发票数和绩效金额。";
  return "本确认单按导入 Excel 的订单、毛利、提成比例和最终提成金额汇总。";
}

function confirmationStatement(document: ConfirmationRenderDocument, payload: Record<string, any>) {
  const original = plainText(payload.statement);
  if (original !== "-" && !/^The (employee|operator) confirms/i.test(original)) return original;
  if (document.documentType === "operator_performance" || document.documentType === "customer_service_salary") {
    return "本人确认本月操作员确认单中的绩效板块、Excel 统计票数、规则基础票数、计发票数、绩效规则和最终绩效金额。";
  }
  if (document.documentType === "service_commission") {
    return "本人确认本月注册/服务业务对应的订单、成交利润、提成规则和最终确认提成金额。";
  }
  return "本人确认本月确认单中的订单、毛利、提成比例和最终提成金额。";
}

function evidenceText(value: unknown) {
  if (value === "system captured") return "系统自动记录";
  return statusText(value);
}

function documentTitle(document: ConfirmationRenderDocument, payload: Record<string, any>) {
  if (payload.fileType === "sales_salary_confirmation" || document.documentType === "sales_salary") return "销售代表提成薪资确认单";
  if (payload.fileType === "customer_service_salary_confirmation" || document.documentType === "customer_service_salary") return "操作员薪资确认单";
  if (payload.fileType === "operator_performance_confirmation" || document.documentType === "operator_performance") return "操作员绩效确认单";
  if (payload.fileType === "service_commission_confirmation" || document.documentType === "service_commission") return "注册/服务提成确认单";
  return "销售代表物流提成确认单";
}

function registerFont(doc: PDFKit.PDFDocument) {
  const resolved = fontPath();
  if (!resolved) return;
  doc.registerFont("XJD-CJK", resolved);
  doc.font("XJD-CJK");
}

function textHeight(doc: PDFKit.PDFDocument, text: string, width: number, fontSize: number, lineGap = 1) {
  doc.fontSize(fontSize);
  return doc.heightOfString(text, { width, lineGap });
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, ensureSpace: (height: number) => void) {
  ensureSpace(30);
  doc.moveDown(0.45);
  const y = doc.y;
  doc.fillColor(palette.blue).rect(doc.page.margins.left, y + 2, 4, 16).fill();
  doc.fillColor(palette.ink).fontSize(12).text(title, doc.page.margins.left + 12, y, { continued: false });
  doc.y = y + 24;
}

function drawSummaryGrid(
  doc: PDFKit.PDFDocument,
  items: Array<{ label: string; value: string }>,
  ensureSpace: (height: number) => void,
  contentWidth: number
) {
  const columns = 3;
  const pairWidth = contentWidth / columns;
  const labelWidth = 64;
  const padding = 7;
  for (let index = 0; index < items.length; index += columns) {
    const row = items.slice(index, index + columns);
    const heights = row.map((item) => Math.max(
      textHeight(doc, item.label, labelWidth - padding * 2, 8),
      textHeight(doc, item.value, pairWidth - labelWidth - padding * 2, 8.5)
    ));
    const height = Math.max(30, ...heights.map((value) => value + padding * 2));
    ensureSpace(height);
    const y = doc.y;
    row.forEach((item, columnIndex) => {
      const x = doc.page.margins.left + columnIndex * pairWidth;
      doc.fillColor(palette.header).rect(x, y, labelWidth, height).fill();
      doc.fillColor(palette.white).rect(x + labelWidth, y, pairWidth - labelWidth, height).fill();
      doc.strokeColor(palette.line).lineWidth(0.7).rect(x, y, pairWidth, height).stroke();
      doc.fillColor(palette.secondary).fontSize(8).text(item.label, x + padding, y + padding, { width: labelWidth - padding * 2 });
      doc.fillColor(palette.ink).fontSize(8.5).text(item.value, x + labelWidth + padding, y + padding, { width: pairWidth - labelWidth - padding * 2 });
    });
    doc.y = y + height;
  }
}

function drawWideInfo(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  ensureSpace: (height: number) => void,
  contentWidth: number
) {
  const labelWidth = 86;
  const padding = 8;
  const height = Math.max(32, textHeight(doc, value, contentWidth - labelWidth - padding * 2, 8.5, 2) + padding * 2);
  ensureSpace(height);
  const y = doc.y;
  doc.fillColor(palette.header).rect(doc.page.margins.left, y, labelWidth, height).fill();
  doc.fillColor(palette.white).rect(doc.page.margins.left + labelWidth, y, contentWidth - labelWidth, height).fill();
  doc.strokeColor(palette.line).lineWidth(0.7).rect(doc.page.margins.left, y, contentWidth, height).stroke();
  doc.fillColor(palette.secondary).fontSize(8).text(label, doc.page.margins.left + padding, y + padding, { width: labelWidth - padding * 2 });
  doc.fillColor(palette.ink).fontSize(8.5).text(value, doc.page.margins.left + labelWidth + padding, y + padding, { width: contentWidth - labelWidth - padding * 2, lineGap: 2 });
  doc.y = y + height;
}

function drawTable(
  doc: PDFKit.PDFDocument,
  rows: Record<string, any>[],
  columns: PdfColumn[],
  ensureSpace: (height: number) => void
) {
  const padding = 5;
  const headerHeight = 28;
  const drawHeader = () => {
    ensureSpace(headerHeight + 22);
    const y = doc.y;
    let x = doc.page.margins.left;
    for (const column of columns) {
      doc.fillColor(palette.header).rect(x, y, column.width, headerHeight).fill();
      doc.strokeColor(palette.line).lineWidth(0.6).rect(x, y, column.width, headerHeight).stroke();
      doc.fillColor(palette.ink).fontSize(7.5).text(column.title, x + padding, y + 8, {
        width: column.width - padding * 2,
        align: column.align ?? "left"
      });
      x += column.width;
    }
    doc.y = y + headerHeight;
  };

  drawHeader();
  if (!rows.length) {
    const y = doc.y;
    const width = columns.reduce((sum, column) => sum + column.width, 0);
    doc.strokeColor(palette.line).rect(doc.page.margins.left, y, width, 32).stroke();
    doc.fillColor(palette.secondary).fontSize(8.5).text("暂无明细", doc.page.margins.left, y + 10, { width, align: "center" });
    doc.y = y + 32;
    return;
  }

  rows.forEach((row, rowIndex) => {
    const values = columns.map((column) => column.value(row));
    const rowHeight = Math.max(28, ...values.map((value, index) => (
      textHeight(doc, value, columns[index].width - padding * 2, 7.2, 1) + padding * 2
    )));
    const pageBottom = doc.page.height - doc.page.margins.bottom - 18;
    if (doc.y + rowHeight > pageBottom) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    let x = doc.page.margins.left;
    columns.forEach((column, index) => {
      if (rowIndex % 2 === 1) doc.fillColor("#fbfcfe").rect(x, y, column.width, rowHeight).fill();
      doc.strokeColor(palette.line).lineWidth(0.5).rect(x, y, column.width, rowHeight).stroke();
      doc.fillColor(palette.ink).fontSize(7.2).text(values[index], x + padding, y + padding, {
        width: column.width - padding * 2,
        align: column.align ?? "left",
        lineGap: 1
      });
      x += column.width;
    });
    doc.y = y + rowHeight;
  });
}

function salesColumns(contentWidth: number): PdfColumn[] {
  const widths = [0.15, 0.14, 0.14, 0.15, 0.14, 0.12, 0.16].map((ratio) => contentWidth * ratio);
  return [
    { key: "orderNo", title: "系统订单号", width: widths[0], value: (row) => plainText(row.orderNo) },
    { key: "originalOrderNo", title: "原始订单号", width: widths[1], value: (row) => plainText(row.originalOrderNo) },
    { key: "businessType", title: "业务类型", width: widths[2], value: (row) => plainText(row.businessType) },
    { key: "salaryComponent", title: "金额构成", width: widths[3], value: (row) => plainText(row.salaryComponent || "物流提成") },
    { key: "grossProfit", title: "毛利", width: widths[4], align: "right", value: (row) => moneyText(row.grossProfit) },
    { key: "commissionRate", title: "提成比例", width: widths[5], align: "right", value: (row) => percentText(row.commissionRate) },
    { key: "commissionAmount", title: "确认提成", width: widths[6], align: "right", value: (row) => moneyText(row.commissionAmount) }
  ];
}

function operatorColumns(contentWidth: number): PdfColumn[] {
  const widths = [0.18, 0.11, 0.12, 0.11, 0.24, 0.11, 0.13].map((ratio) => contentWidth * ratio);
  return [
    { key: "category", title: "绩效板块", width: widths[0], value: (row) => plainText(row.performanceCategory || row.orderNo) },
    { key: "raw", title: "Excel票数", width: widths[1], align: "right", value: (row) => plainText(row.rawOrderCount) },
    { key: "base", title: "规则基础票数", width: widths[2], align: "right", value: (row) => plainText(row.baseCount) },
    { key: "payable", title: "计发票数", width: widths[3], align: "right", value: (row) => plainText(row.commissionOrderCount) },
    { key: "rule", title: "绩效规则", width: widths[4], value: (row) => plainText(row.bracketLabel || row.source) },
    { key: "rate", title: "计薪单价", width: widths[5], align: "right", value: (row) => `${plainText(row.performanceRate)}${plainText(row.performanceRateUnit) === "-" ? "" : row.performanceRateUnit}` },
    { key: "amount", title: "绩效金额", width: widths[6], align: "right", value: (row) => moneyText(row.commissionAmount) }
  ];
}

export async function renderConfirmationPdf(document: ConfirmationRenderDocument) {
  const payload = safeJson(document.payloadJson);
  const summary = payload.summary ?? {};
  const details = Array.isArray(payload.details) ? payload.details : [];
  const isOperator = document.documentType === "operator_performance"
    || document.documentType === "customer_service_salary"
    || summary.businessType === "operator_salary";
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 34, bufferPages: true, info: { Title: documentTitle(document, payload), Author: "XJD Finance" } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  registerFont(doc);
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pageBottom = () => doc.page.height - doc.page.margins.bottom - 18;
  const ensureSpace = (height: number) => {
    if (doc.y + height > pageBottom()) doc.addPage();
  };

  const title = documentTitle(document, payload);
  doc.fillColor(palette.ink).fontSize(17).text(title, { align: "left" });
  const titleBottom = doc.y + 8;
  doc.fillColor(palette.meta).roundedRect(doc.page.margins.left, titleBottom, contentWidth, 34, 4).fill();
  doc.strokeColor(palette.line).roundedRect(doc.page.margins.left, titleBottom, contentWidth, 34, 4).stroke();
  doc.fillColor(palette.blue).fontSize(8).text(title, doc.page.margins.left + 10, titleBottom + 11, { width: 150 });
  doc.fillColor(palette.secondary).fontSize(8).text(
    `确认月份：${payload.monthLabel ?? document.month}    确认单编号：${payload.documentCode ?? `DOC-${document.id}`}    版本：V${document.version}    生成时间：${dateTimeText(payload.generatedAt ?? payload.snapshotCreatedAt)}`,
    doc.page.margins.left + 165,
    titleBottom + 11,
    { width: contentWidth - 175 }
  );
  doc.y = titleBottom + 40;

  drawSectionTitle(doc, "一、确认信息与金额汇总", ensureSpace);
  drawSummaryGrid(doc, [
    { label: "员工姓名", value: document.ownerName },
    { label: "确认状态", value: statusText(document.signatureStatus) },
    { label: isOperator ? "业务量" : "订单数量", value: String(summary.orderCount ?? document.orderCount ?? 0) },
    { label: isOperator ? "绩效口径" : "提成比例", value: isOperator ? "按绩效板块汇总" : percentText(summary.commissionRate) },
    { label: "应收金额", value: moneyText(summary.receivable) },
    { label: "调整后应付", value: moneyText(summary.payable) },
    { label: isOperator ? "绩效原值" : "调整后毛利", value: moneyText(summary.grossProfit ?? document.grossProfit) },
    { label: isOperator ? "应计绩效" : "应计提成", value: moneyText(summary.accruedCommission ?? summary.finalCommission ?? document.commissionAmount) },
    { label: "主管调整金额", value: moneyText(summary.supervisorAdjustmentAmount) },
    { label: isOperator ? "最终绩效金额" : "最终确认提成", value: moneyText(summary.finalCommission ?? document.commissionAmount) },
    { label: "员工签名", value: statusText(document.signatureStatus) },
    { label: "主管确认", value: statusText(document.supervisorStatus) }
  ], ensureSpace, contentWidth);
  drawWideInfo(doc, "确认口径", confirmationScope(document, payload), ensureSpace, contentWidth);
  drawWideInfo(doc, "发放说明", plainText(summary.payoutNote), ensureSpace, contentWidth);

  drawSectionTitle(doc, isOperator ? "二、绩效板块明细" : "二、订单提成明细", ensureSpace);
  drawTable(doc, details, isOperator ? operatorColumns(contentWidth) : salesColumns(contentWidth), ensureSpace);

  ensureSpace(82);
  drawSectionTitle(doc, "三、员工确认声明", ensureSpace);
  drawWideInfo(doc, "确认声明", confirmationStatement(document, payload), ensureSpace, contentWidth);

  ensureSpace(102);
  drawSectionTitle(doc, "四、签名留痕", ensureSpace);
  drawSummaryGrid(doc, [
    { label: "员工签名", value: statusText(document.signatureStatus) },
    { label: "签名时间", value: dateTimeText(document.signedAt ?? payload.signatureTrace?.signedAt) },
    { label: "确认 IP", value: evidenceText(document.signerIp ?? payload.signatureTrace?.confirmIp) },
    { label: "设备信息", value: evidenceText(document.signerUserAgent ?? payload.signatureTrace?.deviceInfo) },
    { label: "主管确认", value: statusText(document.supervisorStatus) },
    { label: "主管确认时间", value: dateTimeText(document.confirmedAt) }
  ], ensureSpace, contentWidth);
  if (document.adjustReason) drawWideInfo(doc, "调整原因", document.adjustReason, ensureSpace, contentWidth);
  if (document.voidReason) drawWideInfo(doc, "作废原因", document.voidReason, ensureSpace, contentWidth);

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.fillColor(palette.secondary).fontSize(7).text(
      `XJD Finance · ${payload.documentCode ?? `DOC-${document.id}`} · 第 ${index + 1} / ${range.count} 页`,
      doc.page.margins.left,
      doc.page.height - doc.page.margins.bottom - 10,
      { width: contentWidth, align: "center", lineBreak: false }
    );
  }
  doc.end();
  return done;
}

export async function renderConfirmationPng(document: ConfirmationRenderDocument) {
  const renderId = crypto.randomUUID();
  const tempDir = os.tmpdir();
  const pdfPath = path.join(tempDir, `xjd-confirmation-${renderId}.pdf`);
  const outputBase = path.join(tempDir, `xjd-confirmation-${renderId}`);
  const pageFiles: string[] = [];
  try {
    fs.writeFileSync(pdfPath, await renderConfirmationPdf(document));
    execFileSync(pdftoppmPath(), ["-png", "-r", "144", pdfPath, outputBase], { stdio: "ignore" });
    const prefix = `${path.basename(outputBase)}-`;
    pageFiles.push(...fs.readdirSync(tempDir)
      .filter((name) => name.startsWith(prefix) && name.endsWith(".png"))
      .sort((left, right) => Number(left.slice(prefix.length, -4)) - Number(right.slice(prefix.length, -4)))
      .map((name) => path.join(tempDir, name)));
    if (!pageFiles.length) throw new Error("PDF 转 PNG 未生成页面文件");
    const pages = await Promise.all(pageFiles.map(async (file) => {
      const input = fs.readFileSync(file);
      return { input, metadata: await sharp(input).metadata() };
    }));
    const width = Math.max(...pages.map((page) => page.metadata.width ?? 0));
    const height = pages.reduce((sum, page) => sum + (page.metadata.height ?? 0), 0);
    let top = 0;
    const composite = pages.map((page) => {
      const item = { input: page.input, left: 0, top };
      top += page.metadata.height ?? 0;
      return item;
    });
    return sharp({ create: { width, height, channels: 4, background: palette.white } }).composite(composite).png().toBuffer();
  } finally {
    fs.rmSync(pdfPath, { force: true });
    for (const file of pageFiles) fs.rmSync(file, { force: true });
  }
}
