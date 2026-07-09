import { Router } from "express";
import multer from "multer";
import {
  agentRulesController,
  dashboardController,
  importBatchesController,
  importExcelController,
  importPreviewController,
  importTemplateController,
  listLedgerController,
  monthsController,
  rollbackImportBatchController,
  summaryController
} from "../controllers/finance.controller.js";

export const financeRoutes = Router();
const upload = multer({ storage: multer.memoryStorage() });

financeRoutes.get("/ledger", listLedgerController);
financeRoutes.get("/summary", summaryController);
financeRoutes.get("/dashboard", dashboardController);
financeRoutes.get("/months", monthsController);
financeRoutes.get("/import-batches", importBatchesController);
financeRoutes.post("/import-preview", upload.single("file"), importPreviewController);
financeRoutes.post("/import", upload.single("file"), importExcelController);
financeRoutes.post("/import-template", upload.single("file"), importTemplateController);
financeRoutes.post("/import-batches/:id/rollback", rollbackImportBatchController);
financeRoutes.get("/agent/rules", agentRulesController);
