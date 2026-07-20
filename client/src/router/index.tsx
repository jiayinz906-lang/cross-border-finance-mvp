import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import type { RouteObject } from "react-router-dom";

const BasicLayout = lazy(() => import("../layouts/BasicLayout").then((module) => ({ default: module.BasicLayout })));
const AgentRules = lazy(() => import("../pages/AgentRules"));
const Commission = lazy(() => import("../pages/Commission"));
const CustomerProfit = lazy(() => import("../pages/CustomerProfit"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const FinanceLedger = lazy(() => import("../pages/FinanceLedger"));
const OperatorPerformance = lazy(() => import("../pages/OperatorPerformance"));
const Payables = lazy(() => import("../pages/Payables"));
const ProfitAnalysis = lazy(() => import("../pages/ProfitAnalysis"));
const Receivables = lazy(() => import("../pages/Receivables"));
const Reports = lazy(() => import("../pages/Reports"));
const Risks = lazy(() => import("../pages/Risks"));
const ServiceConfirm = lazy(() => import("../pages/ServiceConfirm"));
const Settings = lazy(() => import("../pages/Settings"));
const SignatureConfirm = lazy(() => import("../pages/SignatureConfirm"));
const RawEntry = lazy(() => import("../pages/RawEntry"));
const FinanceOperations = lazy(() => import("../pages/FinanceOperations"));

function page(element: ReactNode) {
  return <Suspense fallback={<div className="route-loading">正在加载页面...</div>}>{element}</Suspense>;
}

export const routes: RouteObject[] = [
  {
    path: "/",
    element: page(<BasicLayout />),
    children: [
      { path: "dashboard", element: page(<Dashboard />) },
      { path: "finance-ledger", element: page(<FinanceLedger />) },
      { path: "receivables", element: page(<Receivables />) },
      { path: "payables", element: page(<Payables />) },
      { path: "profit-analysis", element: page(<ProfitAnalysis />) },
      { path: "commission", element: page(<Commission />) },
      { path: "service-confirm", element: page(<ServiceConfirm />) },
      { path: "signature-confirm", element: page(<SignatureConfirm />) },
      { path: "operator-performance", element: page(<OperatorPerformance />) },
      { path: "customer-profit", element: page(<CustomerProfit />) },
      { path: "risks", element: page(<Risks />) },
      { path: "reports", element: page(<Reports />) },
      { path: "agent-rules", element: page(<AgentRules />) },
      { path: "raw-entry", element: page(<RawEntry />) },
      { path: "finance-operations", element: page(<FinanceOperations />) },
      { path: "settings", element: page(<Settings />) }
    ]
  }
];
