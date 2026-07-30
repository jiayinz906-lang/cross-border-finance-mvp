import fs from "node:fs";
import path from "node:path";
import { argumentValue, loadEnvironmentFile, resolveVerificationCredentials } from "./lib/runtime-config.js";
import { createMigrationManifest } from "./lib/migration-manifest.js";

async function expectOk(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

async function main() {
  loadEnvironmentFile(argumentValue("env-file"));
  const appUrl = (argumentValue("app-url") || process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");
  const apiUrl = (argumentValue("api-url") || `${appUrl}/api`).replace(/\/$/, "");
  const databaseUrl = argumentValue("database-url") || process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;
  if (!appUrl || !databaseUrl) throw new Error("PUBLIC_APP_URL and TARGET_DATABASE_URL/DATABASE_URL are required.");
  const checks: Record<string, unknown> = {};
  checks.frontend = (await expectOk(`${appUrl}/`)).status;
  const health = await (await expectOk(`${apiUrl}/health`)).json() as Record<string, unknown>;
  checks.health = health;
  const credentials = resolveVerificationCredentials();
  let token = "";
  if (credentials.username && credentials.password) {
    const login = await expectOk(`${apiUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(credentials) });
    const session = await login.json() as { token?: string };
    token = session.token || "";
    checks.login = Boolean(token);
  } else checks.login = "skipped_no_acceptance_credentials";
  if (token) {
    const headers = { authorization: `Bearer ${token}` };
    for (const [name, endpoint] of [["months", "/finance/months"], ["auditLogs", "/settings/action-logs"], ["documents", "/workflow/documents"]] as const) {
      const response = await fetch(`${apiUrl}${endpoint}`, { headers });
      checks[name] = response.status;
    }
  }
  const manifest = await createMigrationManifest(databaseUrl);
  checks.database = { tables: Object.keys(manifest.tables).length, months: manifest.monthlyOrderCounts, locks: manifest.monthCloseStates, migrations: manifest.migrations.map((row) => row.name) };
  checks.version = { expected: process.env.BUILD_GIT_SHA || "not_set", actual: health.backendCommit || health.version || "unknown" };
  const output = path.resolve(process.cwd(), argumentValue("output") || `outputs/migration/post-verify-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify({ checkedAt: new Date().toISOString(), readOnlyBusinessVerification: true, checks }, null, 2)}\n`);
  console.log(`Production read-only verification completed: ${output}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
