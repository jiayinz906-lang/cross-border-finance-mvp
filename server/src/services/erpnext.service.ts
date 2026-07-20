import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

type FrappeResponse<T> = {
  data?: T;
  message?: T;
  exc_type?: string;
};

type FrappeFilter = [string, string, string | number];

export type ErpnextInvoiceKind = "sales" | "purchase";
export type ErpnextInvoiceStatus = "all" | "outstanding" | "paid" | "overdue" | "return";
export type ErpnextPaymentType = "all" | "receive" | "pay" | "transfer";
export type ErpnextPartyKind = "customer" | "supplier";

export type ErpnextInvoiceRow = {
  name: string;
  posting_date?: string;
  due_date?: string;
  customer?: string;
  supplier?: string;
  company?: string;
  grand_total?: number;
  rounded_total?: number;
  paid_amount?: number;
  outstanding_amount?: number;
  status?: string;
  currency?: string;
  docstatus?: number;
  is_return?: number;
  return_against?: string;
  modified?: string;
};

export type ErpnextPaymentRow = {
  name: string;
  posting_date?: string;
  payment_type?: string;
  party_type?: string;
  party?: string;
  party_name?: string;
  paid_amount?: number;
  received_amount?: number;
  unallocated_amount?: number;
  difference_amount?: number;
  reference_no?: string;
  reference_date?: string;
  mode_of_payment?: string;
  docstatus?: number;
  modified?: string;
};

export type ErpnextPartyRow = {
  name: string;
  customer_name?: string;
  customer_type?: string;
  customer_group?: string;
  territory?: string;
  supplier_name?: string;
  supplier_group?: string;
  country?: string;
  disabled?: number;
  modified?: string;
};

type PageQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  fromDate?: string;
  toDate?: string;
};

export type ErpnextInvoiceQuery = PageQuery & {
  kind?: ErpnextInvoiceKind;
  status?: ErpnextInvoiceStatus;
};

export type ErpnextPaymentQuery = PageQuery & {
  paymentType?: ErpnextPaymentType;
};

export type ErpnextPartyQuery = PageQuery & {
  kind?: ErpnextPartyKind;
};

function integrationConfig() {
  return {
    configured: Boolean(env.erpnextBaseUrl && env.erpnextApiKey && env.erpnextApiSecret),
    baseUrl: env.erpnextBaseUrl,
    timeoutMs: Number.isFinite(env.erpnextTimeoutMs) && env.erpnextTimeoutMs > 0 ? env.erpnextTimeoutMs : 15000
  };
}

function validateBaseUrl(value: string) {
  if (!value) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(500, "ERPNEXT_CONFIG_INVALID", "ERPNext 服务地址不是有效 URL。");
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new AppError(500, "ERPNEXT_CONFIG_INVALID", "ERPNext 服务地址只支持 HTTP 或 HTTPS。");
  }
}

async function erpnextRequest<T>(path: string, params?: Record<string, string>) {
  const config = integrationConfig();
  if (!config.configured) {
    throw new AppError(409, "ERPNEXT_NOT_CONFIGURED", "ERPNext 尚未配置，请先在后端设置 ERPNEXT_BASE_URL、ERPNEXT_API_KEY 和 ERPNEXT_API_SECRET。");
  }
  validateBaseUrl(config.baseUrl);

  const url = new URL(path, `${config.baseUrl}/`);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `token ${env.erpnextApiKey}:${env.erpnextApiSecret}`
      },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({})) as FrappeResponse<T>;
    if (!response.ok) {
      const detail = payload.exc_type || response.statusText || String(response.status);
      const status = response.status === 401 ? 401 : response.status === 403 ? 403 : response.status === 404 ? 404 : 502;
      throw new AppError(status, "ERPNEXT_REQUEST_FAILED", `ERPNext 接口请求失败：${detail}`);
    }
    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError(504, "ERPNEXT_TIMEOUT", "ERPNext 响应超时，请检查服务状态或网络连接。");
    }
    throw new AppError(502, "ERPNEXT_UNREACHABLE", `无法连接 ERPNext：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePage(value: number | undefined) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 1;
}

function normalizePageSize(value: number | undefined) {
  if (!Number.isInteger(value) || Number(value) <= 0) return 20;
  return Math.min(Number(value), 100);
}

function normalizeKeyword(value: string | undefined) {
  return String(value ?? "").trim().slice(0, 100);
}

function validateDate(value: string | undefined, field: string) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, "ERPNEXT_QUERY_INVALID", `${field} 必须使用 YYYY-MM-DD 格式。`);
  }
  return value;
}

function dateFilters(field: string, fromDate?: string, toDate?: string): FrappeFilter[] {
  const from = validateDate(fromDate, "开始日期");
  const to = validateDate(toDate, "结束日期");
  if (from && to && from > to) {
    throw new AppError(400, "ERPNEXT_QUERY_INVALID", "开始日期不能晚于结束日期。");
  }
  return [
    ...(from ? [[field, ">=", from] as FrappeFilter] : []),
    ...(to ? [[field, "<=", to] as FrappeFilter] : [])
  ];
}

async function getCount(doctype: string, filters: FrappeFilter[] = []) {
  const response = await erpnextRequest<number>("api/method/frappe.client.get_count", {
    doctype,
    ...(filters.length ? { filters: JSON.stringify(filters) } : {})
  });
  return Number(response.message ?? 0);
}

async function getResourcePage<T>(input: {
  doctype: string;
  fields: string[];
  filters?: FrappeFilter[];
  orFilters?: FrappeFilter[];
  orderBy: string;
  page?: number;
  pageSize?: number;
}) {
  const page = normalizePage(input.page);
  const pageSize = normalizePageSize(input.pageSize);
  const response = await erpnextRequest<T[]>(`api/resource/${encodeURIComponent(input.doctype)}`, {
    fields: JSON.stringify(input.fields),
    ...(input.filters?.length ? { filters: JSON.stringify(input.filters) } : {}),
    ...(input.orFilters?.length ? { or_filters: JSON.stringify(input.orFilters) } : {}),
    order_by: input.orderBy,
    limit_start: String((page - 1) * pageSize),
    limit_page_length: String(pageSize + 1)
  });
  const records = response.data ?? [];
  return {
    rows: records.slice(0, pageSize),
    page,
    pageSize,
    hasMore: records.length > pageSize
  };
}

function invoiceDefinition(kind: ErpnextInvoiceKind) {
  return kind === "purchase"
    ? { doctype: "Purchase Invoice", partyField: "supplier", route: "purchase-invoice" }
    : { doctype: "Sales Invoice", partyField: "customer", route: "sales-invoice" };
}

function invoiceFilters(status: ErpnextInvoiceStatus, fromDate?: string, toDate?: string) {
  const filters: FrappeFilter[] = [["docstatus", "!=", 2], ...dateFilters("posting_date", fromDate, toDate)];
  if (status === "outstanding") filters.push(["outstanding_amount", ">", 0]);
  if (status === "paid") filters.push(["docstatus", "=", 1], ["outstanding_amount", "=", 0]);
  if (status === "overdue") filters.push(["outstanding_amount", ">", 0], ["due_date", "<", new Date().toISOString().slice(0, 10)]);
  if (status === "return") filters.push(["is_return", "=", 1]);
  return filters;
}

export function getErpnextStatus() {
  const config = integrationConfig();
  return {
    configured: config.configured,
    baseUrl: config.baseUrl || null,
    credentialMode: config.configured ? "server_token" : "not_configured",
    readOnly: true,
    supportedResources: ["Customer", "Supplier", "Sales Invoice", "Purchase Invoice", "Payment Entry"],
    sourceRepository: "https://github.com/frappe/erpnext"
  };
}

export async function testErpnextConnection() {
  const startedAt = Date.now();
  const response = await erpnextRequest<string>("api/method/frappe.auth.get_logged_user");
  return {
    ...getErpnextStatus(),
    connected: true,
    remoteUser: response.message || "unknown",
    latencyMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString()
  };
}

export async function getErpnextInvoices(query: ErpnextInvoiceQuery = {}) {
  const kind = query.kind === "purchase" ? "purchase" : "sales";
  const status: ErpnextInvoiceStatus = ["outstanding", "paid", "overdue", "return"].includes(String(query.status))
    ? query.status as ErpnextInvoiceStatus
    : "all";
  const definition = invoiceDefinition(kind);
  const keyword = normalizeKeyword(query.keyword);
  const filters = invoiceFilters(status, query.fromDate, query.toDate);
  const page = await getResourcePage<ErpnextInvoiceRow>({
    doctype: definition.doctype,
    fields: ["name", "posting_date", "due_date", definition.partyField, "company", "grand_total", "rounded_total", "paid_amount", "outstanding_amount", "status", "currency", "docstatus", "is_return", "return_against", "modified"],
    filters,
    orFilters: keyword ? [["name", "like", `%${keyword}%`], [definition.partyField, "like", `%${keyword}%`]] : undefined,
    orderBy: "posting_date desc, modified desc",
    page: query.page,
    pageSize: query.pageSize
  });
  return { ...page, kind, status, route: definition.route, fromDate: query.fromDate ?? null, toDate: query.toDate ?? null };
}

export async function getErpnextPayments(query: ErpnextPaymentQuery = {}) {
  const paymentType: ErpnextPaymentType = ["receive", "pay", "transfer"].includes(String(query.paymentType))
    ? query.paymentType as ErpnextPaymentType
    : "all";
  const paymentTypeValue = paymentType === "receive" ? "Receive" : paymentType === "pay" ? "Pay" : paymentType === "transfer" ? "Internal Transfer" : null;
  const keyword = normalizeKeyword(query.keyword);
  const filters: FrappeFilter[] = [["docstatus", "!=", 2], ...dateFilters("posting_date", query.fromDate, query.toDate)];
  if (paymentTypeValue) filters.push(["payment_type", "=", paymentTypeValue]);
  const page = await getResourcePage<ErpnextPaymentRow>({
    doctype: "Payment Entry",
    fields: ["name", "posting_date", "payment_type", "party_type", "party", "party_name", "paid_amount", "received_amount", "unallocated_amount", "difference_amount", "reference_no", "reference_date", "mode_of_payment", "docstatus", "modified"],
    filters,
    orFilters: keyword ? [["name", "like", `%${keyword}%`], ["party", "like", `%${keyword}%`], ["reference_no", "like", `%${keyword}%`]] : undefined,
    orderBy: "posting_date desc, modified desc",
    page: query.page,
    pageSize: query.pageSize
  });
  return { ...page, paymentType, fromDate: query.fromDate ?? null, toDate: query.toDate ?? null, route: "payment-entry" };
}

export async function getErpnextParties(query: ErpnextPartyQuery = {}) {
  const kind: ErpnextPartyKind = query.kind === "supplier" ? "supplier" : "customer";
  const keyword = normalizeKeyword(query.keyword);
  const isSupplier = kind === "supplier";
  const doctype = isSupplier ? "Supplier" : "Customer";
  const nameField = isSupplier ? "supplier_name" : "customer_name";
  const page = await getResourcePage<ErpnextPartyRow>({
    doctype,
    fields: isSupplier
      ? ["name", "supplier_name", "supplier_group", "country", "disabled", "modified"]
      : ["name", "customer_name", "customer_type", "customer_group", "territory", "disabled", "modified"],
    filters: [["disabled", "=", 0]],
    orFilters: keyword ? [["name", "like", `%${keyword}%`], [nameField, "like", `%${keyword}%`]] : undefined,
    orderBy: "modified desc",
    page: query.page,
    pageSize: query.pageSize
  });
  return { ...page, kind, route: isSupplier ? "supplier" : "customer" };
}

export async function getErpnextOverview(query: Pick<PageQuery, "fromDate" | "toDate"> = {}) {
  const dateRange = dateFilters("posting_date", query.fromDate, query.toDate);
  const activeInvoiceFilters: FrappeFilter[] = [["docstatus", "!=", 2], ...dateRange];
  const outstandingFilters: FrappeFilter[] = [...activeInvoiceFilters, ["outstanding_amount", ">", 0]];
  const paymentFilters: FrappeFilter[] = [["docstatus", "!=", 2], ...dateRange];
  const [
    connection,
    customerCount,
    supplierCount,
    salesInvoiceCount,
    purchaseInvoiceCount,
    paymentEntryCount,
    outstandingSalesInvoiceCount,
    outstandingPurchaseInvoiceCount,
    salesInvoices,
    purchaseInvoices,
    payments
  ] = await Promise.all([
    testErpnextConnection(),
    getCount("Customer", [["disabled", "=", 0]]),
    getCount("Supplier", [["disabled", "=", 0]]),
    getCount("Sales Invoice", activeInvoiceFilters),
    getCount("Purchase Invoice", activeInvoiceFilters),
    getCount("Payment Entry", paymentFilters),
    getCount("Sales Invoice", outstandingFilters),
    getCount("Purchase Invoice", outstandingFilters),
    getErpnextInvoices({ kind: "sales", fromDate: query.fromDate, toDate: query.toDate, pageSize: 8 }),
    getErpnextInvoices({ kind: "purchase", fromDate: query.fromDate, toDate: query.toDate, pageSize: 8 }),
    getErpnextPayments({ fromDate: query.fromDate, toDate: query.toDate, pageSize: 8 })
  ]);

  return {
    connection,
    counts: {
      customerCount,
      supplierCount,
      salesInvoiceCount,
      purchaseInvoiceCount,
      paymentEntryCount,
      outstandingSalesInvoiceCount,
      outstandingPurchaseInvoiceCount
    },
    salesInvoices: salesInvoices.rows,
    purchaseInvoices: purchaseInvoices.rows,
    payments: payments.rows,
    range: { fromDate: query.fromDate ?? null, toDate: query.toDate ?? null },
    fetchedAt: new Date().toISOString()
  };
}
