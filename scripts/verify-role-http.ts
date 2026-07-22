import crypto from "node:crypto";
import { prisma } from "../server/src/prisma/client.js";

type Role = "admin" | "finance" | "supervisor" | "executive" | "sales" | "operator";
type HttpResult<T = unknown> = { status: number; body: T };

const apiUrl = process.env.UI_SMOKE_API_URL || "http://127.0.0.1:4000/api";
const databaseUrl = new URL(process.env.DATABASE_URL || "");
const password = "RoleVerify123!";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

function passwordFields(raw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto.pbkdf2Sync(raw, salt, 120000, 32, "sha256").toString("hex");
  return { passwordHash, passwordSalt: salt };
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<HttpResult<T>> {
  const headers = new Headers(options.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Download/error responses are intentionally left as text.
  }
  return { status: response.status, body: body as T };
}

async function upsertAccount(username: string, displayName: string, role: Role) {
  const passwordData = passwordFields(password);
  await prisma.appUser.upsert({
    where: { username },
    create: {
      username,
      displayName,
      role,
      ...passwordData,
      mustChangePassword: false,
      isActive: true
    },
    update: {
      displayName,
      role,
      ...passwordData,
      mustChangePassword: false,
      isActive: true,
      passwordChangedAt: null
    }
  });
}

async function login(username: string) {
  const response = await request<{ token?: string; user?: { role?: string } }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  assert(response.status === 200 && Boolean(response.body.token), `${username} can establish an authenticated session`);
  return response.body.token!;
}

async function main() {
  const allowedDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (process.env.NODE_ENV === "development") allowedDatabaseHosts.add("postgres");
  if (!allowedDatabaseHosts.has(databaseUrl.hostname)) {
    throw new Error(`Refusing to alter role-test accounts on non-local database host ${databaseUrl.hostname}.`);
  }

  const month = process.env.FINANCE_TEST_MONTH || "2026-06";
  const [serviceOwner, salesOwner, operatorOwner] = await Promise.all([
    prisma.financeOrder.findFirst({
      where: { month, isServiceBusiness: true, salespersonName: { not: "" }, importBatch: { is: { status: "active" } } },
      select: { salespersonName: true }
    }),
    prisma.financeOrder.findFirst({
      where: { month, salespersonName: { not: "" }, importBatch: { is: { status: "active" } } },
      select: { salespersonName: true }
    }),
    prisma.financeOrder.findFirst({
      where: { month, customerServiceName: { not: "" }, importBatch: { is: { status: "active" } } },
      select: { customerServiceName: true }
    })
  ]);
  const salespersonName = serviceOwner?.salespersonName || salesOwner?.salespersonName;
  const operatorName = operatorOwner?.customerServiceName;
  assert(Boolean(salespersonName), "Imported data contains a salesperson for self-scope verification");
  assert(Boolean(operatorName), "Imported data contains an operator for self-scope verification");

  const accounts: Array<[string, string, Role]> = [
    ["verify_admin", "权限验收管理员", "admin"],
    ["verify_finance", "权限验收财务", "finance"],
    ["verify_supervisor", "权限验收主管", "supervisor"],
    ["verify_executive", "权限验收管理层", "executive"],
    ["verify_sales", salespersonName!, "sales"],
    ["verify_operator", operatorName!, "operator"]
  ];
  for (const account of accounts) await upsertAccount(...account);

  const noToken = await request("/finance/dashboard?month=2026-06");
  assert(noToken.status === 401, "Business API rejects anonymous access");
  const spoofed = await request("/finance/dashboard?month=2026-06", {
    headers: { "x-finance-role": "admin" }
  });
  assert(spoofed.status === 401, "Header role spoofing cannot bypass token authentication");

  const tokens = Object.fromEntries(await Promise.all(accounts.map(async ([username, , role]) => [role, await login(username)]))) as Record<Role, string>;

  assert((await request("/auth/users", {}, tokens.admin)).status === 200, "Administrator can manage accounts");
  assert((await request("/workflow/month-status?month=2026-06", {}, tokens.finance)).status === 200, "Finance can read the monthly workflow");
  assert((await request("/operations/overview?month=2026-06", {}, tokens.finance)).status === 200, "Finance can open the finance operations workspace");
  assert((await request("/health/ready?month=2026-06", {}, tokens.finance)).status === 200, "Finance can read database readiness details");
  assert((await request("/health/status", {}, tokens.finance)).status === 200, "Finance can read operational telemetry");
  assert((await request("/workflow/month-status?month=2026-06", {}, tokens.supervisor)).status === 200, "Supervisor can read the monthly workflow");
  assert((await request("/auth/users", {}, tokens.finance)).status === 403, "Finance cannot manage accounts");
  assert((await request("/workflow/documents/logistics/generate", { method: "POST", body: "{}" }, tokens.finance)).status === 403, "Finance cannot approve confirmation documents");
  assert((await request("/reports/monthly?month=2026-06", {}, tokens.executive)).status === 200, "Executive can read management reports");
  assert((await request("/finance/parameter-rules", {}, tokens.executive)).status === 200, "Executive can read parameter rules without gaining write access");
  assert((await request("/workflow/month-close?month=2026-06", {}, tokens.executive)).status === 200, "Executive can read the month-close status");
  assert((await request("/finance/import-batches?month=2026-06", {}, tokens.executive)).status === 403, "Executive cannot access import administration");
  assert((await request("/workflow/month-status?month=2026-06", {}, tokens.executive)).status === 403, "Executive cannot access operational workflow controls");
  assert((await request("/health/status", {}, tokens.executive)).status === 403, "Executive cannot read operational telemetry");

  const salesDashboard = await request<{ salespersonSummary?: Array<{ salespersonName?: string }> }>(`/finance/dashboard?month=${month}`, {}, tokens.sales);
  assert(salesDashboard.status === 200, "Salesperson can open the dashboard");
  assert((salesDashboard.body.salespersonSummary ?? []).every((row) => row.salespersonName === salespersonName), "Sales dashboard is limited to the signed-in salesperson");
  const serviceRows = await request<{ rows?: Array<{ financeOrder?: { salespersonName?: string } }> }>(`/reports/service-records?month=${month}`, {}, tokens.sales);
  assert(serviceRows.status === 200, "Salesperson can read service commission rows");
  assert((serviceRows.body.rows ?? []).every((row) => row.financeOrder?.salespersonName === salespersonName), "Service commission rows are limited to the signed-in salesperson");
  assert((await request("/reports/monthly?month=2026-06", {}, tokens.sales)).status === 403, "Salesperson cannot read company-wide reports");
  assert((await request("/receivables?month=2026-06", {}, tokens.sales)).status === 403, "Salesperson cannot read company receivables");
  assert((await request("/operations/overview?month=2026-06", {}, tokens.sales)).status === 403, "Salesperson cannot read finance operations data");
  assert((await request("/health/ready?month=2026-06", {}, tokens.sales)).status === 403, "Salesperson cannot read database readiness details");
  assert((await request("/health/status", {}, tokens.sales)).status === 403, "Salesperson cannot read operational telemetry");
  assert((await request("/finance/parameter-rules", {}, tokens.sales)).status === 403, "Salesperson cannot read raw database parameter rules");
  assert((await request("/workflow/month-close?month=2026-06", {}, tokens.sales)).status === 403, "Salesperson cannot read company month-close controls");
  assert((await request("/workflow/month-status?month=2026-06", {}, tokens.sales)).status === 403, "Salesperson cannot read company workflow counts");
  assert((await request("/workflow/exports/1/download", {}, tokens.sales)).status === 403, "Salesperson cannot bypass report export permissions");

  const operatorPerformance = await request<{ rows?: Array<{ operatorName?: string }> }>(`/analytics/operator-performance?month=${month}`, {}, tokens.operator);
  assert(operatorPerformance.status === 200, "Operator can open personal performance");
  assert((operatorPerformance.body.rows ?? []).every((row) => row.operatorName === operatorName), "Performance rows are limited to the signed-in operator");
  assert((await request("/profit/analysis?month=2026-06", {}, tokens.operator)).status === 403, "Operator cannot read business profit");
  assert((await request("/operations/overview?month=2026-06", {}, tokens.operator)).status === 403, "Operator cannot read finance operations data");
  assert((await request("/health/status", {}, tokens.operator)).status === 403, "Operator cannot read operational telemetry");
  assert((await request("/workflow/month-close?month=2026-06", {}, tokens.operator)).status === 403, "Operator cannot read company month-close controls");
  assert((await request("/workflow/month-status?month=2026-06", {}, tokens.operator)).status === 403, "Operator cannot read company workflow counts");

  console.log("Role HTTP authorization verification passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
