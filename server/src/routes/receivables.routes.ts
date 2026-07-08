import { Router } from "express";
import { receivablesController } from "../controllers/receivables.controller.js";

export const receivablesRoutes = Router();

receivablesRoutes.get("/", receivablesController);
