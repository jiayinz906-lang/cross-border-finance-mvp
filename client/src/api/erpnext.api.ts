import { request } from "./request";

export type ErpnextStatus = {
  configured: boolean;
  baseUrl: string | null;
  credentialMode: "server_token" | "not_configured";
  readOnly: boolean;
};

export type ErpnextConnection = ErpnextStatus & {
  connected: boolean;
  remoteUser: string;
  checkedAt: string;
};

export type ErpnextInvoice = {
  name: string;
  posting_date?: string;
  customer?: string;
  supplier?: string;
  grand_total?: number;
  outstanding_amount?: number;
  status?: string;
  currency?: string;
};

export type ErpnextOverview = {
  connection: ErpnextConnection;
  counts: {
    customerCount: number;
    supplierCount: number;
    salesInvoiceCount: number;
    purchaseInvoiceCount: number;
  };
  salesInvoices: ErpnextInvoice[];
  purchaseInvoices: ErpnextInvoice[];
  fetchedAt: string;
};

export function getErpnextStatus() {
  return request.get<ErpnextStatus>("/integrations/erpnext/status");
}

export function testErpnextConnection() {
  return request.post<ErpnextConnection>("/integrations/erpnext/test");
}

export function getErpnextOverview() {
  return request.get<ErpnextOverview>("/integrations/erpnext/overview");
}
