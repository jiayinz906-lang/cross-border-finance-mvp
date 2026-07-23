import { Router } from "express";
import {
  customerProfitController,
  operatorPerformanceController,
  updateOperatorPerformanceOverrideController,
  updateOperatorPerformancePayoutNoteController
} from "../controllers/analytics.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const analyticsRoutes = Router();

analyticsRoutes.get("/customer-profit", requirePermission("customer-profit:read"), customerProfitController);
analyticsRoutes.get("/operator-performance", requirePermission("operator_performance:view"), operatorPerformanceController);
analyticsRoutes.put("/operator-performance/overrides", requirePermission("operator_performance:edit"), updateOperatorPerformanceOverrideController);
analyticsRoutes.put("/operator-performance/payout-note", requirePermission("operator_performance:edit"), updateOperatorPerformancePayoutNoteController);
