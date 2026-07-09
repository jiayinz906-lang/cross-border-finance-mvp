import { Router } from "express";
import { commissionsController, updateCommissionRateController } from "../controllers/commissions.controller.js";

export const commissionsRoutes = Router();

commissionsRoutes.get("/", commissionsController);
commissionsRoutes.patch("/:id/rate", updateCommissionRateController);
