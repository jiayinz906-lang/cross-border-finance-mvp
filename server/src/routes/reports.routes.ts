import { Router } from "express";
import { monthlyReportController, monthlyReportExportController, serviceRecordsController } from "../controllers/reports.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const reportsRoutes = Router();

reportsRoutes.get("/service-records", requirePermission("service:read"), serviceRecordsController);
reportsRoutes.get("/monthly", requirePermission("reports:read"), monthlyReportController);
reportsRoutes.get("/monthly/export", requirePermission("reports:read"), requirePermission("reports:export"), monthlyReportExportController);
