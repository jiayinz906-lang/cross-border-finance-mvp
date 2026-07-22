import { Router } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import {
  agentRulesController,
  authContextController,
  chargeLinesController,
  dashboardController,
  importBatchesController,
  importBatchSourceController,
  importExcelController,
  importPreviewController,
  importTemplateController,
  importTemplatesController,
  listLedgerController,
  monthsController,
  parameterRulesController,
  rawLedgerLinesController,
  resetBusinessDataController,
  rollbackImportBatchController,
  summaryController,
  updateParameterRuleController
} from "../controllers/finance.controller.js";
import {
  confirmManualLedgerController,
  createManualLedgerController,
  listManualLedgerController,
  manualLedgerAttachmentController,
  manualLedgerSummaryController,
  voidManualLedgerController
} from "../controllers/manual-ledger.controller.js";

export const financeRoutes = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.uploadMaxMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const validExtension = /\.(xlsx|xls)$/i.test(file.originalname);
    if (validExtension) callback(null, true);
    else callback(new Error("仅支持 .xlsx 或 .xls 文件。"));
  }
});
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.imageUploadMaxMb * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, callback) => {
    const validExtension = /\.(jpe?g|png|webp)$/i.test(file.originalname);
    const validMime = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    if (validExtension && validMime) callback(null, true);
    else callback(new Error("仅支持 JPG、PNG 或 WebP 图片。"));
  }
});

financeRoutes.get("/ledger", requirePermission("ledger:read"), listLedgerController);
financeRoutes.get("/auth-context", authContextController);
financeRoutes.get("/summary", requirePermission("dashboard:read"), summaryController);
financeRoutes.get("/dashboard", requirePermission("dashboard:read"), dashboardController);
financeRoutes.get("/months", requirePermission("finance:read"), monthsController);
financeRoutes.get("/parameter-rules", requirePermission("rules:read"), parameterRulesController);
financeRoutes.put("/parameter-rules/:ruleKey", requirePermission("rules:write"), updateParameterRuleController);
financeRoutes.get("/import-templates", requirePermission("finance:import"), importTemplatesController);
financeRoutes.get("/import-batches", requirePermission("finance:import"), importBatchesController);
financeRoutes.get("/import-batches/:id/source", requirePermission("finance:import"), importBatchSourceController);
financeRoutes.get("/raw-ledger-lines", requirePermission("finance:import"), rawLedgerLinesController);
financeRoutes.get("/charge-lines", requirePermission("finance:import"), chargeLinesController);
financeRoutes.get("/manual-entries", requirePermission("finance:import"), listManualLedgerController);
financeRoutes.get("/manual-entries/summary", requirePermission("finance:import"), manualLedgerSummaryController);
financeRoutes.get("/manual-entries/:id/attachments/:attachmentId", requirePermission("finance:import"), manualLedgerAttachmentController);
financeRoutes.post("/manual-entries", requirePermission("finance:import"), imageUpload.array("files", 6), createManualLedgerController);
financeRoutes.post("/manual-entries/:id/confirm", requirePermission("finance:import"), confirmManualLedgerController);
financeRoutes.post("/manual-entries/:id/void", requirePermission("finance:import"), voidManualLedgerController);
financeRoutes.post("/import-preview", requirePermission("finance:import"), upload.single("file"), importPreviewController);
financeRoutes.post("/import", requirePermission("finance:import"), upload.single("file"), importExcelController);
financeRoutes.post("/import-template", requirePermission("finance:import"), upload.single("file"), importTemplateController);
financeRoutes.post("/reset-business-data", requirePermission("finance:reset"), resetBusinessDataController);
financeRoutes.post("/import-batches/:id/rollback", requirePermission("finance:rollback"), rollbackImportBatchController);
financeRoutes.get("/agent/rules", requirePermission("settings:read"), agentRulesController);
