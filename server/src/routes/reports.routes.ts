import { Router } from "express";
import { monthlyReportController, monthlyReportExportController } from "../controllers/reports.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const reportsRoutes = Router();

reportsRoutes.get("/monthly", monthlyReportController);
reportsRoutes.get("/monthly/export", requirePermission("reports:export"), monthlyReportExportController);
