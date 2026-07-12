import type { Request, Response } from "express";
import { prisma } from "../prisma/client.js";
import { env } from "../config/env.js";
import { currentIsoTimestamp } from "../utils/date.js";

export function healthController(_req: Request, res: Response) {
  res.json({
    status: "ok",
    service: "cross-border-finance-server",
    timestamp: currentIsoTimestamp()
  });
}

export async function readinessController(req: Request, res: Response) {
  const month = typeof req.query.month === "string" ? req.query.month : "2026-06";
  const checks = {
    database: false,
    importTemplate: false,
    parameterRules: false,
    financeSummary: false
  };
  const details: Record<string, unknown> = {};

  try {
    const [templateCount, ruleCount, summary, latestBatch] = await Promise.all([
      prisma.excelImportTemplate.count({ where: { templateKey: "system_waybill_detail" } }),
      prisma.parameterRule.count({ where: { isActive: true } }),
      prisma.financeSummary.findUnique({ where: { month } }),
      prisma.importBatch.findFirst({
        where: { month },
        orderBy: { createdAt: "desc" }
      })
    ]);

    checks.database = true;
    checks.importTemplate = templateCount > 0;
    checks.parameterRules = ruleCount > 0;
    // A new deployment is valid before its first Excel import. Keep this
    // diagnostic visible without making an intentionally empty database fail
    // the platform readiness probe.
    checks.financeSummary = true;
    details.templateCount = templateCount;
    details.activeRuleCount = ruleCount;
    details.month = month;
    details.environment = env.nodeEnv;
    details.version = process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || "local";
    details.latestImportBatch = latestBatch ? {
      batchNo: latestBatch.batchNo,
      fileName: latestBatch.fileName,
      status: latestBatch.status,
      importedRows: latestBatch.importedRows,
      importedOrders: latestBatch.importedOrders,
      logisticsOrders: latestBatch.logisticsOrders,
      serviceOrders: latestBatch.serviceOrders,
      createdAt: latestBatch.createdAt
    } : null;
    details.summary = summary ? {
      totalReceivable: summary.totalReceivable,
      totalPayable: summary.totalPayable,
      totalGrossProfit: summary.totalGrossProfit,
      riskOrderCount: summary.riskOrderCount,
      updatedAt: summary.updatedAt
    } : null;
    details.businessDataInitialized = Boolean(summary);
  } catch (error) {
    details.error = error instanceof Error ? error.message : String(error);
  }

  const ready = Object.values(checks).every(Boolean);
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    service: "cross-border-finance-server",
    timestamp: currentIsoTimestamp(),
    checks,
    details
  });
}
