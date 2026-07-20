import { Router } from "express";
import {
  erpnextInvoicesController,
  erpnextOverviewController,
  erpnextPartiesController,
  erpnextPaymentsController,
  erpnextStatusController,
  testErpnextController
} from "../controllers/erpnext.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const erpnextRoutes = Router();

erpnextRoutes.get("/status", requirePermission("finance:read"), erpnextStatusController);
erpnextRoutes.post("/test", requirePermission("finance:read"), testErpnextController);
erpnextRoutes.get("/overview", requirePermission("finance:read"), erpnextOverviewController);
erpnextRoutes.get("/invoices", requirePermission("finance:read"), erpnextInvoicesController);
erpnextRoutes.get("/payments", requirePermission("finance:read"), erpnextPaymentsController);
erpnextRoutes.get("/parties", requirePermission("finance:read"), erpnextPartiesController);
