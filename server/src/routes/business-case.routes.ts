import { Router } from "express";
import { commentBusinessCase, createBusinessCase, listBusinessCases, updateBusinessCase } from "../controllers/business-case.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const businessCaseRoutes = Router();
businessCaseRoutes.get("/", requirePermission("service:read"), listBusinessCases);
businessCaseRoutes.post("/", requirePermission("confirmation:approve"), createBusinessCase);
businessCaseRoutes.patch("/:id", requirePermission("confirmation:approve"), updateBusinessCase);
businessCaseRoutes.post("/:id/comments", requirePermission("service:read"), commentBusinessCase);
