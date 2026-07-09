import { Router } from "express";
import multer from "multer";
import { requirePermission } from "../middleware/rbac.middleware.js";
import {
  agentRulesController,
  authContextController,
  dashboardController,
  importBatchesController,
  importExcelController,
  importPreviewController,
  importTemplateController,
  listLedgerController,
  monthsController,
  parameterRulesController,
  rawLedgerLinesController,
  rollbackImportBatchController,
  summaryController,
  updateParameterRuleController
} from "../controllers/finance.controller.js";

export const financeRoutes = Router();
const upload = multer({ storage: multer.memoryStorage() });

financeRoutes.get("/ledger", listLedgerController);
financeRoutes.get("/auth-context", authContextController);
financeRoutes.get("/summary", summaryController);
financeRoutes.get("/dashboard", dashboardController);
financeRoutes.get("/months", monthsController);
financeRoutes.get("/parameter-rules", parameterRulesController);
financeRoutes.put("/parameter-rules/:ruleKey", requirePermission("rules:write"), updateParameterRuleController);
financeRoutes.get("/import-batches", importBatchesController);
financeRoutes.get("/raw-ledger-lines", rawLedgerLinesController);
financeRoutes.post("/import-preview", upload.single("file"), importPreviewController);
financeRoutes.post("/import", requirePermission("finance:import"), upload.single("file"), importExcelController);
financeRoutes.post("/import-template", requirePermission("finance:import"), upload.single("file"), importTemplateController);
financeRoutes.post("/import-batches/:id/rollback", requirePermission("finance:rollback"), rollbackImportBatchController);
financeRoutes.get("/agent/rules", agentRulesController);
