import { Router } from "express";
import { healthController, operationsController, readinessController } from "../controllers/health.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const healthRoutes = Router();

healthRoutes.get("/", healthController);
healthRoutes.get("/ready", requirePermission("operations:read"), readinessController);
healthRoutes.get("/status", requirePermission("operations:read"), operationsController);
