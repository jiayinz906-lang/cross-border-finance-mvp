import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { excelService } from "../server/src/services/excel.service.js";
import { prisma } from "../server/src/prisma/client.js";

type Check = {
  name: string;
  pass: boolean;
  detail?: string;
};

const defaultExcelPath = "D:/Users/DELL/Desktop/2026.6月系统运单明细.xlsx";
const excelPath = process.env.IMPORT_VERIFY_FILE || defaultExcelPath;

function assertCheck(checks: Check[], name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
}

function closeEnough(a: number, b: number, tolerance = 0.01) {
  return Math.abs(a - b) <= tolerance;
}

async function main() {
  const checks: Check[] = [];

  assertCheck(checks, "Excel file exists", fs.existsSync(excelPath), excelPath);
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Verification Excel not found: ${excelPath}`);
  }

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

  const orderReceivable = orders.reduce((sum, order) => sum + order.adjustedReceivable, 0);
  const orderPayable = orders.reduce((sum, order) => sum + order.adjustedPayable, 0);
  const orderProfit = orders.reduce((sum, order) => sum + order.adjustedGrossProfit, 0);

  assertCheck(checks, "Database order count", orders.length === 25, String(orders.length));
  assertCheck(checks, "Database service order count", orders.filter((order) => order.isServiceBusiness).length === 3, String(orders.filter((order) => order.isServiceBusiness).length));
  assertCheck(checks, "Commission records generated", commissions.length === 22, String(commissions.length));
  assertCheck(checks, "Service confirmation records generated", services.length === 3, String(services.length));
  assertCheck(checks, "Risk records generated", risks.length >= 1, String(risks.length));
  assertCheck(checks, "Batch is active", batch?.status === "active", batch?.status);
  assertCheck(checks, "Summary exists", Boolean(summary), summary?.month);
  assertCheck(checks, "Summary receivable matches orders", closeEnough(summary?.totalReceivable ?? 0, orderReceivable), `${summary?.totalReceivable} / ${orderReceivable}`);
  assertCheck(checks, "Summary payable matches orders", closeEnough(summary?.totalPayable ?? 0, orderPayable), `${summary?.totalPayable} / ${orderPayable}`);
  assertCheck(checks, "Summary profit matches orders", closeEnough(summary?.totalGrossProfit ?? 0, orderProfit), `${summary?.totalGrossProfit} / ${orderProfit}`);

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
