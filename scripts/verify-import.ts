import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { can } from "../server/src/config/rbac.js";
import { prisma } from "../server/src/prisma/client.js";
import { authService, parseAuthToken } from "../server/src/services/auth.service.js";
import { analyticsService } from "../server/src/services/analytics.service.js";
import { financeService } from "../server/src/services/finance.service.js";
import { payableService } from "../server/src/services/payable.service.js";
import { receivableService } from "../server/src/services/receivable.service.js";
import { reportService } from "../server/src/services/report.service.js";
import { riskService } from "../server/src/services/risk.service.js";
import { settlementService } from "../server/src/services/settlement.service.js";
import { excelService } from "../server/src/services/excel.service.js";
import { workflowService } from "../server/src/services/workflow.service.js";
import * as XLSX from "xlsx";

type Check = {
  name: string;
  pass: boolean;
  detail?: string;
};

function findDefaultExcelPath() {
  const candidates = [
    process.env.IMPORT_VERIFY_FILE,
    "D:/Users/DELL/Desktop/2026.6月系统运单明细.xlsx",
    path.join(os.homedir(), "Desktop", "2026.6月系统运单明细.xlsx")
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const desktop = path.join(os.homedir(), "Desktop");
  if (fs.existsSync(desktop)) {
    const match = fs.readdirSync(desktop).find((name) => name.includes("系统运单明细") && name.endsWith(".xlsx"));
    if (match) return path.join(desktop, match);
  }

  return candidates[0] ?? "";
}

function assertCheck(checks: Check[], name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
}

function closeEnough(a: number, b: number, tolerance = 0.01) {
  return Math.abs(a - b) <= tolerance;
}

async function verifyImport(checks: Check[]) {
  const excelPath = findDefaultExcelPath();
  assertCheck(checks, "Excel file exists", fs.existsSync(excelPath), excelPath);
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Verification Excel not found: ${excelPath}`);
  }

  await workflowService.unlockMonth("2026-06", {
    operator: "verify-import",
    note: "Ensure verification month is open before import test"
  });

  const buffer = fs.readFileSync(excelPath);
  const fileName = path.basename(excelPath);
  const preview = await excelService.previewWorkbook(buffer, fileName);
  assertCheck(checks, "Preview identifies month", preview.month === "2026-06", preview.month);
  assertCheck(checks, "Preview row count", preview.importedRows === 102, String(preview.importedRows));
  assertCheck(checks, "Preview order count", preview.importedOrders === 25, String(preview.importedOrders));
  assertCheck(checks, "Preview logistics/service split", preview.logisticsOrders === 22 && preview.serviceOrders === 3, `${preview.logisticsOrders}/${preview.serviceOrders}`);
  assertCheck(checks, "Preview uses DB USD rule", preview.audit?.activeRules?.usdRate === 6.85, String(preview.audit?.activeRules?.usdRate));
  assertCheck(checks, "Preview maps required fields", (preview.audit?.missingRequiredFields.length ?? 1) === 0, JSON.stringify(preview.audit?.missingRequiredFields));
  assertCheck(checks, "Preview quality report generated", Boolean(preview.qualityReport?.issues?.length), JSON.stringify(preview.qualityReport));

  const imported = await excelService.importWorkbook(buffer, fileName);
  assertCheck(checks, "Import returns batch", Boolean(imported.batchId && imported.batchNo), imported.batchNo);
  assertCheck(checks, "Import returns quality report", Boolean(imported.qualityReport?.issues?.length), JSON.stringify(imported.qualityReport));

  const [orders, summary, batch, commissions, risks, services] = await Promise.all([
    prisma.financeOrder.findMany({ where: { month: imported.month } }),
    prisma.financeSummary.findUnique({ where: { month: imported.month } }),
    prisma.importBatch.findUnique({ where: { id: imported.batchId } }),
    prisma.commissionRecord.findMany({ where: { financeOrder: { month: imported.month } } }),
    prisma.riskRecord.findMany({ where: { financeOrder: { month: imported.month } } }),
    prisma.serviceBusinessRecord.findMany({ where: { financeOrder: { month: imported.month } } })
  ]);
  const rawLines = await excelService.listRawLedgerLines({ batchId: imported.batchId });
  const chargeLines = await excelService.listChargeLines({ batchId: imported.batchId });
  const importLogs = await workflowService.actionLogs({
    month: imported.month,
    entityType: "import_batch",
    entityId: String(imported.batchId)
  });

  const orderReceivable = orders.reduce((sum, order) => sum + order.adjustedReceivable, 0);
  const orderPayable = orders.reduce((sum, order) => sum + order.adjustedPayable, 0);
  const orderProfit = orders.reduce((sum, order) => sum + order.adjustedGrossProfit, 0);
  const chargeReceivable = chargeLines.rows
    .filter((line) => String(line.direction).includes("应收"))
    .reduce((sum, line) => sum + line.localAmount, 0);
  const chargePayable = chargeLines.rows
    .filter((line) => String(line.direction).includes("应付"))
    .reduce((sum, line) => sum + line.localAmount, 0);

  assertCheck(checks, "Database order count", orders.length === 25, String(orders.length));
  assertCheck(checks, "Database service order count", orders.filter((order) => order.isServiceBusiness).length === 3, String(orders.filter((order) => order.isServiceBusiness).length));
  assertCheck(checks, "Commission records generated", commissions.length === 22, String(commissions.length));
  assertCheck(checks, "Service confirmation records generated", services.length === 3, String(services.length));
  assertCheck(checks, "Risk records generated", risks.length >= 1, String(risks.length));
  assertCheck(checks, "Raw ledger lines stored", rawLines.rows.length === preview.importedRows, `${rawLines.rows.length} / ${preview.importedRows}`);
  assertCheck(checks, "Raw ledger line keeps original row json", Boolean(rawLines.rows[0]?.raw && Object.keys(rawLines.rows[0].raw).length), JSON.stringify(rawLines.rows[0]?.raw));
  assertCheck(checks, "Raw ledger line keeps canonical fields", Boolean(rawLines.rows.find((line) => line.orderNo)?.canonical?.orderNo), JSON.stringify(rawLines.rows.find((line) => line.orderNo)?.canonical));
  assertCheck(checks, "Finance charge lines stored", chargeLines.rows.length === rawLines.rows.filter((line) => line.orderNo).length, `${chargeLines.rows.length} / ${rawLines.rows.filter((line) => line.orderNo).length}`);
  assertCheck(checks, "Finance charge lines keep signed amounts", chargeLines.rows.some((line) => line.signedAmount < 0 || line.isCompensation), `negativeOrCompensation=${chargeLines.rows.filter((line) => line.signedAmount < 0 || line.isCompensation).length}`);
  assertCheck(checks, "Charge receivable reconciles with order receivable", closeEnough(chargeReceivable, orderReceivable), `${chargeReceivable} / ${orderReceivable}`);
  assertCheck(checks, "Charge payable reconciles with order payable", closeEnough(chargePayable, orderPayable), `${chargePayable} / ${orderPayable}`);
  assertCheck(checks, "Import action log written", importLogs.some((log) => log.action === "import_excel"), importLogs.map((log) => log.action).join(","));
  assertCheck(checks, "Batch is active", batch?.status === "active", batch?.status);
  assertCheck(checks, "Summary exists", Boolean(summary), summary?.month);
  assertCheck(checks, "Summary receivable matches orders", closeEnough(summary?.totalReceivable ?? 0, orderReceivable), `${summary?.totalReceivable} / ${orderReceivable}`);
  assertCheck(checks, "Summary payable matches orders", closeEnough(summary?.totalPayable ?? 0, orderPayable), `${summary?.totalPayable} / ${orderPayable}`);
  assertCheck(checks, "Summary profit matches orders", closeEnough(summary?.totalGrossProfit ?? 0, orderProfit), `${summary?.totalGrossProfit} / ${orderProfit}`);

  const dashboard = await financeService.getDashboard(imported.month);
  assertCheck(checks, "Dashboard salesperson summary generated", dashboard.salespersonSummary.length > 0, String(dashboard.salespersonSummary.length));
  assertCheck(checks, "Dashboard supplier payable summary generated", dashboard.supplierPayableSummary.length > 0, String(dashboard.supplierPayableSummary.length));
  assertCheck(checks, "Dashboard customer profit summary generated", dashboard.customerProfitSummary.length > 0, String(dashboard.customerProfitSummary.length));
  assertCheck(checks, "Dashboard risk overview generated", dashboard.riskOverview.openRiskCount >= 0 && dashboard.riskOverview.highRiskCount >= 0, JSON.stringify(dashboard.riskOverview));
  assertCheck(checks, "Dashboard comparison fields generated", "momPayable" in dashboard.comparison && "momOrderCount" in dashboard.comparison, JSON.stringify(dashboard.comparison));
  assertCheck(
    checks,
    "Dashboard business summary comparison fields generated",
    dashboard.businessSummary.every((row) => "momGrossProfitChange" in row && "yoyGrossProfitChange" in row),
    JSON.stringify(dashboard.businessSummary[0])
  );

  const airSourceOrder = orders.find((order) => !order.isServiceBusiness);
  assertCheck(checks, "Operator performance test has a logistics order for air-white rule", Boolean(airSourceOrder), airSourceOrder?.orderNo);
  if (airSourceOrder) {
    await prisma.financeOrder.update({ where: { id: airSourceOrder.id }, data: { businessType: "空运白关" } });
  }
  const operatorGroups = await analyticsService.operatorPerformance(imported.month);
  const operatorRawTotal = operatorGroups.reduce((sum, group) => sum + group.totalCommission, 0);
  const operatorPayableTotal = operatorGroups.reduce((sum, group) => sum + group.payablePerformance, 0);
  assertCheck(
    checks,
    "Operator performance uses full category total without payout discount",
    closeEnough(operatorRawTotal, operatorPayableTotal),
    `${operatorRawTotal} / ${operatorPayableTotal}`
  );
  assertCheck(
    checks,
    "Operator performance counts only imported orders and never negative payable tickets",
    operatorGroups.every((group) => group.rows.every((row) => row.calculationMode === "gross_profit"
      ? row.orderCount >= 0 && row.commissionOrderCount === row.rawGrossProfit
      : row.orderCount >= 0 && row.commissionOrderCount >= 0 && row.commissionOrderCount === Math.max(row.orderCount - row.baseCount, 0))),
    JSON.stringify(operatorGroups.map((group) => ({ operator: group.operatorName, rows: group.rows.map((row) => [row.orderCount, row.baseCount, row.commissionOrderCount]) })))
  );
  const airGroup = operatorGroups.find((group) => group.rows.some((row) => row.category === "air_white"));
  const airRow = airGroup?.rows.find((row) => row.category === "air_white");
  const expectedAirPerformance = airRow
    ? Math.round((Math.min(airRow.rawGrossProfit, 50_000) * 0.15 + Math.max(airRow.rawGrossProfit - 50_000, 0) * 0.2) * 100) / 100
    : 0;
  assertCheck(checks, "Air-white performance applies 15% then 20% to the excess", Boolean(airRow) && closeEnough(airRow.commissionAmount, expectedAirPerformance), `${airRow?.commissionAmount} / ${expectedAirPerformance}`);
  if (airGroup && airRow) {
    const overridden = await analyticsService.updateOperatorPerformanceOverride({
      month: imported.month,
      operatorName: airGroup.operatorName,
      category: airRow.category,
      rate: 18,
      updatedBy: "verify-import"
    });
    const overriddenAir = overridden.rows.find((group) => group.operatorName === airGroup.operatorName)?.rows.find((row) => row.category === "air_white");
    assertCheck(checks, "Operator performance override persists without changing Excel source", closeEnough(overriddenAir?.commissionAmount ?? 0, (airRow.rawGrossProfit * 18) / 100), `${overriddenAir?.commissionAmount} / ${(airRow.rawGrossProfit * 18) / 100}`);
    const payout = await analyticsService.updateOperatorPerformancePayoutNote(imported.month, "随验证月份工资发放", "verify-import");
    assertCheck(checks, "Operator performance payout note persists", payout.payoutNote === "随验证月份工资发放", payout.payoutNote);
  }

  return {
    month: imported.month,
    buffer,
    fileName,
    batchId: imported.batchId!
  };
}

async function verifyRbac(checks: Check[]) {
  const login = await authService.login("finance", "finance123");
  const payload = parseAuthToken(login.token);
  assertCheck(checks, "Default finance user can login", login.user.role === "finance", login.user.role);
  assertCheck(checks, "Auth token parses role", payload?.role === "finance", payload?.role);
  assertCheck(checks, "Admin can rollback", can("admin", "finance:rollback"));
  assertCheck(checks, "Supervisor can close month", can("supervisor", "finance:close"));
  assertCheck(checks, "Sales cannot rollback", !can("sales", "finance:rollback"));
  assertCheck(checks, "Finance can import", can("finance", "finance:import"));
  assertCheck(checks, "Finance can review risk", can("finance", "risk:review"));
  assertCheck(checks, "Executive cannot write rules", !can("executive", "rules:write"));
}

async function verifyRiskReview(checks: Check[], month: string) {
  const risk = await prisma.riskRecord.findFirst({
    where: { financeOrder: { month } },
    include: { financeOrder: true },
    orderBy: { id: "asc" }
  });
  assertCheck(checks, "Risk record exists for review", Boolean(risk), risk?.financeOrder.orderNo);
  if (!risk) return;

  const reviewed = await riskService.reviewRisk(risk.id, {
    reviewNote: "verify-import 已核对原始 Excel、应收应付和毛利口径，确认风险复核闭环可写库。",
    reviewConclusion: "验证通过，可关闭该风险记录",
    reviewedBy: "verify-import"
  });
  const logs = await workflowService.actionLogs({ month, entityType: "risk_record", entityId: String(risk.id) });

  assertCheck(checks, "Risk review saves status", reviewed.status === "reviewed", reviewed.status);
  assertCheck(checks, "Risk review saves note", reviewed.reviewNote?.includes("确认风险复核闭环") ?? false, reviewed.reviewNote ?? undefined);
  assertCheck(checks, "Risk review saves conclusion", reviewed.reviewConclusion === "验证通过，可关闭该风险记录", reviewed.reviewConclusion ?? undefined);
  assertCheck(checks, "Risk review saves reviewer", reviewed.reviewedBy === "verify-import", reviewed.reviewedBy ?? undefined);
  assertCheck(checks, "Risk review saves reviewedAt", Boolean(reviewed.reviewedAt), reviewed.reviewedAt?.toISOString());
  assertCheck(checks, "Risk review action log written", logs.some((log) => log.action === "review_risk_with_note"), logs.map((log) => log.action).join(","));
}

async function verifyMonthlyReportExport(checks: Check[], month: string) {
  const exported = await reportService.exportMonthlyReport(month);
  const workbook = XLSX.read(exported.buffer, { type: "buffer" });
  const requiredSheets = [
    "CFO管理层摘要",
    "月度营收毛利总览",
    "业务类型利润汇总",
    "单票毛利明细",
    "应收回款跟进表",
    "上游应付分析",
    "供应商应付占比",
    "风险复查",
    "业务员提成汇总",
    "注册服务主管确认",
    "参数规则与假设"
  ];
  const missing = requiredSheets.filter((sheet) => !workbook.SheetNames.includes(sheet));
  const summaryRows = XLSX.utils.sheet_to_json(workbook.Sheets["CFO管理层摘要"] ?? {});

  assertCheck(checks, "Monthly report export returns xlsx file", exported.fileName.endsWith(".xlsx") && exported.buffer.length > 1000, `${exported.fileName} / ${exported.buffer.length}`);
  assertCheck(checks, "Monthly report export includes required sheets", missing.length === 0, missing.join(","));
  assertCheck(checks, "Monthly report export includes CFO summary rows", summaryRows.length >= 5, String(summaryRows.length));
}

async function verifyImportTemplateRegistry(checks: Check[]) {
  const templates = await excelService.listImportTemplates();
  const systemTemplate = templates.find((template) => template.templateKey === "system_waybill_detail");

  assertCheck(checks, "Import template registry returns system template", Boolean(systemTemplate), templates.map((template) => template.templateKey).join(","));
  assertCheck(checks, "Import template registry keeps fixed headers only", (systemTemplate?.headerCount ?? 0) >= 20, `${systemTemplate?.fileName ?? "-"} / ${systemTemplate?.headerCount ?? 0}`);
  assertCheck(checks, "Import template registry keeps readable file name", Boolean(systemTemplate?.fileName && systemTemplate.fileName.endsWith(".xlsx")), systemTemplate?.fileName);
  assertCheck(checks, "Import template registry includes order number header", Boolean(systemTemplate?.headers.includes("运单号")), systemTemplate?.headers.join(","));
}

async function verifySystemBackupExport(checks: Check[], month: string) {
  const exported = await workflowService.exportSystemBackup(month);
  const workbook = XLSX.read(exported.buffer, { type: "buffer" });
  const requiredSheets = [
    "backup_readme",
    "finance_summaries",
    "import_batches",
    "excel_templates",
    "parameter_rules",
    "month_closes",
    "confirmation_docs",
    "action_logs",
    "export_jobs"
  ];
  const missing = requiredSheets.filter((sheet) => !workbook.SheetNames.includes(sheet));
  const summaryRows = XLSX.utils.sheet_to_json(workbook.Sheets["backup_readme"] ?? {});

  assertCheck(checks, "System backup export returns xlsx file", exported.fileName.endsWith(".xlsx") && exported.buffer.length > 1000, `${exported.fileName} / ${exported.buffer.length}`);
  assertCheck(checks, "System backup export includes required sheets", missing.length === 0, missing.join(","));
  assertCheck(checks, "System backup export includes backup summary", summaryRows.length >= 5, String(summaryRows.length));
}

async function verifySignature(checks: Check[], month: string) {
  const docs = await workflowService.generateLogisticsDocuments(month);
  const first = docs[0];
  assertCheck(checks, "Signature documents generated", Boolean(first), String(docs.length));
  if (!first) return;

  let supervisorBlockedBeforeEmployeeSign = false;
  try {
    await workflowService.supervisorConfirm(first.id, {
      ip: "127.0.0.1",
      userAgent: "verify-import-supervisor",
      role: "supervisor"
    });
  } catch (error) {
    supervisorBlockedBeforeEmployeeSign = String((error as Error).message).includes("employee must sign");
  }
  assertCheck(checks, "Supervisor confirmation requires employee signature", supervisorBlockedBeforeEmployeeSign);

  const confirmationFile = await workflowService.downloadConfirmationDocument(first.id);
  const confirmationWorkbook = XLSX.read(confirmationFile.buffer, { type: "buffer" });
  assertCheck(checks, "Confirmation document export returns xlsx", confirmationFile.fileName.endsWith(".xlsx") && confirmationFile.buffer.length > 1000, `${confirmationFile.fileName} / ${confirmationFile.buffer.length}`);
  assertCheck(
    checks,
    "Confirmation document export includes sheets",
    ["summary", "details", "charge_lines", "signature_evidence"].every((sheet) => confirmationWorkbook.SheetNames.includes(sheet)),
    confirmationWorkbook.SheetNames.join(",")
  );
  const [confirmationPdf, confirmationPng] = await Promise.all([
    workflowService.downloadConfirmationDocument(first.id, "pdf"),
    workflowService.downloadConfirmationDocument(first.id, "png")
  ]);
  assertCheck(
    checks,
    "Confirmation PDF uses the same document version",
    confirmationPdf.fileName.replace(/\.pdf$/, "") === confirmationFile.fileName.replace(/\.xlsx$/, "") && confirmationPdf.buffer.subarray(0, 4).toString() === "%PDF",
    `${confirmationPdf.fileName} / ${confirmationFile.fileName}`
  );
  assertCheck(
    checks,
    "Confirmation PNG uses the same document version",
    confirmationPng.fileName.replace(/\.png$/, "") === confirmationFile.fileName.replace(/\.xlsx$/, "") && confirmationPng.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    `${confirmationPng.fileName} / ${confirmationFile.fileName}`
  );

  const sent = await workflowService.sendSignatureLink(first.id);
  assertCheck(checks, "Signature token generated", Boolean(sent.signatureToken), sent.signatureToken ?? undefined);
  assertCheck(checks, "Signature token expiry generated", Boolean(sent.signatureTokenExpiresAt), sent.signatureTokenExpiresAt?.toISOString());

  const publicDocument = await workflowService.publicSignatureDocument(sent.signatureToken!);
  assertCheck(checks, "Public signature document returns owner snapshot", publicDocument.document.ownerName === first.ownerName, publicDocument.document.ownerName);
  assertCheck(checks, "Public signature document returns order details", Array.isArray(publicDocument.payload.details), String(publicDocument.payload.details.length));

  const signed = await workflowService.signByToken(sent.signatureToken!, {
    ip: "127.0.0.1",
    userAgent: "verify-import-employee",
    role: "sales",
    signedName: first.ownerName,
    acceptedStatement: true
  });
  assertCheck(checks, "Employee signed by token", signed.signatureStatus === "signed", signed.signatureStatus);
  assertCheck(checks, "Employee evidence stored", Boolean(signed.signatureEvidenceJson), signed.signatureEvidenceJson ?? undefined);

  const regenerated = await workflowService.generateLogisticsDocuments(month);
  const preserved = regenerated.find((document) => document.id === signed.id);
  assertCheck(
    checks,
    "Regeneration preserves signed confirmation snapshot",
    preserved?.signatureStatus === "signed" && preserved?.signatureToken === null,
    JSON.stringify({ id: preserved?.id, signatureStatus: preserved?.signatureStatus, signatureToken: preserved?.signatureToken })
  );

  const confirmed = await workflowService.supervisorConfirm(first.id, {
    ip: "127.0.0.1",
    userAgent: "verify-import-supervisor",
    role: "supervisor"
  });
  const evidence = confirmed.signatureEvidenceJson ? JSON.parse(confirmed.signatureEvidenceJson) : null;
  assertCheck(checks, "Supervisor confirmed", confirmed.supervisorStatus === "confirmed", confirmed.supervisorStatus);
  assertCheck(checks, "Supervisor evidence stored", evidence?.supervisor?.role === "supervisor", JSON.stringify(evidence));
}

async function verifySalaryDocuments(checks: Check[], month: string) {
  const [documents, performance] = await Promise.all([
    workflowService.generateSalaryDocuments(month),
    analyticsService.operatorPerformanceWithSettings(month)
  ]);
  const salesDocuments = documents.filter((document) => document.documentType === "sales_salary");
  const customerServiceDocuments = documents.filter((document) => document.documentType === "customer_service_salary");
  const commissionRows = await prisma.commissionRecord.findMany({
    where: { financeOrder: { month } }
  });
  const expectedSalesAmount = commissionRows.reduce((sum, row) => sum + (row.manualCommissionAmount ?? row.commissionAmount), 0);
  const actualSalesAmount = salesDocuments.reduce((sum, row) => sum + row.commissionAmount, 0);
  const expectedCustomerServiceAmount = performance.rows.reduce((sum, row) => sum + row.payablePerformance, 0);
  const actualCustomerServiceAmount = customerServiceDocuments.reduce((sum, row) => sum + row.commissionAmount, 0);
  const salaryPayload = salesDocuments[0]?.payloadJson ? JSON.parse(salesDocuments[0].payloadJson) : null;

  assertCheck(checks, "Sales salary documents generated", salesDocuments.length > 0, String(salesDocuments.length));
  assertCheck(checks, "Customer service salary documents generated", customerServiceDocuments.length === performance.rows.length, `${customerServiceDocuments.length} / ${performance.rows.length}`);
  assertCheck(checks, "Sales salary total matches commission records", closeEnough(actualSalesAmount, expectedSalesAmount), `${actualSalesAmount} / ${expectedSalesAmount}`);
  assertCheck(checks, "Customer service salary total matches performance", closeEnough(actualCustomerServiceAmount, expectedCustomerServiceAmount), `${actualCustomerServiceAmount} / ${expectedCustomerServiceAmount}`);
  assertCheck(checks, "Salary document snapshot records imported source", Boolean(salaryPayload?.sourceFileName) && Boolean(salaryPayload?.importBatchNo) && Array.isArray(salaryPayload?.details), JSON.stringify(salaryPayload && { sourceFileName: salaryPayload.sourceFileName, importBatchNo: salaryPayload.importBatchNo, detailCount: salaryPayload.details.length }));
}

async function verifyAging(checks: Check[], month: string) {
  const [receivables, payables] = await Promise.all([
    receivableService.listReceivables(month),
    payableService.listPayables(month)
  ]);
  const receivableOutstanding = receivables.rows.reduce((sum, row) => sum + row.outstandingReceivable, 0);
  const receivableBuckets = Object.values(receivables.agingBuckets).reduce((sum, value) => sum + value, 0);
  const payableOutstanding = payables.rows.reduce((sum, row) => sum + row.outstandingPayable, 0);
  const payableBuckets = Object.values(payables.agingBuckets).reduce((sum, value) => sum + value, 0);

  assertCheck(checks, "Receivable aging rows generated", receivables.rows.length > 0, String(receivables.rows.length));
  assertCheck(checks, "Receivable customer aging generated", receivables.customerAging.length > 0, String(receivables.customerAging.length));
  assertCheck(checks, "Receivable outstanding matches rows", closeEnough(receivables.totals.totalOutstanding, receivableOutstanding), `${receivables.totals.totalOutstanding} / ${receivableOutstanding}`);
  assertCheck(checks, "Receivable buckets match outstanding", closeEnough(receivableBuckets, receivableOutstanding), `${receivableBuckets} / ${receivableOutstanding}`);

  assertCheck(checks, "Payable aging rows generated", payables.rows.length > 0, String(payables.rows.length));
  assertCheck(checks, "Payable supplier aging generated", payables.supplierAging.length > 0, String(payables.supplierAging.length));
  assertCheck(checks, "Payable outstanding matches rows", closeEnough(payables.totals.totalOutstanding, payableOutstanding), `${payables.totals.totalOutstanding} / ${payableOutstanding}`);
  assertCheck(checks, "Payable buckets match outstanding", closeEnough(payableBuckets, payableOutstanding), `${payableBuckets} / ${payableOutstanding}`);
}

async function verifySettlements(checks: Check[], month: string) {
  const order = await prisma.financeOrder.findFirstOrThrow({
    where: {
      month,
      isServiceBusiness: false,
      adjustedReceivable: { gt: 100 },
      adjustedPayable: { gt: 100 }
    },
    orderBy: { orderNo: "asc" }
  });

  const receipt = await settlementService.recordReceipt(order.id, {
    amount: 100,
    operator: "verify-import",
    note: "verification receipt"
  });
  const payment = await settlementService.recordPayment(order.id, {
    amount: 80,
    operator: "verify-import",
    note: "verification payment"
  });

  const [updatedOrder, summary, receivables, payables, logs] = await Promise.all([
    prisma.financeOrder.findUniqueOrThrow({ where: { id: order.id } }),
    prisma.financeSummary.findUniqueOrThrow({ where: { month } }),
    receivableService.listReceivables(month),
    payableService.listPayables(month),
    workflowService.actionLogs({ month, entityType: "settlement_record" })
  ]);

  assertCheck(checks, "Receipt updates order received amount", closeEnough(updatedOrder.receivedAmount, 100), String(updatedOrder.receivedAmount));
  assertCheck(checks, "Payment updates order paid amount", closeEnough(updatedOrder.paidAmount, 80), String(updatedOrder.paidAmount));
  assertCheck(checks, "Receipt sets partial received status", updatedOrder.receivableStatus === "partial_received", updatedOrder.receivableStatus);
  assertCheck(checks, "Payment sets partial paid status", updatedOrder.payableStatus === "partial_paid", updatedOrder.payableStatus);
  assertCheck(checks, "Summary total received updated", closeEnough(summary.totalReceived, 100), String(summary.totalReceived));
  assertCheck(checks, "Summary total paid updated", closeEnough(summary.totalPaid, 80), String(summary.totalPaid));

  const receivableRow = receivables.rows.find((row) => row.id === order.id);
  const payableRow = payables.rows.find((row) => row.id === order.id);
  assertCheck(checks, "Receivable aging reflects receipt", closeEnough(receivableRow?.outstandingReceivable ?? 0, order.adjustedReceivable - 100), `${receivableRow?.outstandingReceivable}`);
  assertCheck(checks, "Payable aging reflects payment", closeEnough(payableRow?.outstandingPayable ?? 0, order.adjustedPayable - 80), `${payableRow?.outstandingPayable}`);
  assertCheck(checks, "Settlement action logs written", logs.some((log) => log.action === "record_receipt") && logs.some((log) => log.action === "record_payment"), logs.map((log) => log.action).join(","));

  await settlementService.voidReceipt(receipt.record.id, {
    operator: "verify-import",
    reason: "verification void receipt"
  });
  await settlementService.voidPayment(payment.record.id, {
    operator: "verify-import",
    reason: "verification void payment"
  });

  const [voidedOrder, voidedSummary, voidLogs] = await Promise.all([
    prisma.financeOrder.findUniqueOrThrow({ where: { id: order.id } }),
    prisma.financeSummary.findUniqueOrThrow({ where: { month } }),
    workflowService.actionLogs({ month, entityType: "settlement_record" })
  ]);
  assertCheck(checks, "Voiding receipt restores received amount", closeEnough(voidedOrder.receivedAmount, 0), String(voidedOrder.receivedAmount));
  assertCheck(checks, "Voiding payment restores paid amount", closeEnough(voidedOrder.paidAmount, 0), String(voidedOrder.paidAmount));
  assertCheck(checks, "Voiding receipt restores receivable status", voidedOrder.receivableStatus === "unreceived", voidedOrder.receivableStatus);
  assertCheck(checks, "Voiding payment restores payable status", voidedOrder.payableStatus === "unpaid", voidedOrder.payableStatus);
  assertCheck(checks, "Voiding restores summary received", closeEnough(voidedSummary.totalReceived, 0), String(voidedSummary.totalReceived));
  assertCheck(checks, "Voiding restores summary paid", closeEnough(voidedSummary.totalPaid, 0), String(voidedSummary.totalPaid));
  assertCheck(checks, "Settlement void action logs written", voidLogs.some((log) => log.action === "void_receipt") && voidLogs.some((log) => log.action === "void_payment"), voidLogs.map((log) => log.action).join(","));
}

async function verifyMonthClose(
  checks: Check[],
  input: { month: string; buffer: Buffer; fileName: string; batchId: number }
) {
  let closeBlockedBeforeReady = false;
  try {
    await workflowService.lockMonth(input.month, {
      operator: "verify-import",
      note: "Verify close blockers"
    });
  } catch (error) {
    closeBlockedBeforeReady = String((error as Error).message).includes("Month close blocked");
  }
  assertCheck(checks, "Month close blocks unfinished workflow", closeBlockedBeforeReady);

  await Promise.all([
    prisma.riskRecord.updateMany({
      where: { financeOrder: { month: input.month } },
      data: { status: "reviewed", reviewedBy: "verify-import", reviewedAt: new Date(), reviewConclusion: "verification ready" }
    }),
    prisma.serviceBusinessRecord.updateMany({
      where: { financeOrder: { month: input.month } },
      data: { confirmStatus: "confirmed" }
    }),
    prisma.confirmationDocument.updateMany({
      where: { month: input.month, documentStatus: { not: "voided" } },
      data: { signatureStatus: "signed", supervisorStatus: "confirmed", sendStatus: "sent", signedAt: new Date(), confirmedAt: new Date() }
    }),
    prisma.financeOrder.updateMany({
      where: { month: input.month },
      data: { receivableStatus: "settled", payableStatus: "settled" }
    })
  ]);

  const locked = await workflowService.lockMonth(input.month, {
    operator: "verify-import",
    note: "Lock month for verification"
  });
  assertCheck(checks, "Month close locks month", locked.status === "locked", locked.status);

  let importBlocked = false;
  try {
    await excelService.importWorkbook(input.buffer, input.fileName);
  } catch (error) {
    importBlocked = String((error as Error).message).includes("已锁账");
  }
  assertCheck(checks, "Locked month blocks Excel import", importBlocked);

  let rollbackBlocked = false;
  try {
    await excelService.rollbackImportBatch(input.batchId);
  } catch (error) {
    rollbackBlocked = String((error as Error).message).includes("已锁账");
  }
  assertCheck(checks, "Locked month blocks import rollback", rollbackBlocked);

  const unlocked = await workflowService.unlockMonth(input.month, {
    operator: "verify-import",
    note: "Unlock month after verification"
  });
  assertCheck(checks, "Month close unlocks month", unlocked.status === "open", unlocked.status);
  const closeLogs = await workflowService.actionLogs({ month: input.month, entityType: "month_close", entityId: input.month });
  assertCheck(checks, "Month close action logs written", closeLogs.some((log) => log.action === "lock_month") && closeLogs.some((log) => log.action === "unlock_month"), closeLogs.map((log) => log.action).join(","));
}

async function main() {
  const checks: Check[] = [];
  const imported = await verifyImport(checks);
  await verifyRbac(checks);
  await verifyRiskReview(checks, imported.month);
  await verifyImportTemplateRegistry(checks);
  await verifyMonthlyReportExport(checks, imported.month);
  await verifySystemBackupExport(checks, imported.month);
  await verifySignature(checks, imported.month);
  await verifySalaryDocuments(checks, imported.month);
  await verifyAging(checks, imported.month);
  await verifySettlements(checks, imported.month);
  await verifyMonthClose(checks, imported);

  const failed = checks.filter((check) => !check.pass);
  for (const check of checks) {
    const mark = check.pass ? "PASS" : "FAIL";
    console.log(`${mark} ${check.name}${check.detail ? `: ${check.detail}` : ""}`);
  }

  await prisma.$disconnect();

  if (failed.length) {
    throw new Error(`${failed.length} verification checks failed`);
  }

  console.log("Verification completed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(async (error) => {
    await prisma.$disconnect();
    console.error(error);
    process.exit(1);
  });
}
