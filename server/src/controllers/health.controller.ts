import type { Request, Response } from "express";
import { prisma } from "../prisma/client.js";
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
    const [templateCount, ruleCount, summary] = await Promise.all([
      prisma.excelImportTemplate.count({ where: { templateKey: "system_waybill_detail" } }),
      prisma.parameterRule.count({ where: { isActive: true } }),
      prisma.financeSummary.findUnique({ where: { month } })
    ]);

    checks.database = true;
    checks.importTemplate = templateCount > 0;
    checks.parameterRules = ruleCount > 0;
    checks.financeSummary = Boolean(summary);
    details.templateCount = templateCount;
    details.activeRuleCount = ruleCount;
    details.month = month;
    details.summary = summary ? {
      totalReceivable: summary.totalReceivable,
      totalPayable: summary.totalPayable,
      totalGrossProfit: summary.totalGrossProfit,
      riskOrderCount: summary.riskOrderCount,
      updatedAt: summary.updatedAt
    } : null;
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
