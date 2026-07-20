import { request } from "./request";

export type ErpnextStatus = {
  configured: boolean;
  baseUrl: string | null;
  credentialMode: "server_token" | "not_configured";
  readOnly: boolean;
  supportedResources: string[];
  sourceRepository: string;
};

export type ErpnextConnection = ErpnextStatus & {
  connected: boolean;
  remoteUser: string;
  latencyMs: number;
  checkedAt: string;
};

export type ErpnextInvoice = {
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

export type ErpnextPayment = {
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

export type ErpnextParty = {
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

export type ErpnextPage<T> = {
  rows: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  route: string;
};

export type ErpnextOverview = {
  connection: ErpnextConnection;
  counts: {
    customerCount: number;
    supplierCount: number;
    salesInvoiceCount: number;
    purchaseInvoiceCount: number;
    paymentEntryCount: number;
    outstandingSalesInvoiceCount: number;
    outstandingPurchaseInvoiceCount: number;
  };
  salesInvoices: ErpnextInvoice[];
  purchaseInvoices: ErpnextInvoice[];
  payments: ErpnextPayment[];
  range: { fromDate: string | null; toDate: string | null };
  fetchedAt: string;
};

type DateParams = { fromDate?: string; toDate?: string };

export function getErpnextStatus() {
  return request.get<ErpnextStatus>("/integrations/erpnext/status");
}

export function testErpnextConnection() {
  return request.post<ErpnextConnection>("/integrations/erpnext/test");
}

export function getErpnextOverview(params?: DateParams) {
  return request.get<ErpnextOverview>("/integrations/erpnext/overview", { params });
}

export function getErpnextInvoices(params: DateParams & {
  kind: "sales" | "purchase";
  status?: "all" | "outstanding" | "paid" | "overdue" | "return";
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  return request.get<ErpnextPage<ErpnextInvoice> & { kind: "sales" | "purchase" }>("/integrations/erpnext/invoices", { params });
}

export function getErpnextPayments(params: DateParams & {
  paymentType?: "all" | "receive" | "pay" | "transfer";
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  return request.get<ErpnextPage<ErpnextPayment>>("/integrations/erpnext/payments", { params });
}

export function getErpnextParties(params: {
  kind: "customer" | "supplier";
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  return request.get<ErpnextPage<ErpnextParty> & { kind: "customer" | "supplier" }>("/integrations/erpnext/parties", { params });
}
