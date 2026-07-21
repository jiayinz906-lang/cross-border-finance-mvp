export type UserRole = "admin" | "finance" | "supervisor" | "executive" | "sales" | "operator" | "restricted";
export type AssignableUserRole = Exclude<UserRole, "restricted">;

export type Permission =
  | "finance:read"
  | "dashboard:read"
  | "ledger:read"
  | "profit:read"
  | "commission:read"
  | "service:read"
  | "confirmation:read"
  | "performance:read"
  | "customer-profit:read"
  | "risk:read"
  | "receivables:read"
  | "payables:read"
  | "rules:read"
  | "month-close:read"
  | "settings:read"
  | "reports:read"
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
  | "reports:export"
  | "audit:read";

export const roleLabels: Record<UserRole, string> = {
  admin: "系统管理员",
  finance: "财务",
  supervisor: "主管",
  executive: "老板/管理层",
  sales: "销售代表",
  operator: "操作员",
  restricted: "未授权"
};

export const roleDescriptions: Record<UserRole, string> = {
  admin: "管理账号、规则、导入、财务处理和全部业务数据。",
  finance: "负责原始数据导入、收付款、对账、风险复核和财务报表。",
  supervisor: "负责业务复核、提成与绩效确认、签名审批和月度锁账。",
  executive: "只读查看经营、利润、风险、应收应付和薪资确认汇总。",
  sales: "仅查看本人作为销售代表的订单、利润、提成和确认单。",
  operator: "仅查看本人作为客服代表负责的订单、绩效和确认单。",
  restricted: "账号未分配有效角色，不能访问业务数据。"
};

export const permissionLabels: Record<Permission, string> = {
  "finance:read": "读取授权范围内的财务数据",
  "dashboard:read": "查看经营总览",
  "ledger:read": "查看原始台账",
  "profit:read": "查看业务利润",
  "commission:read": "查看物流提成",
  "service:read": "查看注册提成",
  "confirmation:read": "查看电子签名确认",
  "performance:read": "查看操作员绩效",
  "customer-profit:read": "查看客户利润",
  "risk:read": "查看风险复查",
  "receivables:read": "查看应收管理",
  "payables:read": "查看上游应付",
  "rules:read": "查看数据库参数规则",
  "month-close:read": "查看月度锁账状态",
  "settings:read": "查看账号与参数规则",
  "reports:read": "查看月度报表",
  "finance:import": "导入和补录财务数据",
  "users:manage": "管理账号和角色",
  "finance:reset": "清理业务数据",
  "finance:rollback": "回滚导入或作废收付款",
  "finance:close": "锁账和解锁",
  "risk:review": "提交风险复核",
  "rules:write": "修改参数规则",
  "confirmation:approve": "调整并审批确认单",
  "master:write": "维护往来单位",
  "billing:write": "生成和维护账单",
  "reconciliation:write": "执行银行流水核销",
  "task:manage": "处理跨部门待办",
  "operations:read": "查看财务工作台",
  "reports:export": "导出报表和备份",
  "audit:read": "查看审计日志"
};

const allPageReads: Permission[] = [
  "dashboard:read",
  "ledger:read",
  "profit:read",
  "commission:read",
  "service:read",
  "confirmation:read",
  "performance:read",
  "customer-profit:read",
  "risk:read",
  "receivables:read",
  "payables:read",
  "settings:read",
  "reports:read"
];

export const rolePermissions: Record<UserRole, Permission[]> = {
  admin: [...allPageReads, "finance:read", "finance:import", "users:manage", "finance:reset", "finance:rollback", "finance:close", "risk:review", "rules:read", "rules:write", "month-close:read", "confirmation:approve", "master:write", "billing:write", "reconciliation:write", "task:manage", "operations:read", "reports:export", "audit:read"],
  finance: [...allPageReads, "finance:read", "finance:import", "risk:review", "rules:read", "month-close:read", "master:write", "billing:write", "reconciliation:write", "task:manage", "operations:read", "reports:export", "audit:read"],
  supervisor: [...allPageReads, "finance:read", "finance:import", "finance:close", "risk:review", "rules:read", "month-close:read", "confirmation:approve", "master:write", "billing:write", "reconciliation:write", "task:manage", "operations:read", "reports:export", "audit:read"],
  executive: ["dashboard:read", "profit:read", "commission:read", "service:read", "confirmation:read", "performance:read", "customer-profit:read", "risk:read", "receivables:read", "payables:read", "rules:read", "month-close:read", "settings:read", "reports:read", "finance:read", "reports:export", "audit:read"],
  sales: ["dashboard:read", "profit:read", "commission:read", "service:read", "confirmation:read", "customer-profit:read", "settings:read", "finance:read"],
  operator: ["dashboard:read", "confirmation:read", "performance:read", "settings:read", "finance:read"],
  restricted: []
};

export function resolveRole(value: unknown): UserRole {
  const role = String(value || "").trim() as UserRole;
  return role in rolePermissions ? role : "restricted";
}

export function resolveAssignableRole(value: unknown): AssignableUserRole | null {
  const role = resolveRole(value);
  return role === "restricted" ? null : role;
}

export function can(role: UserRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function authContext(role: UserRole) {
  return {
    role,
    label: roleLabels[role],
    description: roleDescriptions[role],
    permissions: rolePermissions[role],
    permissionDetails: rolePermissions[role].map((permission) => ({
      permission,
      label: permissionLabels[permission]
    })),
    permissionCatalog: Object.entries(permissionLabels).map(([permission, label]) => ({
      permission,
      label
    })),
    roles: Object.entries(roleLabels).filter(([key]) => key !== "restricted").map(([key, label]) => ({
      role: key,
      label,
      description: roleDescriptions[key as UserRole],
      permissions: rolePermissions[key as UserRole]
    }))
  };
}
