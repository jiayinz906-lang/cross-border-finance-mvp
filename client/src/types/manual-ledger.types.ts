export type ManualLedgerDirection = "receivable" | "payable" | "other";
export type ManualLedgerSourceType = "manual" | "image_statement";
export type ManualLedgerStatus = "draft" | "confirmed" | "voided";

export type LedgerAttachment = {
  id: number;
  fileName: string;
  contentType: string;
  fileSize: number;
  sha256: string;
  createdAt: string;
};

export type ManualLedgerEntry = {
  id: number;
  entryNo: string;
  month: string;
  transactionDate: string;
  sourceType: ManualLedgerSourceType;
  direction: ManualLedgerDirection;
  counterparty: string;
  originalAmount: number;
  currency: string;
  exchangeRate: number;
  localAmount: number;
  businessType?: string | null;
  orderNo?: string | null;
  customerOrderNo?: string | null;
  salespersonName?: string | null;
  customerServiceName?: string | null;
  supplierName?: string | null;
  note?: string | null;
  status: ManualLedgerStatus;
  createdBy: string;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  voidedBy?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: LedgerAttachment[];
};

export type ManualLedgerSummary = {
  totalRecords: number;
  receivable: number;
  payable: number;
  localAmount: number;
  imageRecords: number;
  attachmentCount: number;
  draftRecords: number;
};

export type ManualLedgerListResult = {
  rows: ManualLedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
};
