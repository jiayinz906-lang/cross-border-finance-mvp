export type FinanceOrder = {
  id: number;
  orderNo: string;
  customerOrderNo?: string | null;
  orderDate: string;
  month: string;
  customerName: string;
  customerType: string;
  salespersonName: string;
  customerServiceName?: string | null;
  businessType: string;
  supplierName?: string | null;
  currency: string;
  exchangeRate?: number | null;
  exchangeRateStatus: string;
  receivableCompensation?: number;
  payableCompensation?: number;
  adjustedReceivable: number;
  adjustedPayable: number;
  adjustedGrossProfit: number;
  adjustedGrossProfitRate: number | null;
  receivedAmount: number;
  paidAmount: number;
  receivableStatus: string;
  payableStatus: string;
  isServiceBusiness: boolean;
  needSupervisorConfirm: boolean;
  calculationNote?: string | null;
};

export type FinanceSummary = {
  month: string;
  totalReceivable: number;
  totalPayable: number;
  totalReceived: number;
  totalPaid: number;
  totalGrossProfit: number;
  grossProfitRate: number | null;
  totalCommission: number;
  riskOrderCount: number;
  abnormalHighProfitOrderCount: number;
  pendingSupervisorConfirmCount: number;
};

export type BusinessSummary = {
  businessType: string;
  orderCount: number;
  receivable: number;
  payable: number;
  grossProfit: number;
  logisticsProfit: number;
  grossProfitRate: number | null;
  momGrossProfitChange: number | null;
  yoyGrossProfitChange: number | null;
};

export type MonthlyTrend = {
  month: string;
  receivable: number;
  payable: number;
  grossProfit: number;
  grossProfitRate: number | null;
  commission: number;
};

export type SalespersonSummary = {
  rank: number;
  salespersonName: string;
  orderCount: number;
  receivable: number;
  grossProfit: number;
  commission: number;
  highRiskOrderCount: number;
  signatureStatus: "confirmed" | "signed" | "pending" | "not_generated" | string;
};

export type SupplierPayableSummary = {
  supplierName: string;
  orderCount: number;
  payable: number;
  paid: number;
  outstanding: number;
  ratio: number;
};

export type CustomerProfitSummary = {
  customerName: string;
  orderCount: number;
  receivable: number;
  payable: number;
  grossProfit: number;
  grossProfitRate: number | null;
  receivableRatio: number;
  profitRatio: number;
};

export type RiskOverview = {
  highRiskCount: number;
  mediumRiskCount: number;
  negativeProfitCount: number;
  lowProfitUnderFiveCount: number;
  abnormalHighProfitCount: number;
  exchangeRateMissingCount: number;
  costMissingCount: number;
  openRiskCount: number;
  reviewedRiskCount: number;
  topRiskReason?: string | null;
};

export type DashboardData = {
  summary: FinanceSummary | null;
  orderCount: number;
  logisticsOrderCount: number;
  serviceOrderCount: number;
  logisticsProfit: number;
  serviceProfit: number;
  businessSummary: BusinessSummary[];
  salespersonSummary: SalespersonSummary[];
  supplierPayableSummary: SupplierPayableSummary[];
  customerProfitSummary: CustomerProfitSummary[];
  riskOverview: RiskOverview;
  monthlyTrend: MonthlyTrend[];
  comparison: {
    month: string | null;
    momGrossProfit: number | null;
    yoyGrossProfit: number | null;
    momReceivable: number | null;
    yoyReceivable: number | null;
    momPayable: number | null;
    yoyPayable: number | null;
    momGrossProfitRate: number | null;
    yoyGrossProfitRate: number | null;
    momOrderCount: number | null;
    yoyOrderCount: number | null;
    momCommission: number | null;
    yoyCommission: number | null;
    momRiskOrderCount: number | null;
    yoyRiskOrderCount: number | null;
  };
};

export type ImportResult = {
  batchId?: number;
  batchNo?: string;
  fileName: string;
  sheetName: string;
  month: string;
  importedRows: number;
  importedOrders: number;
  serviceOrders: number;
  logisticsOrders: number;
  audit?: ImportAudit;
  qualityReport?: ImportQualityReport;
};

export type ImportPreviewResult = ImportResult & {
  totalReceivable: number;
  totalPayable: number;
  totalGrossProfit: number;
  grossProfitRate: number | null;
  riskOrderCount: number;
  abnormalHighProfitOrderCount: number;
  pendingSupervisorConfirmCount: number;
  sampleOrders: Array<{
    orderNo: string;
    customerOrderNo?: string | null;
    businessType: string;
    salespersonName: string;
    customerServiceName?: string | null;
    receivable: number;
    payable: number;
    grossProfit: number;
    grossProfitRate: number | null;
    needSupervisorConfirm: boolean;
  }>;
  writeMode: string;
};

export type ImportBatch = {
  id: number;
  batchNo: string;
  month: string;
  fileName: string;
  sheetName: string;
  importMode: string;
  status: "active" | "superseded" | "reverted" | string;
  importedRows: number;
  importedOrders: number;
  logisticsOrders: number;
  serviceOrders: number;
  totalReceivable: number;
  totalPayable: number;
  totalGrossProfit: number;
  riskOrderCount: number;
  abnormalHighProfitCount: number;
  templateAuditJson?: string | null;
  previewJson?: string | null;
  createdAt: string;
  revertedAt?: string | null;
};

export type RawLedgerLine = {
  id: number;
  importBatchId: number;
  month: string;
  orderNo?: string | null;
  customerOrderNo?: string | null;
  rowIndex: number;
  sheetName: string;
  sourceFileName: string;
  rowHash: string;
  parseStatus: string;
  parseMessage?: string | null;
  raw: Record<string, unknown>;
  canonical: Record<string, unknown>;
};

export type ParameterRule = {
  id: number;
  ruleKey: string;
  ruleGroup: string;
  label: string;
  value: unknown;
  valueJson: string;
  description?: string | null;
  updatedBy: string;
  updatedAt: string;
};

export type AuthRole = {
  role: string;
  label: string;
  permissions: string[];
};

export type AuthContext = AuthRole & {
  roles: AuthRole[];
};

export type ReadinessStatus = {
  status: "ready" | "not_ready" | string;
  service: string;
  timestamp: string;
  checks: {
    database: boolean;
    importTemplate: boolean;
    parameterRules: boolean;
    financeSummary: boolean;
  };
  details?: {
    templateCount?: number;
    activeRuleCount?: number;
    month?: string;
    environment?: string;
    version?: string;
    latestImportBatch?: {
      batchNo: string;
      fileName: string;
      status: string;
      importedRows: number;
      importedOrders: number;
      logisticsOrders: number;
      serviceOrders: number;
      createdAt: string;
    } | null;
    summary?: {
      totalReceivable: number;
      totalPayable: number;
      totalGrossProfit: number;
      riskOrderCount: number;
      updatedAt: string;
    } | null;
    error?: string;
  };
};

export type ImportTemplate = {
  id: number;
  templateKey: string;
  fileName: string;
  sheetName: string;
  headerRowIndex: number;
  headerCount: number;
  headers: string[];
  createdAt: string;
  updatedAt: string;
};

export type ImportTemplateResult = {
  templateKey: string;
  fileName: string;
  sheetName: string;
  headerRowIndex: number;
  headerCount: number;
  headers: string[];
  importedRows: 0;
  importedOrders: 0;
  audit?: ImportAudit;
};

export type ImportAudit = {
  parserMode: string;
  fieldMapping: Array<{ field: string; sourceHeader: string }>;
  missingRequiredFields: string[];
  template: {
    matchExact: boolean;
    missingTemplateHeaders: string[];
    extraHeaders: string[];
  };
  agency?: {
    source: string;
    financeAgents: Array<{ name: string; sourcePath: string; role: string }>;
    testingAgents: Array<{ name: string; sourcePath: string; role: string }>;
    importRules: string[];
  };
  selfHostedStack?: unknown;
};

export type ImportQualityIssue = {
  key: string;
  level: "error" | "warning" | "info";
  title: string;
  count: number;
  orderNos: string[];
  message: string;
};

export type ImportQualityReport = {
  blockingCount: number;
  warningCount: number;
  infoCount: number;
  issues: ImportQualityIssue[];
};
