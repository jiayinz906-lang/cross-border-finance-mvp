export type PagePermission =
  | "dashboard:read"
  | "ledger:read"
  | "operations:read"
  | "profit:read"
  | "commission:read"
  | "service:read"
  | "confirmation:read"
  | "performance:read"
  | "customer-profit:read"
  | "risk:read"
  | "receivables:read"
  | "payables:read"
  | "reports:read"
  | "settings:read";

export type AppPageAccess = {
  path: string;
  label: string;
  permission: PagePermission;
  navigation?: boolean;
  roles?: string[];
};

const managerRoles = ["admin", "finance", "supervisor", "executive"];

export const appPages: AppPageAccess[] = [
  { path: "/dashboard", label: "经营总览", permission: "dashboard:read", navigation: true, roles: [...managerRoles, "sales", "sales_operator"] },
  { path: "/raw-entry", label: "原始数据录入", permission: "ledger:read", navigation: true },
  { path: "/finance-ledger", label: "原始台账", permission: "ledger:read" },
  { path: "/finance-operations", label: "财务工作台", permission: "operations:read", navigation: true },
  { path: "/profit-analysis", label: "业务利润", permission: "profit:read", navigation: true, roles: [...managerRoles, "sales", "sales_operator"] },
  { path: "/commission", label: "物流提成", permission: "commission:read", navigation: true, roles: [...managerRoles, "sales", "sales_operator"] },
  { path: "/service-confirm", label: "注册提成", permission: "service:read", navigation: true, roles: [...managerRoles, "sales", "sales_operator"] },
  { path: "/signature-confirm", label: "电子签名确认", permission: "confirmation:read", navigation: true },
  { path: "/operator-performance", label: "操作员绩效", permission: "performance:read", navigation: true, roles: [...managerRoles, "operator", "sales_operator"] },
  { path: "/customer-profit", label: "客户利润分析", permission: "customer-profit:read", navigation: true, roles: [...managerRoles, "sales", "sales_operator"] },
  { path: "/risks", label: "风险复查", permission: "risk:read", navigation: true },
  { path: "/receivables", label: "应收管理", permission: "receivables:read", navigation: true },
  { path: "/payables", label: "上游应付", permission: "payables:read", navigation: true },
  { path: "/reports", label: "月度报表", permission: "reports:read", navigation: true },
  { path: "/agent-rules", label: "规则说明", permission: "settings:read" },
  { path: "/settings", label: "账号与参数规则", permission: "settings:read", navigation: true }
];

export const roleDataScopeLabels: Record<string, string> = {
  admin: "全部业务数据",
  finance: "全部业务数据",
  supervisor: "全部业务数据",
  executive: "全部业务数据（只读）",
  sales: "仅销售代表为本人的订单与确认单",
  operator: "仅操作员（客服代表）为本人的绩效与确认单",
  sales_operator: "销售页面仅看本人销售数据；绩效页面仅看本人操作员数据；确认单合并显示",
  restricted: "无业务数据"
};

export function hasPermission(permissions: string[] | undefined, permission: string) {
  return Boolean(permissions?.includes(permission));
}

export function pageLabelForRole(page: AppPageAccess, role?: string) {
  if (role === "sales" || role === "sales_operator") {
    const labels: Record<string, string> = {
      "/dashboard": "我的经营",
      "/profit-analysis": "我的利润",
      "/commission": "我的物流提成",
      "/service-confirm": "我的注册提成",
      "/operator-performance": "我的绩效",
      "/signature-confirm": "我的确认单",
      "/customer-profit": "我的客户利润",
      "/settings": "账号与安全"
    };
    return labels[page.path] ?? page.label;
  }
  if (role === "operator") {
    const labels: Record<string, string> = {
      "/operator-performance": "我的绩效",
      "/signature-confirm": "我的确认单",
      "/settings": "账号与安全"
    };
    return labels[page.path] ?? page.label;
  }
  return page.label;
}

export function pagesForPermissions(permissions: string[] | undefined, role?: string) {
  return appPages.filter((page) => (
    page.navigation
    && hasPermission(permissions, page.permission)
    && (!page.roles || !role || page.roles.includes(role))
  ));
}

export function firstAllowedPath(permissions: string[] | undefined, role?: string) {
  const pages = pagesForPermissions(permissions, role);
  const preferred = role === "sales" || role === "operator" || role === "sales_operator"
    ? "/signature-confirm"
    : "/dashboard";
  return pages.find((page) => page.path === preferred)?.path ?? pages[0]?.path ?? "/settings";
}

export function isPathAllowed(path: string, permissions: string[] | undefined, role?: string) {
  const page = appPages.find((item) => item.path === path);
  if (!page) return false;
  return hasPermission(permissions, page.permission) && (!page.roles || !role || page.roles.includes(role));
}
