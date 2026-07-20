import type { Request, Response } from "express";
import { prisma } from "../prisma/client.js";
import { env } from "../config/env.js";
import { getOperationsSnapshot, recordOperationalError } from "../runtime/operations.js";
import { currentIsoTimestamp } from "../utils/date.js";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms.`)), timeoutMs);
    timer.unref?.();

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function probeDatabase() {
  const startedAt = process.hrtime.bigint();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, env.healthDbTimeoutMs, "Database health check");
    return {
      ok: true,
      latencyMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000)
    };
  } catch (error) {
    recordOperationalError(error, { scope: "health", operation: "database_probe" });
    return {
      ok: false,
      latencyMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function healthController(_req: Request, res: Response) {
  const operations = getOperationsSnapshot();
  res.json({
    status: "ok",
    service: "cross-border-finance-server",
    timestamp: currentIsoTimestamp(),
    version: process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || "local",
    uptimeSeconds: operations.uptimeSeconds
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
    const database = await probeDatabase();
    if (!database.ok) throw new Error(database.error || "Database is unavailable.");
    const [templateCount, ruleCount, summary, latestBatch] = await withTimeout(Promise.all([
        prisma.excelImportTemplate.count({ where: { templateKey: "system_waybill_detail" } }),
        prisma.parameterRule.count({ where: { isActive: true } }),
        prisma.financeSummary.findUnique({ where: { month } }),
        prisma.importBatch.findFirst({
          where: { month },
          orderBy: { createdAt: "desc" }
        })
      ]), env.healthDbTimeoutMs, "Readiness query");

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
    details.databaseLatencyMs = database.latencyMs;
    details.uptimeSeconds = getOperationsSnapshot().uptimeSeconds;
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

export async function operationsController(_req: Request, res: Response) {
  const database = await probeDatabase();
  const runtime = getOperationsSnapshot();
  const status = database.ok ? "healthy" : "degraded";

  res.status(database.ok ? 200 : 503).json({
    status,
    service: "cross-border-finance-server",
    timestamp: currentIsoTimestamp(),
    version: process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || "local",
    environment: env.nodeEnv,
    database,
    runtime,
    configuration: {
      authRequired: env.authRequireToken,
      headerRoleAllowed: env.allowHeaderRole,
      uploadMaxMb: env.uploadMaxMb,
      slowRequestThresholdMs: env.slowRequestThresholdMs,
      httpRequestTimeoutMs: env.httpRequestTimeoutMs,
      dingtalkConfigured: Boolean(env.dingtalkAppKey && env.dingtalkAppSecret && env.dingtalkRobotCode) || Boolean(env.dingtalkWebhookUrl),
      erpnextConfigured: Boolean(env.erpnextBaseUrl && env.erpnextApiKey && env.erpnextApiSecret)
    }
  });
}
