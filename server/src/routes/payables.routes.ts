import { Router } from "express";
import { payablesController } from "../controllers/payables.controller.js";

export const payablesRoutes = Router();

payablesRoutes.get("/", payablesController);
