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
};

export type MonthlyTrend = {
  month: string;
  receivable: number;
  payable: number;
  grossProfit: number;
  grossProfitRate: number | null;
  commission: number;
};

export type DashboardData = {
  summary: FinanceSummary | null;
  orderCount: number;
  logisticsOrderCount: number;
  serviceOrderCount: number;
  logisticsProfit: number;
  serviceProfit: number;
  businessSummary: BusinessSummary[];
  monthlyTrend: MonthlyTrend[];
  comparison: {
    month: string | null;
    momGrossProfit: number | null;
    yoyGrossProfit: number | null;
    momReceivable: number | null;
    yoyReceivable: number | null;
  };
};

export type ImportResult = {
  fileName: string;
  sheetName: string;
  month: string;
  importedRows: number;
  importedOrders: number;
  serviceOrders: number;
  logisticsOrders: number;
  audit?: ImportAudit;
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
