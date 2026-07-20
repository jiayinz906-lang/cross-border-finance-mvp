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

financeRoutes.get("/ledger", listLedgerController);
financeRoutes.get("/auth-context", authContextController);
financeRoutes.get("/summary", summaryController);
financeRoutes.get("/dashboard", dashboardController);
financeRoutes.get("/months", monthsController);
financeRoutes.get("/parameter-rules", parameterRulesController);
financeRoutes.put("/parameter-rules/:ruleKey", requirePermission("rules:write"), updateParameterRuleController);
financeRoutes.get("/import-templates", importTemplatesController);
financeRoutes.get("/import-batches", importBatchesController);
financeRoutes.get("/import-batches/:id/source", importBatchSourceController);
financeRoutes.get("/raw-ledger-lines", rawLedgerLinesController);
financeRoutes.get("/charge-lines", chargeLinesController);
financeRoutes.post("/import-preview", upload.single("file"), importPreviewController);
financeRoutes.post("/import", requirePermission("finance:import"), upload.single("file"), importExcelController);
financeRoutes.post("/import-template", requirePermission("finance:import"), upload.single("file"), importTemplateController);
financeRoutes.post("/reset-business-data", requirePermission("finance:reset"), resetBusinessDataController);
financeRoutes.post("/import-batches/:id/rollback", requirePermission("finance:rollback"), rollbackImportBatchController);
financeRoutes.get("/agent/rules", agentRulesController);
