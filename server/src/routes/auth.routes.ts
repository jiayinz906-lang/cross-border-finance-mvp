import { Router } from "express";
import { loginController, meController } from "../controllers/auth.controller.js";

export const authRoutes = Router();

authRoutes.post("/login", loginController);
authRoutes.get("/me", meController);
