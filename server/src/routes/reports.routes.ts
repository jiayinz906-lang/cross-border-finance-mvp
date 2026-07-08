import { Router } from "express";
import { monthlyReportController, monthlyReportExportController } from "../controllers/reports.controller.js";

export const reportsRoutes = Router();

reportsRoutes.get("/monthly", monthlyReportController);
reportsRoutes.get("/monthly/export", monthlyReportExportController);
