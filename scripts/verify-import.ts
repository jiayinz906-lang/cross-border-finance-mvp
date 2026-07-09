import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { can } from "../server/src/config/rbac.js";
import { prisma } from "../server/src/prisma/client.js";
import { excelService } from "../server/src/services/excel.service.js";
import { workflowService } from "../server/src/services/workflow.service.js";

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

  const imported = await excelService.importWorkbook(buffer, fileName);
  assertCheck(checks, "Import returns batch", Boolean(imported.batchId && imported.batchNo), imported.batchNo);

  const [orders, summary, batch, commissions, risks, services] = await Promise.all([
    prisma.financeOrder.findMany({ where: { month: imported.month } }),
    prisma.financeSummary.findUnique({ where: { month: imported.month } }),
    prisma.importBatch.findUnique({ where: { id: imported.batchId } }),
    prisma.commissionRecord.findMany({ where: { financeOrder: { month: imported.month } } }),
    prisma.riskRecord.findMany({ where: { financeOrder: { month: imported.month } } }),
    prisma.serviceBusinessRecord.findMany({ where: { financeOrder: { month: imported.month } } })
  ]);
  const rawLines = await excelService.listRawLedgerLines({ batchId: imported.batchId });

  const orderReceivable = orders.reduce((sum, order) => sum + order.adjustedReceivable, 0);
  const orderPayable = orders.reduce((sum, order) => sum + order.adjustedPayable, 0);
  const orderProfit = orders.reduce((sum, order) => sum + order.adjustedGrossProfit, 0);

  assertCheck(checks, "Database order count", orders.length === 25, String(orders.length));
  assertCheck(checks, "Database service order count", orders.filter((order) => order.isServiceBusiness).length === 3, String(orders.filter((order) => order.isServiceBusiness).length));
  assertCheck(checks, "Commission records generated", commissions.length === 22, String(commissions.length));
  assertCheck(checks, "Service confirmation records generated", services.length === 3, String(services.length));
  assertCheck(checks, "Risk records generated", risks.length >= 1, String(risks.length));
  assertCheck(checks, "Raw ledger lines stored", rawLines.rows.length === preview.importedRows, `${rawLines.rows.length} / ${preview.importedRows}`);
  assertCheck(checks, "Raw ledger line keeps original row json", Boolean(rawLines.rows[0]?.raw && Object.keys(rawLines.rows[0].raw).length), JSON.stringify(rawLines.rows[0]?.raw));
  assertCheck(checks, "Raw ledger line keeps canonical fields", Boolean(rawLines.rows.find((line) => line.orderNo)?.canonical?.orderNo), JSON.stringify(rawLines.rows.find((line) => line.orderNo)?.canonical));
  assertCheck(checks, "Batch is active", batch?.status === "active", batch?.status);
  assertCheck(checks, "Summary exists", Boolean(summary), summary?.month);
  assertCheck(checks, "Summary receivable matches orders", closeEnough(summary?.totalReceivable ?? 0, orderReceivable), `${summary?.totalReceivable} / ${orderReceivable}`);
  assertCheck(checks, "Summary payable matches orders", closeEnough(summary?.totalPayable ?? 0, orderPayable), `${summary?.totalPayable} / ${orderPayable}`);
  assertCheck(checks, "Summary profit matches orders", closeEnough(summary?.totalGrossProfit ?? 0, orderProfit), `${summary?.totalGrossProfit} / ${orderProfit}`);

  return {
    month: imported.month,
    buffer,
    fileName,
    batchId: imported.batchId!
  };
}

async function verifyRbac(checks: Check[]) {
  assertCheck(checks, "Admin can rollback", can("admin", "finance:rollback"));
  assertCheck(checks, "Supervisor can close month", can("supervisor", "finance:close"));
  assertCheck(checks, "Sales cannot rollback", !can("sales", "finance:rollback"));
  assertCheck(checks, "Finance can import", can("finance", "finance:import"));
  assertCheck(checks, "Executive cannot write rules", !can("executive", "rules:write"));
}

async function verifySignature(checks: Check[], month: string) {
  const docs = await workflowService.generateLogisticsDocuments(month);
  const first = docs[0];
  assertCheck(checks, "Signature documents generated", Boolean(first), String(docs.length));
  if (!first) return;

  const sent = await workflowService.sendSignatureLink(first.id);
  assertCheck(checks, "Signature token generated", Boolean(sent.signatureToken), sent.signatureToken ?? undefined);
  assertCheck(checks, "Signature token expiry generated", Boolean(sent.signatureTokenExpiresAt), sent.signatureTokenExpiresAt?.toISOString());

  const signed = await workflowService.signByToken(sent.signatureToken!, {
    ip: "127.0.0.1",
    userAgent: "verify-import-employee",
    role: "sales"
  });
  assertCheck(checks, "Employee signed by token", signed.signatureStatus === "signed", signed.signatureStatus);
  assertCheck(checks, "Employee evidence stored", Boolean(signed.signatureEvidenceJson), signed.signatureEvidenceJson ?? undefined);

  const confirmed = await workflowService.supervisorConfirm(first.id, {
    ip: "127.0.0.1",
    userAgent: "verify-import-supervisor",
    role: "supervisor"
  });
  const evidence = confirmed.signatureEvidenceJson ? JSON.parse(confirmed.signatureEvidenceJson) : null;
  assertCheck(checks, "Supervisor confirmed", confirmed.supervisorStatus === "confirmed", confirmed.supervisorStatus);
  assertCheck(checks, "Supervisor evidence stored", evidence?.supervisor?.role === "supervisor", JSON.stringify(evidence));
}

async function verifyMonthClose(
  checks: Check[],
  input: { month: string; buffer: Buffer; fileName: string; batchId: number }
) {
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
}

async function main() {
  const checks: Check[] = [];
  const imported = await verifyImport(checks);
  await verifyRbac(checks);
  await verifySignature(checks, imported.month);
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
