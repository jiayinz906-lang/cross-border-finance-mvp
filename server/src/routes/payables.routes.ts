import { Router } from "express";
import { exportPayablesController, payablesController, paymentRecordsController, recordPaymentController, voidPaymentController } from "../controllers/payables.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const payablesRoutes = Router();

payablesRoutes.get("/", requirePermission("payables:read"), payablesController);
payablesRoutes.get("/export", requirePermission("payables:read"), requirePermission("reports:export"), exportPayablesController);
payablesRoutes.get("/settlements", requirePermission("payables:read"), paymentRecordsController);
payablesRoutes.post("/:id/payments", requirePermission("finance:import"), recordPaymentController);
payablesRoutes.post("/settlements/:id/void", requirePermission("finance:rollback"), voidPaymentController);
