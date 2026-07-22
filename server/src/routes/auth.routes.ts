import { Router } from "express";
import {
  changePasswordController,
  createUserController,
  listUsersController,
  loginController,
  meController,
  notificationStatusController,
  syncStaffUsersController,
  updateUserController
} from "../controllers/auth.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const authRoutes = Router();

authRoutes.post("/login", loginController);
authRoutes.get("/me", meController);
authRoutes.post("/change-password", changePasswordController);
authRoutes.get("/users", requirePermission("users:manage"), listUsersController);
authRoutes.post("/users", requirePermission("users:manage"), createUserController);
authRoutes.post("/users/sync-staff", requirePermission("users:manage"), syncStaffUsersController);
authRoutes.patch("/users/:id", requirePermission("users:manage"), updateUserController);
authRoutes.get("/notification-status", requirePermission("users:manage"), notificationStatusController);
