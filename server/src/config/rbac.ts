export type UserRole = "admin" | "finance" | "supervisor" | "executive" | "sales";

export type Permission =
  | "finance:read"
  | "finance:import"
  | "users:manage"
  | "finance:reset"
  | "finance:rollback"
  | "finance:close"
  | "risk:review"
  | "rules:write"
  | "confirmation:approve"
  | "master:write"
  | "billing:write"
  | "reconciliation:write"
  | "task:manage"
  | "operations:read"
  | "reports:export";

export const roleLabels: Record<UserRole, string> = {
  admin: "系统管理员",
  finance: "财务",
  supervisor: "主管",
  executive: "老板/管理层",
  sales: "销售/客服"
};

export const rolePermissions: Record<UserRole, Permission[]> = {
  admin: ["finance:read", "finance:import", "users:manage", "finance:reset", "finance:rollback", "finance:close", "risk:review", "rules:write", "confirmation:approve", "master:write", "billing:write", "reconciliation:write", "task:manage", "operations:read", "reports:export"],
  finance: ["finance:read", "finance:import", "risk:review", "master:write", "billing:write", "reconciliation:write", "task:manage", "operations:read", "reports:export"],
  supervisor: ["finance:read", "finance:import", "finance:close", "risk:review", "confirmation:approve", "master:write", "billing:write", "reconciliation:write", "task:manage", "operations:read", "reports:export"],
  executive: ["finance:read", "operations:read", "reports:export"],
  sales: ["finance:read"]
};

export function resolveRole(value: unknown): UserRole {
  const role = String(value || "").trim() as UserRole;
  return role in rolePermissions ? role : "admin";
}

export function can(role: UserRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function authContext(role: UserRole) {
  return {
    role,
    label: roleLabels[role],
    permissions: rolePermissions[role],
    roles: Object.entries(roleLabels).map(([key, label]) => ({
      role: key,
      label,
      permissions: rolePermissions[key as UserRole]
    }))
  };
}
