import { Router } from "express";
import { customerProfitController, operatorPerformanceController } from "../controllers/analytics.controller.js";

export const analyticsRoutes = Router();

analyticsRoutes.get("/customer-profit", customerProfitController);
analyticsRoutes.get("/operator-performance", operatorPerformanceController);
