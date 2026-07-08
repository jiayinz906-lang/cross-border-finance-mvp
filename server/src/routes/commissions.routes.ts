import { Router } from "express";
import { commissionsController } from "../controllers/commissions.controller.js";

export const commissionsRoutes = Router();

commissionsRoutes.get("/", commissionsController);
