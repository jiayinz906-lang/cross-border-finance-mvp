import { Router } from "express";
import { exportReceivablesController, receivablesController, receiptRecordsController, recordReceiptController, voidReceiptController } from "../controllers/receivables.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const receivablesRoutes = Router();

receivablesRoutes.get("/", requirePermission("receivables:read"), receivablesController);
receivablesRoutes.get("/export", requirePermission("receivables:read"), requirePermission("reports:export"), exportReceivablesController);
receivablesRoutes.get("/settlements", requirePermission("receivables:read"), receiptRecordsController);
receivablesRoutes.post("/:id/receipts", requirePermission("finance:import"), recordReceiptController);
receivablesRoutes.post("/settlements/:id/void", requirePermission("finance:rollback"), voidReceiptController);
