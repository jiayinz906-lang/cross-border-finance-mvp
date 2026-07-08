import type { RouteObject } from "react-router-dom";
import { BasicLayout } from "../layouts/BasicLayout";
import AgentRules from "../pages/AgentRules";
import Commission from "../pages/Commission";
import Dashboard from "../pages/Dashboard";
import FinanceLedger from "../pages/FinanceLedger";
import Payables from "../pages/Payables";
import ProfitAnalysis from "../pages/ProfitAnalysis";
import Receivables from "../pages/Receivables";
import Reports from "../pages/Reports";
import Risks from "../pages/Risks";
import ServiceConfirm from "../pages/ServiceConfirm";
import Settings from "../pages/Settings";
import SignatureConfirm from "../pages/SignatureConfirm";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <BasicLayout />,
    children: [
      { path: "dashboard", element: <Dashboard /> },
      { path: "finance-ledger", element: <FinanceLedger /> },
      { path: "receivables", element: <Receivables /> },
      { path: "payables", element: <Payables /> },
      { path: "profit-analysis", element: <ProfitAnalysis /> },
      { path: "commission", element: <Commission /> },
      { path: "service-confirm", element: <ServiceConfirm /> },
      { path: "signature-confirm", element: <SignatureConfirm /> },
      { path: "risks", element: <Risks /> },
      { path: "reports", element: <Reports /> },
      { path: "agent-rules", element: <AgentRules /> },
      { path: "settings", element: <Settings /> }
    ]
  }
];
