import assert from "node:assert/strict";
import { isMaintenanceWriteBlocked } from "../server/src/middleware/maintenance.middleware.js";

const writePaths = [
  "/api/finance/import", "/api/manual-ledger", "/api/manual-ledger/1/attachments", "/api/settlements",
  "/api/risks/1/review", "/api/commission/1", "/api/analytics/operator-performance/overrides",
  "/api/workflow/documents/logistics/generate", "/api/workflow/signature/token/sign", "/api/workflow/documents/1/supervisor-confirm",
  "/api/settings/month-close/lock", "/api/settings/rules", "/api/auth/users"
];
for (const path of writePaths) assert.equal(isMaintenanceWriteBlocked({ enabled: true, method: "POST", path, ip: "10.0.0.2", allowedIps: [] }), true, path);
assert.equal(isMaintenanceWriteBlocked({ enabled: true, method: "GET", path: "/api/health", ip: "10.0.0.2", allowedIps: [] }), false);
assert.equal(isMaintenanceWriteBlocked({ enabled: true, method: "POST", path: "/api/auth/login", ip: "10.0.0.2", allowedIps: [] }), false);
assert.equal(isMaintenanceWriteBlocked({ enabled: true, method: "POST", path: "/api/finance/import", ip: "10.0.0.1", allowedIps: ["10.0.0.1"] }), false);
assert.equal(isMaintenanceWriteBlocked({ enabled: false, method: "POST", path: "/api/finance/import", ip: "10.0.0.2", allowedIps: [] }), false);
console.log(`Maintenance mode verification passed (${writePaths.length} business write paths blocked).`);
