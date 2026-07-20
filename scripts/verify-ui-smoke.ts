import http from "node:http";
import https from "node:https";

type Check = {
  name: string;
  pass: boolean;
  detail?: string;
};

type ResponsePayload = {
  statusCode: number;
  body: string;
};

const clientUrl = process.env.UI_SMOKE_CLIENT_URL || "http://localhost:5173/";
const apiUrl = process.env.UI_SMOKE_API_URL || "http://localhost:4000/api";
let authToken = "";

function requestText(url: string): Promise<ResponsePayload> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(url, { timeout: 10000, headers: authToken ? { authorization: `Bearer ${authToken}` } : {} }, (res) => {
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

function requestPost(url: string, body: unknown): Promise<ResponsePayload> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const payload = JSON.stringify(body);
    const req = client.request(url, { method: "POST", timeout: 10000, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: responseBody }));
    });
    req.on("timeout", () => req.destroy(new Error(`Request timeout: ${url}`)));
    req.on("error", reject);
    req.end(payload);
  });
}

async function requestJson<T>(url: string): Promise<T> {
  const res = await requestText(url);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`${url} returned ${res.statusCode}: ${res.body.slice(0, 200)}`);
  }
  return JSON.parse(res.body) as T;
}

async function retry<T>(fn: () => Promise<T>, isReady: (value: T) => boolean, attempts = 5): Promise<T> {
  let lastValue: T | undefined;
  for (let index = 0; index < attempts; index += 1) {
    lastValue = await fn();
    if (isReady(lastValue)) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  return lastValue as T;
}

function push(checks: Check[], name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
}

async function main() {
  const checks: Check[] = [];

  const frontend = await requestText(clientUrl);
  push(checks, "Frontend returns HTML", frontend.statusCode === 200 && frontend.body.includes("<!doctype html>"), `${frontend.statusCode}`);

  const health = await requestJson<{ status?: string; service?: string }>(`${apiUrl}/health`);
  push(checks, "Backend health is ok", health.status === "ok", JSON.stringify(health));

  const login = await requestPost(`${apiUrl}/auth/login`, { username: process.env.UI_SMOKE_USERNAME || "admin", password: process.env.UI_SMOKE_PASSWORD || "admin123" });
  if (login.statusCode < 200 || login.statusCode >= 300) throw new Error(`Smoke-test login failed: ${login.statusCode} ${login.body.slice(0, 200)}`);
  authToken = JSON.parse(login.body).token as string;
  push(checks, "Authenticated admin session established", Boolean(authToken));

  const readiness = await requestJson<{ status?: string; checks?: Record<string, boolean>; details?: { latestImportBatch?: { batchNo?: string; importedOrders?: number } | null; version?: string } }>(`${apiUrl}/health/ready?month=2026-06`);
  push(checks, "Backend readiness is ok", readiness.status === "ready" && Object.values(readiness.checks ?? {}).every(Boolean), JSON.stringify(readiness.checks));
  push(checks, "Backend readiness includes latest import batch", Boolean(readiness.details?.latestImportBatch?.batchNo) && Number(readiness.details?.latestImportBatch?.importedOrders ?? 0) > 0, JSON.stringify(readiness.details?.latestImportBatch));

  const operations = await requestJson<{
    status?: string;
    database?: { ok?: boolean; latencyMs?: number };
    runtime?: { requests?: { total?: number; p95Ms?: number }; errors?: { total?: number } };
    configuration?: { authRequired?: boolean; headerRoleAllowed?: boolean; uploadMaxMb?: number };
  }>(`${apiUrl}/health/status`);
  push(checks, "Operational status is healthy", operations.status === "healthy" && operations.database?.ok === true, JSON.stringify(operations.database));
  push(checks, "Operational security settings are production-safe", operations.configuration?.authRequired === true && operations.configuration?.headerRoleAllowed === false, JSON.stringify(operations.configuration));
  push(checks, "Operational request telemetry is available", Number(operations.runtime?.requests?.total ?? 0) > 0, JSON.stringify(operations.runtime?.requests));

  const templates = await requestJson<{ rows?: Array<{ templateKey: string; fileName: string; headerCount: number; headers: string[] }> }>(`${apiUrl}/finance/import-templates`);
  const systemTemplate = templates.rows?.find((row) => row.templateKey === "system_waybill_detail");
  push(checks, "Import template is stored", Boolean(systemTemplate), templates.rows?.map((row) => row.templateKey).join(","));
  push(checks, "Import template has fixed headers", (systemTemplate?.headerCount ?? 0) >= 20 && Boolean(systemTemplate?.headers.includes("运单号")), `${systemTemplate?.fileName ?? "-"} / ${systemTemplate?.headerCount ?? 0}`);
  push(checks, "Import template file name is readable", Boolean(systemTemplate?.fileName && systemTemplate.fileName.endsWith(".xlsx")), systemTemplate?.fileName);

  const dashboard = await retry(
    () => requestJson<{ summary?: { totalReceivable?: number; totalPayable?: number }; businessSummary?: unknown[] }>(`${apiUrl}/finance/dashboard?month=2026-06`),
    (value) => Number(value.summary?.totalReceivable ?? 0) > 0 && Number(value.summary?.totalPayable ?? 0) > 0
  );
  push(checks, "Dashboard summary loads", Number(dashboard.summary?.totalReceivable ?? 0) > 0 && Number(dashboard.summary?.totalPayable ?? 0) > 0, JSON.stringify(dashboard.summary));
  push(checks, "Dashboard business summary loads", Array.isArray(dashboard.businessSummary) && dashboard.businessSummary.length > 0, String(dashboard.businessSummary?.length ?? 0));

  const failed = checks.filter((check) => !check.pass);
  for (const check of checks) {
    console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}${check.detail ? `: ${check.detail}` : ""}`);
  }
  if (failed.length) throw new Error(`${failed.length} UI smoke checks failed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
