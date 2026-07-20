import { Router } from "express";
import {
  bankTransactionsController,
  confirmReconciliationController,
  createBankTransactionController,
  createPartnerController,
  invoicesController,
  operationsOverviewController,
  partnersController,
  resolveTaskController,
  suggestReconciliationController,
  syncInvoicesController,
  tasksController,
  updatePartnerController
} from "../controllers/operations.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const operationsRoutes = Router();

operationsRoutes.use(requirePermission("operations:read"));

operationsRoutes.get("/overview", operationsOverviewController);
operationsRoutes.get("/partners", partnersController);
operationsRoutes.post("/partners", requirePermission("master:write"), createPartnerController);
operationsRoutes.put("/partners/:id", requirePermission("master:write"), updatePartnerController);
operationsRoutes.get("/invoices", invoicesController);
operationsRoutes.post("/invoices/sync", requirePermission("billing:write"), syncInvoicesController);
operationsRoutes.get("/bank-transactions", bankTransactionsController);
operationsRoutes.post("/bank-transactions", requirePermission("reconciliation:write"), createBankTransactionController);
operationsRoutes.post("/bank-transactions/:id/suggest", requirePermission("reconciliation:write"), suggestReconciliationController);
operationsRoutes.post("/reconciliation/:id/confirm", requirePermission("reconciliation:write"), confirmReconciliationController);
operationsRoutes.get("/tasks", tasksController);
operationsRoutes.post("/tasks/:id/resolve", requirePermission("task:manage"), resolveTaskController);
