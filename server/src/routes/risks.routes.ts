import { Router } from "express";
import { risksController } from "../controllers/risks.controller.js";

export const risksRoutes = Router();

risksRoutes.get("/", risksController);
