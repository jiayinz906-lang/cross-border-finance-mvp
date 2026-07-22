import assert from "node:assert/strict";
import { appPages, pagesForPermissions } from "../client/src/config/access.js";
import { permissionLabels, rolePermissions, type Permission, type UserRole } from "../server/src/config/rbac.js";
import { financeAccessForUser } from "../server/src/security/finance-access.js";

const expectedNavigation: Record<UserRole, string[]> = {
  admin: appPages.filter((page) => page.navigation).map((page) => page.path),
  finance: appPages.filter((page) => page.navigation).map((page) => page.path),
  supervisor: appPages.filter((page) => page.navigation).map((page) => page.path),
  executive: [
    "/dashboard",
    "/profit-analysis",
    "/commission",
    "/service-confirm",
    "/signature-confirm",
    "/operator-performance",
    "/customer-profit",
    "/risks",
    "/receivables",
    "/payables",
    "/reports",
    "/settings"
  ],
  sales: [
    "/dashboard",
    "/profit-analysis",
    "/commission",
    "/service-confirm",
    "/signature-confirm",
    "/customer-profit",
    "/settings"
  ],
  operator: ["/signature-confirm", "/operator-performance", "/settings"],
  sales_operator: [
    "/dashboard",
    "/profit-analysis",
    "/commission",
    "/service-confirm",
    "/signature-confirm",
    "/operator-performance",
    "/customer-profit",
    "/settings"
  ],
  restricted: []
};

const writePermissions: Permission[] = [
  "finance:import",
  "users:manage",
  "finance:reset",
  "finance:rollback",
  "finance:close",
  "risk:review",
  "rules:write",
  "confirmation:approve",
  "master:write",
  "billing:write",
  "reconciliation:write",
  "task:manage"
];

function sorted(values: string[]) {
  return [...values].sort();
}

for (const [role, permissions] of Object.entries(rolePermissions) as Array<[UserRole, Permission[]]>) {
  assert.deepEqual(
    sorted(pagesForPermissions(permissions, role).map((page) => page.path)),
    sorted(expectedNavigation[role]),
    `${role} navigation does not match the approved interface matrix`
  );
  assert.equal(new Set(permissions).size, permissions.length, `${role} contains duplicate permission codes`);
  for (const permission of permissions) {
    assert.ok(permissionLabels[permission], `${role} has an undocumented permission: ${permission}`);
  }
}

for (const role of ["executive", "sales", "operator", "sales_operator", "restricted"] as UserRole[]) {
  assert.equal(
    writePermissions.some((permission) => rolePermissions[role].includes(permission)),
    false,
    `${role} must remain read-only`
  );
}

assert.ok(rolePermissions.admin.includes("users:manage"), "Administrator must manage accounts and roles");
assert.ok(rolePermissions.finance.includes("finance:import"), "Finance must import source data");
assert.ok(rolePermissions.supervisor.includes("confirmation:approve"), "Supervisor must approve confirmations");
assert.ok(rolePermissions.supervisor.includes("finance:close"), "Supervisor must close and reopen months");
assert.ok(rolePermissions.executive.includes("audit:read"), "Executive must be able to audit company actions");
assert.ok(!rolePermissions.executive.includes("operations:read"), "Executive must not access operational controls");
assert.ok(rolePermissions.executive.includes("rules:read"), "Executive must be able to read calculation rules");
assert.ok(rolePermissions.executive.includes("month-close:read"), "Executive must be able to read month-close status");

const salesScope = financeAccessForUser({ username: "sales01", displayName: "销售甲", role: "sales" });
assert.deepEqual(salesScope, { mode: "self", names: ["销售甲", "sales01"], field: "salesperson" });
const operatorScope = financeAccessForUser({ username: "operator01", displayName: "操作员乙", role: "operator" });
assert.deepEqual(operatorScope, { mode: "self", names: ["操作员乙", "operator01"], field: "operator" });
const dualScope = financeAccessForUser({ username: "staff01", displayName: "双身份丙", role: "sales_operator" });
assert.deepEqual(dualScope, { mode: "self", names: ["双身份丙", "staff01"], field: "both" });
assert.deepEqual(financeAccessForUser({ username: "blocked", displayName: "未授权", role: "restricted" }), { mode: "none", names: [] });

console.log("Role interface and permission matrix verification passed.");
