import { Router } from "express";
import { commissionsRoutes } from "./commissions.routes.js";
import { agentRulesController } from "../controllers/finance.controller.js";
import { financeRoutes } from "./finance.routes.js";
import { healthRoutes } from "./health.routes.js";
import { payablesRoutes } from "./payables.routes.js";
import { profitRoutes } from "./profit.routes.js";
import { receivablesRoutes } from "./receivables.routes.js";
import { reportsRoutes } from "./reports.routes.js";
import { risksRoutes } from "./risks.routes.js";

export const routes = Router();

routes.use("/health", healthRoutes);
routes.use("/finance", financeRoutes);
routes.use("/receivables", receivablesRoutes);
routes.use("/payables", payablesRoutes);
routes.use("/profit", profitRoutes);
routes.use("/commissions", commissionsRoutes);
routes.use("/risks", risksRoutes);
routes.use("/reports", reportsRoutes);
routes.get("/agent/rules", agentRulesController);
