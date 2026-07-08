import { Router } from "express";
import { monthlyReportController } from "../controllers/reports.controller.js";

export const reportsRoutes = Router();

reportsRoutes.get("/monthly", monthlyReportController);
