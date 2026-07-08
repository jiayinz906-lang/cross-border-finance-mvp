import { Router } from "express";
import { profitAnalysisController } from "../controllers/profit.controller.js";

export const profitRoutes = Router();

profitRoutes.get("/analysis", profitAnalysisController);
