import crypto from "node:crypto";
import { prisma } from "../server/src/prisma/client.js";

type Role = "admin" | "finance" | "supervisor" | "executive" | "sales" | "operator" | "sales_operator";
type HttpResult<T = unknown> = { status: number; body: T };

const apiUrl = process.env.UI_SMOKE_API_URL || "http://127.0.0.1:4000/api";
const databaseUrl = new URL(process.env.DATABASE_URL || "");
const password = "RoleVerify123!";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

function hasOwn(value: unknown, key: string) {
  return Boolean(value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key));
}

function containsForbiddenKey(value: unknown, forbidden: Set<string>): boolean {
  if (Array.isArray(value)) return value.some((item) => containsForbiddenKey(item, forbidden));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>)
    .some(([key, child]) => forbidden.has(key) || containsForbiddenKey(child, forbidden));
}

function parsePayload(value: unknown) {
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
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
  if (response.status !== 200 || !response.body.token) {
    throw new Error(`${username} cannot establish an authenticated session (status ${response.status}: ${JSON.stringify(response.body)})`);
  }
  console.log(`PASS ${username} can establish an authenticated session`);
  return response.body.token!;
}

async function main() {
  const allowedDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (process.env.NODE_ENV === "development") allowedDatabaseHosts.add("postgres");
  if (!allowedDatabaseHosts.has(databaseUrl.hostname)) {
    throw new Error(`Refusing to alter role-test accounts on non-local database host ${databaseUrl.hostname}.`);
  }

  const month = process.env.FINANCE_TEST_MONTH || "2026-06";
  const [serviceOwner, salesOwner, operatorOwner, identityRows] = await Promise.all([
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
    }),
    prisma.financeOrder.findMany({
      where: { month, importBatch: { is: { status: "active" } } },
      select: { salespersonName: true, customerServiceName: true }
    })
  ]);
  const salespersonName = serviceOwner?.salespersonName || salesOwner?.salespersonName;
  const operatorName = operatorOwner?.customerServiceName;
  const importedSalesNames = new Set(identityRows.map((row) => row.salespersonName).filter(Boolean));
  const dualIdentityName = identityRows
    .map((row) => row.customerServiceName)
    .find((name) => Boolean(name && importedSalesNames.has(name)));
  assert(Boolean(salespersonName), "Imported data contains a salesperson for self-scope verification");
  assert(Boolean(operatorName), "Imported data contains an operator for self-scope verification");
  assert(Boolean(dualIdentityName), "Imported data contains one person serving as both salesperson and operator");

  const accounts: Array<[string, string, Role]> = [
    ["verify_admin", "权限验收管理员", "admin"],
    ["verify_finance", "权限验收财务", "finance"],
    ["verify_supervisor", "权限验收主管", "supervisor"],
    ["verify_executive", "权限验收管理层", "executive"],
    ["verify_sales", salespersonName!, "sales"],
    ["verify_operator", operatorName!, "operator"],
    ["verify_dual", dualIdentityName!, "sales_operator"]
  ];
  for (const account of accounts) await upsertAccount(...account);

  const noToken = await request("/finance/dashboard?month=2026-06");
  assert(noToken.status === 401, "Business API rejects anonymous access");
  const spoofed = await request("/finance/dashboard?month=2026-06", {
    headers: { "x-finance-role": "admin" }
  });
  assert(spoofed.status === 401, "Header role spoofing cannot bypass token authentication");

  const tokens = {} as Record<Role, string>;
  for (const [username, , role] of accounts) {
    tokens[role] = await login(username);
  }

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

  const managementDashboard = await request<Record<string, any>>(`/finance/dashboard?month=${month}`, {}, tokens.finance);
  assert(managementDashboard.status === 200, "Finance can open the management dashboard");
  assert(managementDashboard.body.visibility?.upstreamCosts === true, "Management dashboard keeps upstream cost visibility");
  assert(hasOwn(managementDashboard.body.summary, "totalPayable"), "Management dashboard keeps total payable data");

  const salesDashboard = await request<Record<string, any>>(`/finance/dashboard?month=${month}`, {}, tokens.sales);
  assert(salesDashboard.status === 403, "Salesperson cannot open the management dashboard");

  const salesSummary = await request<Record<string, any>>(`/finance/summary?month=${month}`, {}, tokens.sales);
  assert(salesSummary.status === 403, "Salesperson cannot open the management summary");

  const salesProfit = await request<Record<string, any>>(`/profit/analysis?month=${month}`, {}, tokens.sales);
  assert(salesProfit.status === 403, "Salesperson cannot open profit analysis outside the confirmation portal");

  const salesCustomerProfit = await request<Record<string, any>>(`/analytics/customer-profit?month=${month}`, {}, tokens.sales);
  assert(salesCustomerProfit.status === 403, "Salesperson cannot open customer profit analysis outside the confirmation portal");

  const commissionRows = await request<Record<string, any>>(`/commissions?month=${month}`, {}, tokens.sales);
  assert(commissionRows.status === 403, "Salesperson cannot open the standalone commission workspace");

  const serviceRows = await request<{ rows?: Array<{ costAmount?: number; financeOrder?: { salespersonName?: string } }> }>(`/reports/service-records?month=${month}`, {}, tokens.sales);
  assert(serviceRows.status === 403, "Salesperson cannot open the standalone service commission workspace");
  const serviceDocuments = await request<{ rows?: Array<{ ownerName?: string; payloadJson?: string }> }>(`/workflow/documents?month=${month}&documentType=service_commission`, {}, tokens.sales);
  const accessibleServiceOrders = new Set((await prisma.financeOrder.findMany({
    where: { month, isServiceBusiness: true, salespersonName, importBatch: { is: { status: "active" } } },
    select: { orderNo: true }
  })).map((row) => row.orderNo));
  assert(serviceDocuments.status === 200, "Salesperson can read own service confirmation documents");
  assert((serviceDocuments.body.rows ?? []).every((row) => Boolean(row.ownerName && accessibleServiceOrders.has(row.ownerName))), "Service confirmation documents are limited to the salesperson's own orders");
  assert((serviceDocuments.body.rows ?? []).every((row) => !containsForbiddenKey(parsePayload(row.payloadJson), new Set(["totalPayable", "payable", "adjustedPayable", "supplierName", "costAmount", "chargeLines"]))), "Sales confirmation snapshots omit upstream cost evidence");
  assert((await request(`/finance/months`, {}, tokens.sales)).status === 200, "Salesperson can switch confirmation months");
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
  assert((await request("/finance/months", {}, tokens.operator)).status === 200, "Operator can switch between months containing personal performance");
  assert((await request("/finance/dashboard?month=2026-06", {}, tokens.operator)).status === 403, "Operator cannot read the company dashboard");
  assert((await request("/profit/analysis?month=2026-06", {}, tokens.operator)).status === 403, "Operator cannot read business profit");
  assert((await request("/operations/overview?month=2026-06", {}, tokens.operator)).status === 403, "Operator cannot read finance operations data");
  assert((await request("/health/status", {}, tokens.operator)).status === 403, "Operator cannot read operational telemetry");
  assert((await request("/workflow/month-close?month=2026-06", {}, tokens.operator)).status === 403, "Operator cannot read company month-close controls");
  assert((await request("/workflow/month-status?month=2026-06", {}, tokens.operator)).status === 403, "Operator cannot read company workflow counts");

  const dualDashboard = await request<Record<string, any>>(`/finance/dashboard?month=${month}`, {}, tokens.sales_operator);
  assert(dualDashboard.status === 403, "Dual-role account cannot open the management dashboard");
  const dualServiceRows = await request<{ rows?: Array<{ financeOrder?: { salespersonName?: string } }> }>(`/reports/service-records?month=${month}`, {}, tokens.sales_operator);
  assert(dualServiceRows.status === 403, "Dual-role account uses confirmation documents instead of the service commission workspace");
  const dualPerformance = await request<{ rows?: Array<{ operatorName?: string }> }>(`/analytics/operator-performance?month=${month}`, {}, tokens.sales_operator);
  assert(dualPerformance.status === 200, "Dual-role account can open personal operator performance");
  assert((dualPerformance.body.rows ?? []).every((row) => row.operatorName === dualIdentityName), "Dual-role performance remains limited to the person's operator records");
  assert((await request("/receivables?month=2026-06", {}, tokens.sales_operator)).status === 403, "Dual-role account cannot read company receivables");

  console.log("Role HTTP authorization verification passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.appUser.deleteMany({ where: { username: { startsWith: "verify_" } } }).catch(() => undefined);
    await prisma.$disconnect();
  });
