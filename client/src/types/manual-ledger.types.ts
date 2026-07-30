export type ManualLedgerDirection = "receivable" | "payable" | "other";
export type ManualLedgerSourceType = "manual" | "image_statement" | "manual_erp";
export type ManualLedgerStatus = "draft" | "confirmed" | "voided";

export type LedgerAttachment = {
  id: number;
  entryId: number;
  fileName: string;
  contentType: string;
  fileSize: number;
  sha256: string;
  createdAt: string;
};

export type ManualLedgerEntry = {
  id: number;
  entryNo: string;
  documentNo?: string | null;
  lineNo: number;
  month: string;
  transactionDate: string;
  sourceType: ManualLedgerSourceType;
  direction: ManualLedgerDirection;
  counterparty: string;
  customerName?: string | null;
  originalAmount: number;
  currency: string;
  exchangeRate: number;
  localAmount: number;
  convertedAmount?: number | null;
  unitPrice?: number | null;
  businessType?: string | null;
  feeType?: string | null;
  orderNo?: string | null;
  customerOrderNo?: string | null;
  salespersonName?: string | null;
  customerServiceName?: string | null;
  supplierName?: string | null;
  supplierService?: string | null;
  chargeWeight?: number | null;
  supplierChargeWeight?: number | null;
  actualWeight?: number | null;
  pieces?: number | null;
  mainProductName?: string | null;
  internalRemark?: string | null;
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

export type ManualLedgerDocument = {
  documentNo: string;
  month: string;
  transactionDate: string;
  sourceType: "manual_erp";
  orderNo: string;
  customerOrderNo?: string | null;
  customerName: string;
  businessType: string;
  chargeWeight?: number | null;
  supplierChargeWeight?: number | null;
  salespersonName: string;
  customerServiceName: string;
  actualWeight?: number | null;
  pieces?: number | null;
  mainProductName?: string | null;
  internalRemark?: string | null;
  note?: string | null;
  status: ManualLedgerStatus;
  receivable: number;
  payable: number;
  createdBy: string;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  voidedBy?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  createdAt: string;
  updatedAt: string;
  lines: ManualLedgerEntry[];
  attachments: LedgerAttachment[];
};

export type ManualDocumentLineInput = {
  direction: ManualLedgerDirection;
  feeType: string;
  supplierName?: string;
  supplierService?: string;
  counterparty?: string;
  originalAmount: number;
  unitPrice?: number;
  currency: string;
  exchangeRate: number;
  localAmount?: number;
  convertedAmount?: number;
  note?: string;
};

export type ManualDocumentInput = {
  month: string;
  transactionDate: string;
  orderNo: string;
  customerOrderNo?: string;
  customerName: string;
  businessType: string;
  chargeWeight?: number;
  supplierChargeWeight?: number;
  salespersonName: string;
  customerServiceName: string;
  actualWeight?: number;
  pieces?: number;
  mainProductName?: string;
  internalRemark?: string;
  note?: string;
  lines: ManualDocumentLineInput[];
};

export type ManualLedgerSummary = {
  totalRecords: number;
  totalLines: number;
  receivable: number;
  payable: number;
  localAmount: number;
  imageRecords: number;
  attachmentCount: number;
  draftRecords: number;
  draftLines: number;
};

export type ManualLedgerListResult = { rows: ManualLedgerEntry[]; total: number; page: number; pageSize: number };
export type ManualDocumentListResult = { rows: ManualLedgerDocument[]; total: number; page: number; pageSize: number };
