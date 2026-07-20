import { Router } from "express";
import { exportPayablesController, payablesController, paymentRecordsController, recordPaymentController, voidPaymentController } from "../controllers/payables.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const payablesRoutes = Router();

payablesRoutes.get("/", payablesController);
payablesRoutes.get("/export", requirePermission("reports:export"), exportPayablesController);
payablesRoutes.get("/settlements", paymentRecordsController);
payablesRoutes.post("/:id/payments", requirePermission("finance:import"), recordPaymentController);
payablesRoutes.post("/settlements/:id/void", requirePermission("finance:rollback"), voidPaymentController);
