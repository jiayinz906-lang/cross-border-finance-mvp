import assert from "node:assert/strict";

const apiUrl = (process.env.UI_SMOKE_API_URL || "http://localhost:4000/api").replace(/\/$/, "");
const username = process.env.VERIFY_USERNAME || "admin";
const password = process.env.VERIFY_PASSWORD || "admin123";

async function jsonRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiUrl}${path}`, init);
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function main() {
  const anonymous = await jsonRequest("/operations/overview?month=2026-06");
  assert.equal(anonymous.response.status, 401, "Operations APIs must reject anonymous access");

  const login = await jsonRequest("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  assert.equal(login.response.status, 200, `Login failed: ${JSON.stringify(login.body)}`);
  assert.equal(typeof login.body?.token, "string");
  const headers = { authorization: `Bearer ${login.body.token}` };

  const overview = await jsonRequest("/operations/overview?month=2026-06", { headers });
  assert.equal(overview.response.status, 200);
  assert.equal(overview.body.month, "2026-06");
  assert.equal(typeof overview.body.invoiceCount, "number");
  assert.equal(typeof overview.body.pendingTasks, "number");

  for (const endpoint of ["partners", "invoices?month=2026-06", "bank-transactions?month=2026-06", "tasks?month=2026-06"]) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const result = await jsonRequest(`/operations/${endpoint}${separator}page=1&pageSize=10`, { headers });
    assert.equal(result.response.status, 200, `${endpoint} returned ${result.response.status}`);
    assert.ok(Array.isArray(result.body.rows), `${endpoint} must return rows`);
    assert.ok(result.body.rows.length <= 10, `${endpoint} ignored pageSize`);
    assert.equal(result.body.page, 1);
    assert.equal(result.body.pageSize, 10);
    assert.equal(typeof result.body.total, "number");
  }

  const invalidId = await jsonRequest("/operations/partners/not-a-number", {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(invalidId.response.status, 400, "Invalid operation IDs must return 400");

  const salesPassword = process.env.VERIFY_SALES_PASSWORD;
  if (salesPassword) {
    const salesLogin = await jsonRequest("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: process.env.VERIFY_SALES_USERNAME || "sales", password: salesPassword })
    });
    assert.equal(salesLogin.response.status, 200);
    const forbidden = await jsonRequest("/operations/overview?month=2026-06", {
      headers: { authorization: `Bearer ${salesLogin.body.token}` }
    });
    assert.equal(forbidden.response.status, 403, "Sales users must not access the finance operations workspace");
  }

  console.log(`Finance operations checks passed: ${overview.body.invoiceCount} invoices, ${overview.body.pendingTasks} pending tasks.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
