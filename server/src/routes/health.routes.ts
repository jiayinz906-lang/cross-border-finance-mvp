import { Router } from "express";
import { healthController, operationsController, readinessController } from "../controllers/health.controller.js";

export const healthRoutes = Router();

healthRoutes.get("/", healthController);
healthRoutes.get("/ready", readinessController);
healthRoutes.get("/status", operationsController);
