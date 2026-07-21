import { request } from "./request";

export type OperationsOverview = {
  month: string;
  partners: number;
  invoiceCount: number;
  invoiceAmount: number;
  allocatedAmount: number;
  unmatchedBank: number;
  pendingTasks: number;
  overdueInvoices: number;
};

export type BusinessPartner = {
  id: number;
  partnerCode: string;
  partnerType: string;
  name: string;
  taxNumber?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  currency: string;
  creditLimit: number;
  paymentTermDays: number;
  isActive: boolean;
  aliases?: Array<{ id: number; alias: string; normalizedAlias: string; source: string }>;
};

export type FinanceInvoice = {
  id: number;
  invoiceNo: string;
  invoiceType: string;
  orderNo?: string | null;
  localAmount: number;
  allocatedAmount: number;
  issuedAt: string;
  dueAt: string;
  status: string;
  partner?: BusinessPartner | null;
  financeOrder?: { customerOrderNo?: string | null; salespersonName: string; customerServiceName?: string | null } | null;
};

export type ReconciliationMatch = {
  id: number;
  suggestedAmount: number;
  score: number;
  matchReason: string;
  invoice: FinanceInvoice;
};

export type BankTransaction = {
  id: number;
  transactionNo: string;
  transactionDate: string;
  direction: string;
  counterparty: string;
  localAmount: number;
  matchedAmount: number;
  status: string;
  reconciliationMatches: ReconciliationMatch[];
};

export type WorkflowTask = {
  id: number;
  title: string;
  description?: string | null;
  ownerRole: string;
  ownerName?: string | null;
  priority: string;
  status: string;
  route?: string | null;
  dueAt?: string | null;
};

export const getOperationsOverview = (month: string) => request.get<OperationsOverview>("/operations/overview", { params: { month } });
export const getPartners = (params: Record<string, unknown>) => request.get("/operations/partners", { params });
export const createPartner = (payload: Record<string, unknown>) => request.post("/operations/partners", payload);
export const updatePartner = (id: number, payload: Record<string, unknown>) => request.put(`/operations/partners/${id}`, payload);
export const getInvoices = (params: Record<string, unknown>) => request.get("/operations/invoices", { params });
export const syncInvoices = (month: string) => request.post("/operations/invoices/sync", { month });
export const getBankTransactions = (params: Record<string, unknown>) => request.get("/operations/bank-transactions", { params });
export const createBankTransaction = (payload: Record<string, unknown>) => request.post("/operations/bank-transactions", payload);
export const suggestMatches = (id: number) => request.post(`/operations/bank-transactions/${id}/suggest`);
export const confirmMatch = (id: number, amount: number) => request.post(`/operations/reconciliation/${id}/confirm`, { amount });
export const getWorkflowTasks = (params: Record<string, unknown>) => request.get("/operations/tasks", { params });
export const resolveWorkflowTask = (id: number) => request.post(`/operations/tasks/${id}/resolve`);
