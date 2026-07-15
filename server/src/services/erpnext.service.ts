import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

type FrappeResponse<T> = {
  data?: T;
  message?: T;
  exc?: string;
  exc_type?: string;
};

type InvoiceRow = {
  name: string;
  posting_date?: string;
  customer?: string;
  supplier?: string;
  grand_total?: number;
  outstanding_amount?: number;
  status?: string;
  currency?: string;
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
      const detail = payload.exc_type || payload.exc || response.statusText;
      const status = response.status === 401 ? 401 : response.status === 403 ? 403 : 502;
      throw new AppError(status, "ERPNEXT_REQUEST_FAILED", `ERPNext 接口请求失败：${detail || response.status}`);
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

async function getCount(doctype: string) {
  const response = await erpnextRequest<number>("api/method/frappe.client.get_count", { doctype });
  return Number(response.message ?? 0);
}

async function getRecentInvoices(doctype: "Sales Invoice" | "Purchase Invoice") {
  const fields = doctype === "Sales Invoice"
    ? ["name", "posting_date", "customer", "grand_total", "outstanding_amount", "status", "currency"]
    : ["name", "posting_date", "supplier", "grand_total", "outstanding_amount", "status", "currency"];
  const response = await erpnextRequest<InvoiceRow[]>(`api/resource/${encodeURIComponent(doctype)}`, {
    fields: JSON.stringify(fields),
    order_by: "posting_date desc, modified desc",
    limit_page_length: "10"
  });
  return response.data ?? [];
}

export function getErpnextStatus() {
  const config = integrationConfig();
  return {
    configured: config.configured,
    baseUrl: config.baseUrl || null,
    credentialMode: config.configured ? "server_token" : "not_configured",
    readOnly: true
  };
}

export async function testErpnextConnection() {
  const response = await erpnextRequest<string>("api/method/frappe.auth.get_logged_user");
  return {
    ...getErpnextStatus(),
    connected: true,
    remoteUser: response.message || "unknown",
    checkedAt: new Date().toISOString()
  };
}

export async function getErpnextOverview() {
  const [connection, customerCount, supplierCount, salesInvoiceCount, purchaseInvoiceCount, salesInvoices, purchaseInvoices] = await Promise.all([
    testErpnextConnection(),
    getCount("Customer"),
    getCount("Supplier"),
    getCount("Sales Invoice"),
    getCount("Purchase Invoice"),
    getRecentInvoices("Sales Invoice"),
    getRecentInvoices("Purchase Invoice")
  ]);

  return {
    connection,
    counts: { customerCount, supplierCount, salesInvoiceCount, purchaseInvoiceCount },
    salesInvoices,
    purchaseInvoices,
    fetchedAt: new Date().toISOString()
  };
}
