import { Router } from "express";
import {
  customerProfitController,
  operatorPerformanceController,
  updateOperatorPerformanceOverrideController,
  updateOperatorPerformancePayoutNoteController
} from "../controllers/analytics.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const analyticsRoutes = Router();

analyticsRoutes.get("/customer-profit", customerProfitController);
analyticsRoutes.get("/operator-performance", operatorPerformanceController);
analyticsRoutes.put("/operator-performance/overrides", requirePermission("confirmation:approve"), updateOperatorPerformanceOverrideController);
analyticsRoutes.put("/operator-performance/payout-note", requirePermission("confirmation:approve"), updateOperatorPerformancePayoutNoteController);
