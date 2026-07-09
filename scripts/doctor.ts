import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";

type Check = {
  name: string;
  pass: boolean;
  detail?: string;
};

type ResponsePayload = {
  statusCode: number;
  body: string;
};

const projectRoot = process.cwd();
const clientUrl = process.env.UI_SMOKE_CLIENT_URL || "http://localhost:5173/";
const apiUrl = process.env.UI_SMOKE_API_URL || "http://localhost:4000/api";
const month = process.env.FINANCE_DOCTOR_MONTH || "2026-06";

function requestText(url: string): Promise<ResponsePayload> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(url, { timeout: 8000, headers: { "x-finance-role": "admin" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body }));
    });
    req.on("timeout", () => {
      req.destroy(new Error(`Request timeout: ${url}`));
    });
    req.on("error", reject);
  });
}

async function requestJson<T>(url: string): Promise<T> {
  const res = await requestText(url);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`${url} returned ${res.statusCode}: ${res.body.slice(0, 200)}`);
  }
  return JSON.parse(res.body) as T;
}

function push(checks: Check[], name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
}

function money(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "NaN";
}

async function main() {
  const checks: Check[] = [];
  const dbPath = path.join(projectRoot, "prisma", "dev.db");

  push(checks, "SQLite database exists", fs.existsSync(dbPath), dbPath);

  const frontend = await requestText(clientUrl);
  push(checks, "Frontend is reachable", frontend.statusCode === 200 && frontend.body.includes("<!doctype html>"), `${clientUrl} -> ${frontend.statusCode}`);

  const health = await requestJson<{ status?: string; service?: string }>(`${apiUrl}/health`);
  push(checks, "Backend health is ok", health.status === "ok", JSON.stringify(health));

  const readiness = await requestJson<{
    status?: string;
    checks?: Record<string, boolean>;
    details?: {
      templateCount?: number;
      latestImportBatch?: { batchNo?: string; importedRows?: number; importedOrders?: number; logisticsOrders?: number; serviceOrders?: number } | null;
    };
  }>(`${apiUrl}/health/ready?month=${encodeURIComponent(month)}`);
  push(checks, "Backend readiness is ready", readiness.status === "ready", JSON.stringify(readiness.checks));
  push(checks, "Readiness checks are all true", Object.values(readiness.checks ?? {}).every(Boolean), JSON.stringify(readiness.checks));
  push(checks, "Latest import batch exists", Boolean(readiness.details?.latestImportBatch?.batchNo), JSON.stringify(readiness.details?.latestImportBatch));

  const templates = await requestJson<{ rows?: Array<{ templateKey: string; fileName: string; headerCount: number; headers: string[] }> }>(`${apiUrl}/finance/import-templates`);
  const systemTemplate = templates.rows?.find((row) => row.templateKey === "system_waybill_detail");
  push(checks, "System import template exists", Boolean(systemTemplate), templates.rows?.map((row) => row.templateKey).join(","));
  push(checks, "System import template has 23 headers", systemTemplate?.headerCount === 23, `${systemTemplate?.fileName ?? "-"} / ${systemTemplate?.headerCount ?? 0}`);
  push(checks, "Template includes required core columns", Boolean(systemTemplate?.headers[0]) && Boolean(systemTemplate?.headers[8]) && Boolean(systemTemplate?.headers[9]), JSON.stringify(systemTemplate?.headers.slice(0, 10)));

  const dashboard = await requestJson<{
    summary?: { totalReceivable?: number; totalPayable?: number; totalGrossProfit?: number; grossProfitRate?: number };
    businessSummary?: unknown[];
  }>(`${apiUrl}/finance/dashboard?month=${encodeURIComponent(month)}`);
  push(
    checks,
    "Dashboard summary has finance totals",
    Number(dashboard.summary?.totalReceivable ?? 0) > 0 && Number(dashboard.summary?.totalPayable ?? 0) > 0,
    `receivable=${money(dashboard.summary?.totalReceivable)}, payable=${money(dashboard.summary?.totalPayable)}, profit=${money(dashboard.summary?.totalGrossProfit)}`
  );
  push(checks, "Dashboard has business summary rows", Array.isArray(dashboard.businessSummary) && dashboard.businessSummary.length > 0, String(dashboard.businessSummary?.length ?? 0));

  for (const check of checks) {
    console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}${check.detail ? `: ${check.detail}` : ""}`);
  }

  const failed = checks.filter((check) => !check.pass);
  if (failed.length) {
    throw new Error(`${failed.length} doctor checks failed`);
  }

  console.log("");
  console.log("Finance system doctor passed.");
  console.log(`Frontend: ${clientUrl}`);
  console.log(`Backend:  ${apiUrl}`);
  console.log(`Month:    ${month}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
