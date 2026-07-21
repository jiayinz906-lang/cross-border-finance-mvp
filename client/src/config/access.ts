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
};

export const appPages: AppPageAccess[] = [
  { path: "/dashboard", label: "经营总览", permission: "dashboard:read", navigation: true },
  { path: "/raw-entry", label: "原始数据录入", permission: "ledger:read", navigation: true },
  { path: "/finance-ledger", label: "原始台账", permission: "ledger:read" },
  { path: "/finance-operations", label: "财务工作台", permission: "operations:read", navigation: true },
  { path: "/profit-analysis", label: "业务利润", permission: "profit:read", navigation: true },
  { path: "/commission", label: "物流提成", permission: "commission:read", navigation: true },
  { path: "/service-confirm", label: "注册提成", permission: "service:read", navigation: true },
  { path: "/signature-confirm", label: "电子签名确认", permission: "confirmation:read", navigation: true },
  { path: "/operator-performance", label: "操作员绩效", permission: "performance:read", navigation: true },
  { path: "/customer-profit", label: "客户利润分析", permission: "customer-profit:read", navigation: true },
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
  operator: "仅客服代表为本人的订单与确认单",
  restricted: "无业务数据"
};

export function hasPermission(permissions: string[] | undefined, permission: string) {
  return Boolean(permissions?.includes(permission));
}

export function firstAllowedPath(permissions: string[] | undefined) {
  return appPages.find((page) => page.navigation && hasPermission(permissions, page.permission))?.path ?? "/settings";
}

export function pagesForPermissions(permissions: string[] | undefined) {
  return appPages.filter((page) => page.navigation && hasPermission(permissions, page.permission));
}
