import { Router } from "express";
import { commissionsController, updateCommissionRateController } from "../controllers/commissions.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const commissionsRoutes = Router();

commissionsRoutes.get("/", commissionsController);
commissionsRoutes.patch("/:id/rate", requirePermission("confirmation:approve"), updateCommissionRateController);
