import { Router } from "express";
import { profitAnalysisController } from "../controllers/profit.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const profitRoutes = Router();

profitRoutes.get("/analysis", requirePermission("profit:read"), profitAnalysisController);
