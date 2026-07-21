import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import type { RouteObject } from "react-router-dom";
import { PageAccessGuard } from "../components/PageAccessGuard";
import type { PagePermission } from "../config/access";

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

function protectedPage(permission: PagePermission, element: ReactNode) {
  return page(<PageAccessGuard permission={permission}>{element}</PageAccessGuard>);
}

export const routes: RouteObject[] = [
  {
    path: "/",
    element: page(<BasicLayout />),
    children: [
      { path: "dashboard", element: protectedPage("dashboard:read", <Dashboard />) },
      { path: "finance-ledger", element: protectedPage("ledger:read", <FinanceLedger />) },
      { path: "receivables", element: protectedPage("receivables:read", <Receivables />) },
      { path: "payables", element: protectedPage("payables:read", <Payables />) },
      { path: "profit-analysis", element: protectedPage("profit:read", <ProfitAnalysis />) },
      { path: "commission", element: protectedPage("commission:read", <Commission />) },
      { path: "service-confirm", element: protectedPage("service:read", <ServiceConfirm />) },
      { path: "signature-confirm", element: protectedPage("confirmation:read", <SignatureConfirm />) },
      { path: "operator-performance", element: protectedPage("performance:read", <OperatorPerformance />) },
      { path: "customer-profit", element: protectedPage("customer-profit:read", <CustomerProfit />) },
      { path: "risks", element: protectedPage("risk:read", <Risks />) },
      { path: "reports", element: protectedPage("reports:read", <Reports />) },
      { path: "agent-rules", element: protectedPage("settings:read", <AgentRules />) },
      { path: "raw-entry", element: protectedPage("ledger:read", <RawEntry />) },
      { path: "finance-operations", element: protectedPage("operations:read", <FinanceOperations />) },
      { path: "settings", element: protectedPage("settings:read", <Settings />) }
    ]
  }
];
