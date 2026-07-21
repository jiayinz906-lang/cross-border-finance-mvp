import { Router } from "express";
import { reviewRiskController, risksController } from "../controllers/risks.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const risksRoutes = Router();

risksRoutes.get("/", requirePermission("risk:read"), risksController);
risksRoutes.post("/:id/review", requirePermission("risk:review"), reviewRiskController);
